/**
 * 统一的 AI 上下文构建器。
 * 全屏对话和紧凑面板共享同一份上下文；支持按需开关各组成（角色/大纲/概述/前情），
 * 并返回估算大小供界面展示。
 */
import { ref, watch } from 'vue'
import * as api from '../api/files'
import { useSettingsStore } from '../stores/settings'

interface ContextInfo { label: string; content: string; count: number }

const CURRENT_FILE_MAX = 8000
const DIR_FILE_MAX = 4000
// 角色/大纲目录内容总量上限（防止几十张角色卡把上下文撑爆）
const DIR_TOTAL_MAX = 30000
const SUMMARY_MAX = 1000
const TAIL_MAX = 500
// 整份上下文的总预算（字符），超出时按优先级截断：前情/当前文件 > 角色 > 大纲 > 概述
const TOTAL_CONTEXT_MAX = 60000

export function useAiContext(
  projectRoot: () => string | undefined,
  filePath: () => string | undefined,
  fileContent: () => string | undefined,
  fileName: () => string | undefined,
) {
  const settings = useSettingsStore()
  const contextLabel = ref('')
  /** 上下文各组成的可用数量（供开关 chip 显示「角色设定 (3)」；为空时 UI 禁用开关） */
  const contextCounts = ref({ roles: 0, outlines: 0, project: 0, recap: 0 })

  async function refreshCounts(root: string) {
    const counts = { roles: 0, outlines: 0, project: 0, recap: 0 }
    const norm = root.replace(/\\/g, '/')
    try {
      const entries = await api.listDir(`${norm}/角色`)
      counts.roles = (entries || []).filter((e: any) => !e.isDir).length
    } catch { /* 无角色目录 */ }
    try {
      const entries = await api.listDir(`${norm}/大纲`)
      counts.outlines = (entries || []).filter((e: any) => !e.isDir).length
    } catch { /* 无大纲目录 */ }
    try {
      const md = await api.readFile(`${norm}/_project.md`)
      counts.project = md.trim() ? 1 : 0
    } catch { /* 无项目概述 */ }
    try {
      const order = await orderedChapters(root)
      const idx = order.findIndex((f) => f.path === filePath())
      if (idx > 0) counts.recap = Math.min(idx, settings.aiContextOptions.recapChapters)
    } catch { /* ignore */ }
    contextCounts.value = counts
  }
  async function collectDir(root: string, dirName: string, label: string): Promise<ContextInfo | null> {
    const dirPath = `${root.replace(/\\/g, '/')}/${dirName}`
    let entries: any[]
    try { entries = await api.listDir(dirPath) } catch { return null }
    const files = (entries || []).filter((e: any) => !e.isDir)
    if (files.length === 0) return null
    // 并发读取（限 8 路），保持文件顺序；单文件与目录总量都设上限
    const results = new Array<string>(files.length).fill('')
    let budget = DIR_TOTAL_MAX
    let next = 0
    const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
      while (true) {
        const i = next++
        if (i >= files.length || budget <= 0) return
        const f = files[i]
        try {
          const c = await api.readFile(f.path)
          const part = c.slice(0, Math.min(DIR_FILE_MAX, budget))
          budget -= part.length
          results[i] = part ? `## ${f.name}\n${part}` : ''
        } catch { /* skip */ }
      }
    })
    await Promise.all(workers)
    const contents = results.filter(Boolean)
    return { label: `${label}(${files.length})`, content: contents.join('\n\n'), count: files.length }
  }

  async function collectProjectOverview(root: string): Promise<ContextInfo | null> {
    try {
      const md = await api.readFile(`${root.replace(/\\/g, '/')}/_project.md`)
      if (!md.trim()) return null
      return { label: '📋 项目概述', content: md, count: 1 }
    } catch {
      return null
    }
  }

  /** 按展示顺序展平树中的所有章节文件 */
  async function orderedChapters(root: string): Promise<{ path: string; name: string }[]> {
    const entries = await api.listDir(root)
    const flat: any[] = []
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        if (!n.isDir) flat.push(n)
        if (n.children) walk(n.children)
      }
    }
    walk(entries)
    return flat
      .filter((n: any) => /\.(md|txt)$/i.test(n.name) && !n.name.startsWith('_'))
      .map((n: any) => ({ path: n.path, name: n.name }))
  }

  /**
   * 前情提要：当前章节之前的最近 N 章。
   * 优先读 .summaries/<章名>.md（用户/后续功能生成的摘要），
   * 没有摘要时退化为章节末尾片段，保证开箱即用。
   */
  async function collectRecap(
    root: string,
    currentPath: string | undefined,
    chapters: number,
  ): Promise<ContextInfo | null> {
    if (!currentPath || chapters <= 0) return null
    const normRoot = root.replace(/\\/g, '/')

    let order: { path: string; name: string }[]
    try {
      order = await orderedChapters(root)
    } catch {
      return null
    }

    const idx = order.findIndex((f) => f.path === currentPath)
    if (idx <= 0) return null
    const prev = order.slice(Math.max(0, idx - chapters), idx).reverse()

    const parts: string[] = []
    let usedSummary = 0
    for (const ch of prev) {
      const stem = ch.name.replace(/\.(md|txt)$/i, '')
      let content = ''
      try {
        const summary = await api.readFile(`${normRoot}/.summaries/${stem}.md`)
        if (summary.trim()) {
          content = summary.slice(0, SUMMARY_MAX)
          usedSummary++
        }
      } catch { /* 无摘要文件 */ }
      if (!content) {
        try {
          // 只读末尾字节（UTF-8 对齐），避免整章读盘再切片
          const tail = (await api.readFileTail(ch.path, TAIL_MAX * 4)).slice(-TAIL_MAX).trim()
          if (tail) content = `（章尾片段）\n${tail}`
        } catch { /* skip */ }
      }
      if (content) parts.push(`## ${ch.name}\n${content}`)
    }
    if (parts.length === 0) return null
    return {
      label: `前情(${parts.length}章${usedSummary > 0 ? `·摘要${usedSummary}` : ''})`,
      content: parts.join('\n\n'),
      count: parts.length,
    }
  }

  async function build(): Promise<{ prompt: string; label: string; chars: number; truncated: boolean }> {
    const opts = settings.aiContextOptions
    const root = projectRoot()
    if (!root) return { prompt: '', label: '', chars: 0, truncated: false }

    // 轻量计数（无论开关状态）：供开关 chip 显示可用数量/禁用空项
    void refreshCounts(root)
    // 按最终 prompt 里的顺序收集各组成（前情在前，让 AI 先「回忆」再处理当前内容）
    const items: { label: string; content: string }[] = []
    if (opts.recap) {
      const recap = await collectRecap(root, filePath(), opts.recapChapters)
      if (recap) items.push({ label: recap.label, content: `前情提要（最近章节）:\n${recap.content}` })
    }
    // 当前文件（最新内容，最多 8000 字）
    const content = fileContent()
    const name = fileName()
    if (content && name) {
      items.push({
        label: content.length > CURRENT_FILE_MAX ? '📄 当前文件(已截断至前8000字)' : '📄 当前文件',
        content: `当前文件: ${name}\n\`\`\`\n${content.slice(0, CURRENT_FILE_MAX)}\n\`\`\``,
      })
    }
    if (opts.roles) {
      const chars = await collectDir(root, '角色', '角色')
      if (chars) items.push({ label: chars.label, content: `角色设定:\n${chars.content}` })
    }
    if (opts.outlines) {
      const outlines = await collectDir(root, '大纲', '大纲')
      if (outlines) items.push({ label: outlines.label, content: `大纲:\n${outlines.content}` })
    }
    if (opts.project) {
      const proj = await collectProjectOverview(root)
      if (proj) items.push({ label: proj.label, content: `项目概述:\n${proj.content}` })
    }

    // 总预算：超出时截断靠后的（低优先级）部分，避免上下文撑爆模型窗口
    const parts: string[] = []
    const labels: string[] = []
    let total = 0
    let truncated = false
    for (const item of items) {
      const remaining = TOTAL_CONTEXT_MAX - total
      if (remaining <= 0) {
        labels.push(`${item.label}(省略)`);
        truncated = true
        continue
      }
      if (item.content.length > remaining) {
        parts.push(item.content.slice(0, remaining) + '\n…（超预算截断）')
        labels.push(`${item.label}(截断)`);
        truncated = true
        total = TOTAL_CONTEXT_MAX
        continue
      }
      parts.push(item.content)
      labels.push(item.label)
      total += item.content.length
    }

    const prompt = parts.join('\n\n---\n\n')
    return { prompt, label: labels.join('、'), chars: prompt.length, truncated }
  }

  // 项目/文件/选项变化时刷新标签（防抖，避免频繁读盘）
  let labelTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [projectRoot, filePath, () => settings.aiContextOptions],
    () => {
      if (labelTimer) clearTimeout(labelTimer)
      labelTimer = setTimeout(async () => {
        try {
          const { label, chars, truncated } = await build()
          contextLabel.value = label ? `上下文: ${label} · 约 ${(chars / 1000).toFixed(1)}k 字${truncated ? '·已截断' : ''}` : ''
        } catch {
          contextLabel.value = ''
        }
      }, 300)
    },
    { immediate: true },
  )

  return { build, contextLabel, contextCounts }
}
