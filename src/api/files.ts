import { invoke } from '@tauri-apps/api/core'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  children?: DirEntry[]
  wordCount?: number
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke('list_dir', { path })
}

export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path })
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content })
}

export async function createDir(path: string): Promise<void> {
  return invoke('create_dir', { path })
}

export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path })
}

export async function deletePath(path: string, projectRoot: string): Promise<void> {
  return invoke('delete_path', { path, projectRoot })
}

/** 直接删除文件（不进回收站，用于 .chatlog 等元数据清理） */
export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path })
}

export async function movePath(source: string, destDir: string): Promise<void> {
  return invoke('move_path', { source, destDir })
}

export async function renamePath(source: string, dest: string): Promise<void> {
  return invoke('rename_path', { source, dest })
}

export async function getProjectPath(): Promise<string> {
  return invoke('get_project_path')
}

export async function setProjectPath(path: string): Promise<void> {
  return invoke('set_project_path', { path })
}

export interface BackupEntry {
  path: string
  timestamp: number
}

export async function listBackups(filePath: string): Promise<BackupEntry[]> {
  return invoke('list_backups', { filePath })
}

export interface ImportFile {
  relPath: string
  base64Data: string
}

/** 外部拖入：把文件复制进项目目录，返回写入数量 */
export async function importFiles(destDir: string, files: ImportFile[]): Promise<number> {
  return invoke('import_files', { destDir, files })
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke('path_exists', { path })
}

/** 原生拖出：把文件拖到外部软件（复制语义），返回最终拖放效果值 */
export async function dragOutFiles(paths: string[]): Promise<number> {
  return invoke('drag_out_files', { paths })
}

/** 打开 WebView2 外部拖放开关（允许外部文件拖入与内部移动落回） */
export async function enableExternalDrop(): Promise<void> {
  return invoke('enable_external_drop')
}

