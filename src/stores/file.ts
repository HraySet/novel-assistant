import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/files'

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

const EXPANDED_STORAGE_PREFIX = 'file-tree-expanded:'

function joinPath(parentPath: string, name: string) {
  const sep = parentPath.includes('\\') ? '\\' : '/'
  if (!parentPath) return name
  return parentPath.endsWith(sep) ? `${parentPath}${name}` : `${parentPath}${sep}${name}`
}

function dirname(path: string) {
  const separator = path.includes('\\') ? '\\' : '/'
  const idx = path.lastIndexOf(separator)
  return idx > 0 ? path.slice(0, idx) : ''
}

function normalizeTree(nodes: FileNode[], parentPath = ''): FileNode[] {
  return nodes.map((node) => ({
    ...node,
    parentPath: node.parentPath || parentPath,
    meta: node.meta ?? {},
    children: node.children && node.children.length > 0 ? normalizeTree(node.children, node.path) : undefined,
  }))
}

function getExpandedStorageKey(projectPath: string) {
  return `${EXPANDED_STORAGE_PREFIX}${projectPath}`
}

export const useFileStore = defineStore('file', () => {
  const tree = ref<FileNode[]>([])
  const openFile = ref<OpenFile | null>(null)
  const openFiles = ref<OpenFile[]>([])
  const openHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const selectedPath = ref<string | null>(null)
  const expandedPaths = ref<string[]>([])
  const projectRoot = ref<string>('')

  function loadExpandedState(nextProjectRoot: string) {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(getExpandedStorageKey(nextProjectRoot))
      expandedPaths.value = stored ? JSON.parse(stored) : []
    } catch {
      expandedPaths.value = []
    }
  }

  function persistExpandedState() {
    if (typeof window === 'undefined' || !projectRoot.value) return
    window.localStorage.setItem(getExpandedStorageKey(projectRoot.value), JSON.stringify(expandedPaths.value))
  }

  function setTree(nodes: FileNode[], currentProjectPath = projectRoot.value) {
    tree.value = normalizeTree(nodes)
    if (currentProjectPath) {
      projectRoot.value = currentProjectPath
      loadExpandedState(currentProjectPath)
    }
  }

  function setProjectRoot(path: string) {
    projectRoot.value = path
    loadExpandedState(path)
  }

  function toggleExpanded(path: string) {
    const exists = expandedPaths.value.includes(path)
    expandedPaths.value = exists
      ? expandedPaths.value.filter((item) => item !== path)
      : [...expandedPaths.value, path]
    persistExpandedState()
  }

  function expandPath(path: string) {
    if (!expandedPaths.value.includes(path)) {
      expandedPaths.value = [...expandedPaths.value, path]
      persistExpandedState()
    }
  }

  function isExpanded(path: string) {
    return expandedPaths.value.includes(path)
  }

  function setSelectedPath(path: string | null) {
    selectedPath.value = path
  }

  function setOpenFile(file: OpenFile) {
    openFile.value = file
    selectedPath.value = file.path

    const existingIndex = openFiles.value.findIndex((item) => item.path === file.path)
    if (existingIndex >= 0) {
      openFiles.value[existingIndex] = file
    } else {
      openFiles.value = [...openFiles.value, file]
    }

    const lastPath = openHistory.value[openHistory.value.length - 1]
    if (lastPath !== file.path) {
      openHistory.value = [...openHistory.value, file.path]
      historyIndex.value = openHistory.value.length - 1
    }
  }

  function updateActiveFile(patch: Partial<OpenFile>) {
    if (!openFile.value) return
    const nextFile = { ...openFile.value, ...patch }
    openFile.value = nextFile

    const index = openFiles.value.findIndex((item) => item.path === nextFile.path)
    if (index >= 0) {
      openFiles.value[index] = nextFile
    }
  }

  function closeFile(path: string) {
    openFiles.value = openFiles.value.filter((item) => item.path !== path)
    if (openFile.value?.path === path) {
      openFile.value = openFiles.value[0] ?? null
      selectedPath.value = openFile.value?.path ?? null
    }
  }

  async function loadTree(currentProjectPath = projectRoot.value) {
    if (!currentProjectPath) return []
    const entries = await api.listDir(currentProjectPath)
    setTree(entries, currentProjectPath)
    return tree.value
  }

  async function createFile(parentPath: string, name: string) {
    const filePath = joinPath(parentPath, name)
    await api.createFile(filePath)
    expandPath(parentPath)
    await loadTree(projectRoot.value)
    return filePath
  }

  async function createDir(parentPath: string, name: string) {
    const dirPath = joinPath(parentPath, name)
    await api.createDir(dirPath)
    expandPath(parentPath)
    await loadTree(projectRoot.value)
    return dirPath
  }

  async function deletePath(path: string) {
    await api.deletePath(path)
    await loadTree(projectRoot.value)
    if (openFile.value?.path === path) {
      openFile.value = null
      selectedPath.value = null
    }
    openFiles.value = openFiles.value.filter((item) => item.path !== path)
  }

  async function renamePath(path: string, newName: string) {
    const parent = dirname(path)
    const newPath = joinPath(parent, newName)
    await api.renamePath(path, newPath)
    await loadTree(projectRoot.value)

    if (openFile.value?.path === path) {
      openFile.value = { ...openFile.value, path: newPath, name: newName }
      selectedPath.value = newPath
    }

    openFiles.value = openFiles.value.map((item) => item.path === path ? { ...item, path: newPath, name: newName } : item)
    openHistory.value = openHistory.value.map((item) => item === path ? newPath : item)

    return newPath
  }

  async function movePath(source: string, destDir: string) {
    await api.movePath(source, destDir)
    await loadTree(projectRoot.value)
  }

  function goBack(): string | null {
    if (historyIndex.value > 0) {
      historyIndex.value--
      return openHistory.value[historyIndex.value]
    }
    return null
  }

  function goForward(): string | null {
    if (historyIndex.value < openHistory.value.length - 1) {
      historyIndex.value++
      return openHistory.value[historyIndex.value]
    }
    return null
  }

  function hasBack(): boolean {
    return historyIndex.value > 0
  }

  function hasForward(): boolean {
    return historyIndex.value < openHistory.value.length - 1
  }

  return {
    tree,
    openFile,
    openFiles,
    openHistory,
    historyIndex,
    selectedPath,
    expandedPaths,
    projectRoot,
    setTree,
    setProjectRoot,
    setSelectedPath,
    setOpenFile,
    updateActiveFile,
    closeFile,
    loadTree,
    createFile,
    createDir,
    deletePath,
    renamePath,
    movePath,
    toggleExpanded,
    expandPath,
    isExpanded,
    goBack,
    goForward,
    hasBack,
    hasForward,
  }
})
