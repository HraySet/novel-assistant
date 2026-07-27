/**
 * 统一的 AI 上下文构建器。
 * 全屏对话和紧凑面板共享同一份上下文，保证两个入口看到的角色/大纲深度一致。
 */
import { ref, watch } from 'vue'
import * as api from '../api/files'

interface ContextInfo { label: string; content: string }

export function useAiContext(projectRoot: () => string | undefined, fileContent: () => string | undefined, fileName: () => string | undefined) {
  const contextLabel = ref('')

  async function collectDir(root: string, dirName: string, label: string): Promise<ContextInfo | null> {
    const dirPath = `${root.replace(/\\/g, '/')}/${dirName}`
    let entries: any[]
    try { entries = await api.listDir(dirPath) } catch { return null }
    const files = (entries || []).filter((e: any) => !e.isDir)
    if (files.length === 0) return null
    const contents: string[] = []
    for (const f of files) {
      try {
        const c = await api.readFile(f.path)
        contents.push(`## ${f.name}\n${c}`)
      } catch { /* skip */ }
    }
    return { label: `${label}(${files.length})`, content: contents.join('\n\n') }
  }

  async function build(): Promise<{ prompt: string; label: string }> {
    const parts: string[] = []
    const labels: string[] = []
    const root = projectRoot()
    if (!root) return { prompt: '', label: '' }

    // 当前文件（完整内容，最多 8000 字）
    const content = fileContent()
    const name = fileName()
    if (content && name) {
      parts.push(`当前文件: ${name}\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``)
      labels.push('📄 当前文件')
    }

    // 角色目录
    const chars = await collectDir(root, '角色', '角色')
    if (chars) { parts.push(`角色设定:\n${chars.content}`); labels.push(chars.label) }

    // 大纲目录
    const outlines = await collectDir(root, '大纲', '大纲')
    if (outlines) { parts.push(`大纲:\n${outlines.content}`); labels.push(outlines.label) }

    // 项目概述
    try {
      const projMd = `${root.replace(/\\/g, '/')}/_project.md`
      const md = await api.readFile(projMd)
      if (md.trim()) {
        parts.push(`项目概述:\n${md}`)
        labels.push('📋 项目概述')
      }
    } catch { /* 没有 _project.md */ }

    return { prompt: parts.join('\n\n---\n\n'), label: labels.join('、') }
  }

  // 项目切换或文件变化时更新 label
  watch([projectRoot, fileContent], async () => {
    const { label } = await build()
    contextLabel.value = label ? `上下文: ${label}` : ''
  }, { immediate: true })

  return { build, contextLabel }
}
