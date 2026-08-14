export interface FileMeta {
  favorite?: boolean
  tags?: string[]
  isArchived?: boolean
  isDeleted?: boolean
  custom?: Record<string, unknown>
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  children?: FileNode[]
  parentPath?: string
  meta?: FileMeta
  /** 字数统计（仅文件，来自后端 list_dir） */
  wordCount?: number
}

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  isPinned?: boolean
}

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  nodePath: string
  nodeType: 'file' | 'dir' | 'blank'
}

export interface DraftState {
  type: 'file' | 'dir'
  parentPath: string
  defaultName: string
}
