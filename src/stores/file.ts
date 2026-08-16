import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/files'
import type { FileNode, OpenFile, ContextMenuState, DraftState } from '../types/file'
import { useStatsStore } from './stats'
import { countWords } from '../utils/countWords'

const EXPANDED_STORAGE_PREFIX = 'file-tree-expanded:'
const FAVORITES_STORAGE_PREFIX = 'file-favorites:'

// ── 自然排序（数字感知）：第1章 < 第2章 < 第10章，而非字典序 ──
let _naturalCollator: Intl.Collator | null = null

function getNaturalCollator(): Intl.Collator {
  if (!_naturalCollator) {
    _naturalCollator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }
  return _naturalCollator
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  const collator = getNaturalCollator()
  return nodes.sort((a, b) => {
    // 文件夹始终排在文件前面
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return collator.compare(a.name, b.name)
  })
}

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
  const normalized = nodes.map((node) => ({
    ...node,
    parentPath: node.parentPath || parentPath,
    meta: node.meta ?? {},
    children: node.children && node.children.length > 0
      ? normalizeTree(node.children, node.path)
      : undefined,
  }))
  // 每层应用自然排序
  return sortNodes(normalized)
}

function getExpandedStorageKey(projectPath: string) {
  return `${EXPANDED_STORAGE_PREFIX}${projectPath}`
}

