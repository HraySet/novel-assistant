import { invoke } from '@tauri-apps/api/core'

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  children?: DirEntry[]
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

export async function getProjectPath(): Promise<string> {
  return invoke('get_project_path')
}

export async function setProjectPath(path: string): Promise<void> {
  return invoke('set_project_path', { path })
}
