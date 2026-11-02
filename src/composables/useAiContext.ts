/**
 * AI 上下文构建器：把项目资料拼成一段提示词，并给出估算用量。
 *
 * 职责边界：**只做组装与预算分配**。读盘、遍历、目录预算截断统一走
 * `projectDocs`（与一致性检测共用同一套），避免两套实现看到不同的项目世界。
 */
import { ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import {
  CONTEXT_BUDGETS,
  countDirDocs,
  listChapterFiles,
  readDirDocs,
  readOverview,
  readRecap,
  resolveSettingDir,
} from './projectDocs'

export function useAiContext(
  projectRoot: () => string | undefined,
  filePath: () => string | undefined,
  fileContent: () => string | undefined,
  fileName: () => string | undefined,
) {
  const settings = useSettingsStore()
  const contextLabel = ref('')
  /** 上下文各组成的可用数量（供开关 chip 显示「角色设定 (3)」；为 0 时 UI 禁用开关） */
  const contextCounts = ref({ roles: 0, outlines: 0, project: 0, recap: 0 })

  /** 轻量计数：只数文件，不读内容 */
  async function refreshCounts(root: string): Promise<void> {
    const recapChapters = settings.aiContextOptions.recapChapters
    // 设定目录名可能是别名，先解析
    const [charDir, outlineDir] = await Promise.all([
      resolveSettingDir(root, '角色'),
      resolveSettingDir(root, '大纲'),
    ])
    const [roles, outlines, overview] = await Promise.all([
      countDirDocs(root, charDir),
      countDirDocs(root, outlineDir),
      readOverview(root),
    ])
    let recap = 0
    try {
      const chapters = await listChapterFiles(root)
      const idx = chapters.findIndex((c) => c.path === filePath())
      if (idx > 0) recap = Math.min(idx, recapChapters)
    } catch {
      /* 章节列表读不到则不计 */
    }
    contextCounts.value = { roles, outlines, project: overview ? 1 : 0, recap }
  }

  async function build(): Promise<{ prompt: string; label: string; chars: number; truncated: boolean }> {
    const opts = settings.aiContextOptions
    const root = projectRoot()
    if (!root) return { prompt: '', label: '', chars: 0, truncated: false }

    // 计数不阻塞主流程：开关 chip 的数量只是提示
    void refreshCounts(root)

    // 按最终 prompt 里的顺序收集（前情在前，让模型先「回忆」再处理当前内容）
    const items: { label: string; content: string }[] = []

    if (opts.recap) {
      const recap = await readRecap(root, filePath(), opts.recapChapters)
      if (recap.length > 0) {
        const fromSummary = recap.filter((s) => s.source === 'summary').length
        const body = recap.map((s) => `## ${s.name}\n${s.content}`).join('\n\n')
        items.push({
          label: `前情(${recap.length}章${fromSummary > 0 ? `·摘要${fromSummary}` : ''})`,
          content: `前情提要（最近章节）:\n${body}`,
        })
      }
    }

    const content = fileContent()
    const name = fileName()
    if (content && name) {
      const truncatedAt = content.length > CONTEXT_BUDGETS.currentFile
      items.push({
        label: truncatedAt ? `📄 当前文件(已截断至前${CONTEXT_BUDGETS.currentFile}字)` : '📄 当前文件',
        content: `当前文件: ${name}\n\`\`\`\n${content.slice(0, CONTEXT_BUDGETS.currentFile)}\n\`\`\``,
      })
    }

    if (opts.roles) {
      const charDir = await resolveSettingDir(root, '角色')
      const docs = await readDirDocs(root, charDir)
      if (docs.length > 0) {
        items.push({
          label: `角色(${docs.length})`,
          content: `角色设定:\n${docs.map((d) => `## ${d.name}\n${d.content}`).join('\n\n')}`,
        })
      }
    }

    if (opts.outlines) {
      const outlineDir = await resolveSettingDir(root, '大纲')
      const docs = await readDirDocs(root, outlineDir)
      if (docs.length > 0) {
        items.push({
          label: `大纲(${docs.length})`,
          content: `大纲:\n${docs.map((d) => `## ${d.name}\n${d.content}`).join('\n\n')}`,
        })
      }
    }

    if (opts.project) {
      const overview = await readOverview(root)
      if (overview) items.push({ label: '📋 项目概述', content: `项目概述:\n${overview}` })
    }

    // 总预算：超出时截断靠后的（低优先级）部分，避免撑爆模型上下文窗口
    const parts: string[] = []
    const labels: string[] = []
    let total = 0
    let truncated = false
    for (const item of items) {
      const remaining = CONTEXT_BUDGETS.total - total
      if (remaining <= 0) {
        labels.push(`${item.label}(省略)`)
        truncated = true
        continue
      }
      if (item.content.length > remaining) {
        parts.push(item.content.slice(0, remaining) + '\n…（超预算截断）')
        labels.push(`${item.label}(截断)`)
        truncated = true
        total = CONTEXT_BUDGETS.total
        continue
      }
      parts.push(item.content)
      labels.push(item.label)
      total += item.content.length
    }

    const prompt = parts.join('\n\n---\n\n')
    return { prompt, label: labels.join('、'), chars: prompt.length, truncated }
  }

  // 项目 / 文件 / 选项变化时刷新标签（防抖，避免频繁读盘）
  let labelTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [projectRoot, filePath, () => settings.aiContextOptions],
    () => {
      if (labelTimer) clearTimeout(labelTimer)
      labelTimer = setTimeout(async () => {
        try {
          const { label, chars, truncated } = await build()
          contextLabel.value = label
            ? `上下文: ${label} · 约 ${(chars / 1000).toFixed(1)}k 字${truncated ? '·已截断' : ''}`
            : ''
        } catch {
          contextLabel.value = ''
        }
      }, 300)
    },
    { immediate: true },
  )

  return { build, contextLabel, contextCounts }
}