export const useFileStore = defineStore('file', () => {
  const stats = useStatsStore()

  // ── Core state ──
  const tree = ref<FileNode[]>([])
  const openFile = ref<OpenFile | null>(null)
  const openFiles = ref<OpenFile[]>([])
  const openHistory = ref<string[]>([])
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
  // 收藏路径集合（以 projectRoot 为 key 持久化到 localStorage）
  const favoritePaths = ref<Set<string>>(new Set())

  // ── 编辑器内容提供者 ──
  // 编辑器挂载时注册一个按需读取的函数，保存 / 切换文件 / 构建 AI 上下文时
  // 才序列化当前文档，避免每次按键都把整篇文档拷贝进 store。
  const contentProviders = new Map<string, () => string>()

  function registerContentProvider(path: string, get: () => string) {
    contentProviders.set(path, get)
  }

  function unregisterContentProvider(path: string) {
    contentProviders.delete(path)
  }

  /** 读取文件最新内容：优先当前编辑器文档，兜底 store 里最近一次同步的内容 */
  function getLatestContent(path: string): string {
    const get = contentProviders.get(path)
    if (get) return get()
    return openFiles.value.find((f) => f.path === path)?.content ?? ''
  }

  // ── Favorites persistence ──

  function loadFavorites(projectPath: string) {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_PREFIX + projectPath)
      favoritePaths.value = stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      favoritePaths.value = new Set()
    }
  }

  function persistFavorites() {
    if (typeof window === 'undefined' || !projectRoot.value) return
    window.localStorage.setItem(
      FAVORITES_STORAGE_PREFIX + projectRoot.value,
      JSON.stringify([...favoritePaths.value]),
    )
  }

  function isFavorite(path: string): boolean {
    return favoritePaths.value.has(path)
  }

  function toggleFavorite(path: string) {
    const next = new Set(favoritePaths.value)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    favoritePaths.value = next
    persistFavorites()
  }

  // ── Collapse all ──

  function collapseAll() {
    expandedPaths.value = []
    persistExpandedState()
  }

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

  /** 重命名/移动后，把收藏、展开状态与统计快照按新路径迁移 */
  function remapPersistedState(mapper: (p: string) => string) {
    favoritePaths.value = new Set([...favoritePaths.value].map(mapper))
    persistFavorites()
    expandedPaths.value = expandedPaths.value.map(mapper)
    persistExpandedState()
    stats.remapChapterSnapshots(mapper)
  }

  // ── Tree management ──

  function setTree(nodes: FileNode[], currentProjectPath = projectRoot.value) {
    tree.value = normalizeTree(nodes)
    if (currentProjectPath) {
      projectRoot.value = currentProjectPath
      loadExpandedState(currentProjectPath)
      loadFavorites(currentProjectPath)
    }
  }

  function setProjectRoot(path: string) {
    projectRoot.value = path
    loadExpandedState(path)
    loadFavorites(path)
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
    }
    persistOpenTabs()
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
    persistOpenTabs()
  }

  // ── 标签页持久化与快捷键操作 ──

  /** 记录打开的标签页列表（含活动标签），重启后恢复 */
  function persistOpenTabs() {
    if (typeof window === 'undefined' || !projectRoot.value) return
    try {
      localStorage.setItem(
        'open-tabs:' + projectRoot.value,
        JSON.stringify({ paths: openFiles.value.map((f) => f.path), active: openFile.value?.path ?? null }),
      )
    } catch { /* 忽略 */ }
  }

  /** 恢复上次会话打开的标签页（最多 8 个，逐个读盘，失败的跳过） */
  async function restoreOpenTabs() {
    if (typeof window === 'undefined' || !projectRoot.value) return
    let saved: { paths?: string[]; active?: string | null } = {}
    try {
      saved = JSON.parse(localStorage.getItem('open-tabs:' + projectRoot.value) || '{}')
    } catch {
      return
    }
    const paths = Array.isArray(saved.paths) ? saved.paths.slice(0, 8) : []
    for (const p of paths) {
      if (openFiles.value.some((f) => f.path === p)) continue
      try {
        const content = await api.readFile(p)
        const name = p.split(/[/\\]/).pop() || p
        setOpenFile({ path: p, name, content, isDirty: false })
      } catch { /* 文件已不存在 */ }
    }
    if (saved.active && openFiles.value.some((f) => f.path === saved.active)) {
      const active = openFiles.value.find((f) => f.path === saved.active)!
      setOpenFile(active)
      stats.syncChapterSnapshot(active.path, countWords(active.content))
    }
    // 恢复出来的标签不污染后退/前进历史
    openHistory.value = openFile.value ? [openFile.value.path] : []
  }

  /** Ctrl+W：保存并关闭当前标签 */
  async function closeActiveTab() {
    const f = openFile.value
    if (!f) return
    if (f.isDirty) {
      // 保存失败（含写盘期间仍有新键入）时中止关闭，避免丢失未落盘内容
      const saved = await saveFile(f.path)
      if (!saved) return
    }
    closeFile(f.path)
  }

  /** Ctrl+Tab / Ctrl+Shift+Tab：循环切换标签 */
  async function cycleTab(delta: number) {
    if (openFiles.value.length < 2) return
    const idx = openFiles.value.findIndex((f) => f.path === openFile.value?.path)
    const next = (idx + delta + openFiles.value.length) % openFiles.value.length
    await handleFileSelect(openFiles.value[next].path)
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
    insertNodeLocally(parentPath, { name, path: filePath, isDir: false, wordCount: 0 })
    return filePath
  }

  async function createDir(parentPath: string, name: string) {
    const dirPath = joinPath(parentPath, name)
    await api.createDir(dirPath)
    expandPath(parentPath)
    insertNodeLocally(parentPath, { name, path: dirPath, isDir: true })
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
    persistOpenTabs() // 删除后同步标签持久化，避免重启后残留失效路径
  }

  async function renamePath(path: string, newName: string) {
    const parent = dirname(path)
    const newPath = joinPath(parent, newName)
    // 先把编辑器最新内容刷进 store：路径切换会用 store 内容重建编辑器，
    // 避免未保存的编辑在重命名后丢失
    const latest = openFile.value?.path === path ? getLatestContent(path) : null
    await api.renamePath(path, newPath)
    await loadTree(projectRoot.value)

    if (openFile.value?.path === path) {
      openFile.value = latest !== null
        ? { ...openFile.value, path: newPath, name: newName, content: latest }
        : { ...openFile.value, path: newPath, name: newName }
      selectedPath.value = newPath
    }

    openFiles.value = openFiles.value.map((item) => item.path === path
      ? (latest !== null ? { ...item, path: newPath, name: newName, content: latest } : { ...item, path: newPath, name: newName })
      : item)
    openHistory.value = openHistory.value.map((item) => item === path ? newPath : item)

    // 迁移收藏/展开状态与统计快照，避免旧路径成为孤儿数据
    const sep = path.includes('\\') ? '\\' : '/'
    remapPersistedState((p) =>
      p === path ? newPath : p.startsWith(path + sep) ? newPath + p.slice(path.length) : p,
    )

    return newPath
  }

  async function movePath(source: string, destDir: string) {
    // 先刷新编辑器最新内容，避免移动后路径切换用旧内容重建编辑器
    const active = openFile.value
    const latest = active ? getLatestContent(active.path) : null
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

    if (active) {
      const nextPath = getMovedPath(active.path)
      if (nextPath !== active.path) {
        openFile.value = { ...active, path: nextPath, content: latest ?? active.content }
      }
    }
    openFiles.value = openFiles.value.map((file) => {
      const next = { ...file, path: getMovedPath(file.path) }
      if (active && file.path === active.path && latest !== null) next.content = latest
      return next
    })
    openHistory.value = openHistory.value.map(getMovedPath)
    if (selectedPath.value) selectedPath.value = getMovedPath(selectedPath.value)

    // 迁移收藏/展开状态与统计快照
    remapPersistedState(getMovedPath)

    await loadTree(projectRoot.value)
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
    try {
      if (draft.value.type === 'file') {
        const filePath = await createFile(draft.value.parentPath, finalName)
        await handleFileSelect(filePath)
      } else {
        await createDir(draft.value.parentPath, finalName)
      }
    } catch (e) {
      console.error('创建失败:', e)
    } finally {
      draft.value = null
    }
  }

  function cancelDraft() {
    draft.value = null
  }

  // ── File select / click ──

  let selectSeq = 0

  async function handleFileSelect(path: string) {
    if (openFile.value?.path === path) return
    const seq = ++selectSeq

    // The editor updates `openFile` synchronously but persists changes on a
    // debounce. Persist the current file before replacing it so a quick file
    // switch cannot discard its pending changes.
    if (openFile.value?.isDirty) {
      const saved = await handleSave()
      if (!saved) return
    }

    try {
      const content = await api.readFile(path)
      // 快速连续切换文件时，作废旧读取，防止最终激活的文件由异步完成顺序决定
      if (seq !== selectSeq) return
      const name = path.split(/[/\\]/).pop() || path
      setOpenFile({ path, name, content, isDirty: false })
      stats.syncChapterSnapshot(path, countWords(content))
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
    const path = openFile.value.path
    try {
      const content = getLatestContent(path)
      await api.writeFile(path, content)
      // 写盘期间用户可能继续键入：以最新内容回写 store，避免旧快照覆盖编辑器丢字；
      // 仍不一致时保持脏标记，交由下一次自动保存兜底
      const latest = getLatestContent(path)
      const stillDirty = latest !== content
      if (openFile.value?.path === path) {
        updateActiveFile({ content: latest, isDirty: stillDirty })
      }
      stats.recordChapterEdit(path, countWords(content))
      return !stillDirty
    } catch (e) {
      console.error('保存失败:', e)
      return false
    }
  }

  /** 关闭应用前保存所有未保存的已打开文件 */
  async function saveAllDirty(): Promise<boolean> {
    const dirtyFiles = openFiles.value.filter((f) => f.isDirty)
    let ok = true
    for (const f of dirtyFiles) {
      const saved = await saveFile(f.path)
      if (!saved) ok = false
    }
    return ok
  }

  // 保存任意已打开文件（不限于当前 active），用于关标签时保存非活动脏文件
  async function saveFile(path: string): Promise<boolean> {
    const file = openFiles.value.find(f => f.path === path)
    if (!file) return false
    try {
      const content = getLatestContent(path)
      await api.writeFile(path, content)
      // 写盘期间可能继续键入：以最新内容回写，不一致则保持脏标记
      const latest = getLatestContent(path)
      const stillDirty = latest !== content
      // 同步标记为干净
      if (openFile.value?.path === path) {
        updateActiveFile({ content: latest, isDirty: stillDirty })
      } else {
        const idx = openFiles.value.findIndex(f => f.path === path)
        if (idx >= 0) {
          openFiles.value[idx] = { ...openFiles.value[idx], content: latest, isDirty: stillDirty }
        }
      }
      stats.recordChapterEdit(path, countWords(content))
      return !stillDirty
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

  /** 本地增量插入节点，不触发全量 loadTree */
  function insertNodeLocally(parentPath: string, node: FileNode) {
    // 根目录直接插入
    if (!parentPath || parentPath === projectRoot.value) {
      tree.value.push(node)
      tree.value = sortNodes([...tree.value])
      return
    }

    const parent = findNode(parentPath)
    if (parent) {
      if (!parent.children) parent.children = []
      parent.children.push(node)
      parent.children = sortNodes([...parent.children])
      return
    }

    // 兜底：找不到父节点（不应该发生）走全量刷新
    loadTree()
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

  // ── 文件状态查询（供树节点渲染使用） ──

  /** 检查文件是否已打开 */
  function isFileOpen(path: string): boolean {
    return openFiles.value.some(f => f.path === path)
  }

  /** 检查已打开文件是否有未保存的修改 */
  function isFileDirty(path: string): boolean {
    const f = openFiles.value.find(f => f.path === path)
    return f?.isDirty ?? false
  }

  return {
    // Core state
    tree,
    openFile,
    openFiles,
    openHistory,
    selectedPath,
    expandedPaths,
    projectRoot,
    // UI state
    contextMenu,
    renamingPath,
    draft,
    dragSource,
    favoritePaths,
    // Tree management
    setTree,
    setProjectRoot,
    setSelectedPath,
    handleDirectoryClick,
    setOpenFile,
    updateActiveFile,
    closeFile,
    closeActiveTab,
    cycleTab,
    restoreOpenTabs,
    loadTree,
    createFile,
    createDir,
    deletePath,
    renamePath,
    movePath,
    toggleExpanded,
    expandPath,
    isExpanded,
    collapseAll,
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
    saveAllDirty,
    registerContentProvider,
    unregisterContentProvider,
    getLatestContent,
    // Favorites
    isFavorite,
    toggleFavorite,
    // File status
    isFileOpen,
    isFileDirty,
    // Utilities
    getChildrenOf,
    findNode,
    getUniqueName,
  }
})

// 开发模式 HMR：store 改动时热替换定义，避免新旧实例混用导致运行时崩溃
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFileStore, import.meta.hot))
}
