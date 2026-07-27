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
