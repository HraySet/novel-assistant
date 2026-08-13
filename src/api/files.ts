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

export async function deletePath(path: string): Promise<void> {
  return invoke('delete_path', { path })
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
