import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import * as api from '../api/files'
import { useToastStore } from '../stores/toast'
import type { FileNode } from '../types/file'

/** 展平文件树中所有可导出的章节文件（保持树顺序） */
export function collectFilePaths(nodes: FileNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) collectFilePaths(n.children, acc)
    } else if (/\.(md|txt)$/i.test(n.name)) {
      acc.push(n.path)
    }
  }
  return acc
}

/**
 * 导出合并：EPUB / Markdown / 纯文本（由用户在保存对话框中选择格式）。
 * 章节文件列表演算出合集，避免调用方各自维护遍历逻辑。
 */
export async function exportFiles(files: FileNode[], projectName: string): Promise<void> {
  const paths = collectFilePaths(files)
  if (paths.length === 0) return
  try {
    const destPath = await save({
      defaultPath: `${projectName}.epub`,
      filters: [
        { name: 'EPUB 电子书', extensions: ['epub'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] },
      ],
    })
    if (!destPath) return
    if (destPath.toLowerCase().endsWith('.epub')) {
      await api.exportEpub(paths, destPath, projectName)
    } else {
      const withTitles = destPath.toLowerCase().endsWith('.md')
      await invoke('export_project', { paths, destPath, withTitles })
    }
    useToastStore().push('success', '导出完成', destPath.split(/[\\/]/).pop() || destPath)
  } catch (e) {
    console.error('导出失败:', e)
    useToastStore().push('error', '导出失败', e instanceof Error ? e.message : String(e), 4000)
  }
}
