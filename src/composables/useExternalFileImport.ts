import { invoke } from '@tauri-apps/api/core'
import { useFileStore } from '../stores/file'
import { useToastStore } from '../stores/toast'

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 单文件 100MB 上限，防止误拖大文件卡死
const MAX_TOTAL_BYTES = 500 * 1024 * 1024 // 单次拖入总量 500MB 上限，防内存膨胀

interface DroppedFile {
  relPath: string
  base64Data: string
}

/** Uint8Array → base64（分块避免参数栈溢出） */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      // readEntries 每次最多返回 100 条，需循环读取
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
        } else {
          all.push(...batch)
          readBatch()
        }
      }, reject)
    }
    readBatch()
  })
}

async function walkEntry(
  entry: FileSystemEntry,
  parentRel: string,
  out: { relPath: string; bytes: Uint8Array }[],
): Promise<void> {
  const rel = parentRel ? `${parentRel}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await entryFile(entry as FileSystemFileEntry)
    if (file.size > MAX_FILE_BYTES) return
    out.push({ relPath: rel, bytes: new Uint8Array(await file.arrayBuffer()) })
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    for (const child of children) {
      await walkEntry(child, rel, out)
    }
  }
}

/** 读取拖入的所有文件（含文件夹递归）。优先 webkitGetAsEntry，退化到 files 列表 */
export async function collectDroppedFiles(dt: DataTransfer): Promise<{ relPath: string; bytes: Uint8Array }[]> {
  const out: { relPath: string; bytes: Uint8Array }[] = []
  const entries: FileSystemEntry[] = []

  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i] as unknown as { webkitGetAsEntry?: () => FileSystemEntry | null }
      const entry = item.webkitGetAsEntry?.()
      if (entry) entries.push(entry)
    }
  }

  if (entries.length === 0) {
    for (const f of Array.from(dt.files)) {
      if (f.size > MAX_FILE_BYTES) continue
      out.push({ relPath: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
    }
    return out
  }

  await Promise.all(entries.map((e) => walkEntry(e, '', out)))

  // 总量上限：从尾部截掉超出部分（先收集的先保留）
  let total = 0
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].bytes.length
    if (total > MAX_TOTAL_BYTES) out.splice(i, 1)
  }
  return out
}

/**
 * 把外部拖入的文件复制进 destDir（保留子目录结构，重名自动加序号），
 * 完成后刷新文件树并展开目标目录。返回导入数量。
 */
export async function importDroppedFilesInto(dt: DataTransfer, destDir: string): Promise<number> {
  const collected = await collectDroppedFiles(dt)
  if (collected.length === 0) return 0

  const files = collected.map((f) => ({ relPath: f.relPath, base64Data: bytesToBase64(f.bytes) }))
  try {
    const count = await invoke<number>('import_files', { destDir, files })
    if (count > 0) {
      const fileStore = useFileStore()
      fileStore.expandPath(destDir)
      await fileStore.loadTree(fileStore.projectRoot)
      useToastStore().push('success', `已导入 ${count} 个文件`)
    }
    return count
  } catch (e) {
    console.error('导入文件失败:', e)
    useToastStore().push('error', '导入失败', e instanceof Error ? e.message : String(e), 4000)
    return 0
  }
}
