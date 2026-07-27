import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/files'
import type { FileNode, OpenFile, ContextMenuState, DraftState } from '../types/file'

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
  // ── Core state ──
  const tree = ref<FileNode[]>([])
  const openFile = ref<OpenFile | null>(null)
  const openFiles = ref<OpenFile[]>([])
  const openHistory = ref<string[]>([])
  const historyIndex = ref(-1)
  const selectedPath = ref<string | null>(null)
  const expandedPaths = ref<string[]>([])
  const projectRoot = ref<string>('')

  // ── UI state ──
  const contextMenu = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    nodePath: '',
    nodeType: 'blank',
  })
  const renamingPath = ref<string | null>(null)
  const draft = ref<DraftState | null>(null)
  const dragSource = ref<string | null>(null)

  // ── Expanded state persistence ──

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

  // ── Tree management ──

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

  function handleDirectoryClick(path: string) {
    setSelectedPath(path)
    toggleExpanded(path)
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

  // ── Async file operations ──

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

    const separator = source.includes('\\') ? '\\' : '/'
    const name = source.split(/[/\\]/).pop() || source
    const movedRoot = joinPath(destDir, name)
    const sourcePrefix = `${source}${separator}`

    const getMovedPath = (path: string) => {
      if (path === source) return movedRoot
      if (path.startsWith(sourcePrefix)) return `${movedRoot}${path.slice(source.length)}`
      return path
    }

    if (openFile.value) {
      const nextPath = getMovedPath(openFile.value.path)
      if (nextPath !== openFile.value.path) {
        openFile.value = { ...openFile.value, path: nextPath }
      }
    }
    openFiles.value = openFiles.value.map((file) => ({ ...file, path: getMovedPath(file.path) }))
    openHistory.value = openHistory.value.map(getMovedPath)
    if (selectedPath.value) selectedPath.value = getMovedPath(selectedPath.value)

    await loadTree(projectRoot.value)
  }

  // ── Navigation ──

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

  // ── Context menu ──

  function openContextMenu(x: number, y: number, nodePath: string, nodeType: 'file' | 'dir' | 'blank') {
    contextMenu.value = { visible: true, x, y, nodePath, nodeType }
  }

  function closeContextMenu() {
    contextMenu.value = { visible: false, x: 0, y: 0, nodePath: '', nodeType: 'blank' }
  }

  // ── Rename ──

  function startRename(path: string) {
    renamingPath.value = path
  }

  async function confirmRename(newName: string) {
    const path = renamingPath.value
    if (!path || !newName.trim()) {
      renamingPath.value = null
      return
    }

    // Clear the editing state before the async filesystem operation so an
    // Enter key event followed by blur cannot submit the same rename twice.
    renamingPath.value = null
    const trimmed = newName.trim()
    const node = findNode(path)
    if (node && trimmed !== node.name) {
      await renamePath(path, trimmed)
    }
  }

  function cancelRename() {
    renamingPath.value = null
  }

  // ── Draft ──

  function startDraft(type: 'file' | 'dir', parentPath: string) {
    const defaultName = getUniqueName(type, parentPath)
    draft.value = { type, parentPath, defaultName }
  }

  async function confirmDraft(name: string) {
    if (!draft.value) return
    const finalName = name.trim() || draft.value.defaultName
    if (draft.value.type === 'file') {
      const filePath = await createFile(draft.value.parentPath, finalName)
      await handleFileSelect(filePath)
    } else {
      await createDir(draft.value.parentPath, finalName)
    }
    draft.value = null
  }

  function cancelDraft() {
    draft.value = null
  }

  // ── File select / click ──

  async function handleFileSelect(path: string) {
    if (openFile.value?.path === path) return

    // The editor updates `openFile` synchronously but persists changes on a
    // debounce. Persist the current file before replacing it so a quick file
    // switch cannot discard its pending changes.
    if (openFile.value?.isDirty) {
      const saved = await handleSave()
      if (!saved) return
    }

    try {
      const content = await api.readFile(path)
      const name = path.split(/[/\\]/).pop() || path
      setOpenFile({ path, name, content, isDirty: false })
    } catch (e) {
      console.error('读取文件失败:', e)
    }
  }

  function handleFileClick(path: string) {
    // 单击直接选中打开，重命名改为双击触发
    handleFileSelect(path)
  }

  // ── Drag & drop ──

  function setDragSource(path: string | null) {
    dragSource.value = path
  }

  async function handleDrop(source: string, destDir: string) {
    await movePath(source, destDir)
  }

  // ── Save ──

  async function handleSave(): Promise<boolean> {
    if (!openFile.value) return true
    try {
      await api.writeFile(openFile.value.path, openFile.value.content)
      updateActiveFile({ isDirty: false })
      return true
    } catch (e) {
      console.error('保存失败:', e)
      return false
    }
  }

  // 保存任意已打开文件（不限于当前 active），用于关标签时保存非活动脏文件
  async function saveFile(path: string): Promise<boolean> {
    const file = openFiles.value.find(f => f.path === path)
    if (!file) return false
    try {
      await api.writeFile(path, file.content)
      // 同步标记为干净
      if (openFile.value?.path === path) {
        updateActiveFile({ isDirty: false })
      } else {
        const idx = openFiles.value.findIndex(f => f.path === path)
        if (idx >= 0) {
          openFiles.value[idx] = { ...openFiles.value[idx], isDirty: false }
        }
      }
      return true
    } catch (e) {
      console.error('保存文件失败:', e)
      return false
    }
  }

  // ── Utilities ──

  function getChildrenOf(parentPath: string): FileNode[] {
    const findChildren = (nodes: FileNode[]): FileNode[] => {
      for (const node of nodes) {
        if (node.path === parentPath) return node.children ?? []
        if (node.children) {
          const found = findChildren(node.children)
          if (found.length || node.path === parentPath) return found
        }
      }
      return []
    }
    if (!parentPath || parentPath === projectRoot.value) return tree.value
    return findChildren(tree.value)
  }

  function findNode(path: string): FileNode | null {
    const search = (nodes: FileNode[]): FileNode | null => {
      for (const node of nodes) {
        if (node.path === path) return node
        if (node.children) {
          const found = search(node.children)
          if (found) return found
        }
      }
      return null
    }
    return search(tree.value)
  }

  function getUniqueName(type: 'file' | 'dir', parentPath: string): string {
    const ext = type === 'file' ? '.md' : ''
    const base = type === 'file' ? '未命名' : '未命名文件夹'
    const siblings = getChildrenOf(parentPath)
    const existing = new Set(siblings.map(n => n.name))
    if (!existing.has(base + ext)) return base + ext
    let i = 2
    while (existing.has(`${base} ${i}${ext}`)) i++
    return `${base} ${i}${ext}`
  }

  return {
    // Core state
    tree,
    openFile,
    openFiles,
    openHistory,
    historyIndex,
    selectedPath,
    expandedPaths,
    projectRoot,
    // UI state
    contextMenu,
    renamingPath,
    draft,
    dragSource,
    // Tree management
    setTree,
    setProjectRoot,
    setSelectedPath,
    handleDirectoryClick,
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
    // Navigation
    goBack,
    goForward,
    hasBack,
    hasForward,
    // Context menu
    openContextMenu,
    closeContextMenu,
    // Rename
    startRename,
    confirmRename,
    cancelRename,
    // Draft
    startDraft,
    confirmDraft,
    cancelDraft,
    // File select
    handleFileSelect,
    handleFileClick,
    // Drag & drop
    setDragSource,
    handleDrop,
    // Save
    handleSave,
    saveFile,
    // Utilities
    getChildrenOf,
    findNode,
    getUniqueName,
  }
})
