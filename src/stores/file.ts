import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/files'
import type { FileNode, OpenFile, ContextMenuState, DraftState } from '../types/file'
import { useStatsStore } from './stats'
import { useToastStore } from './toast'
import { countWords } from '../utils/countWords'
import { sanitizeFileName, compareChapterNames } from '../core/text'
import { basename, dirname, isInside, joinPath, remapPath, samePath } from '../core/paths'

const EXPANDED_STORAGE_PREFIX = 'file-tree-expanded:'
const FAVORITES_STORAGE_PREFIX = 'file-favorites:'

// ── 自然排序（数字感知）：第1章 < 第2章 < 第10章，而非字典序 ──
function sortNodes(nodes: FileNode[]): FileNode[] {
  return nodes.sort((a, b) => {
    // 文件夹始终排在文件前面
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    // 用 core/text 的比较器：Intl.Collator 的 numeric 只认阿拉伯数字，
    // 「第一章 / 第二章 / 第十章」会被按拼音排成 第二十·二·三·十一·十·一
    return compareChapterNames(a.name, b.name)
  })
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
  /** 历史版本弹窗请求（文件树右键直达；App 层消费后清空） */
  const historyTarget = ref<{ path: string; name: string } | null>(null)

  function requestHistory(path: string) {
    const name = path.split(/[/\\]/).pop() || path
    historyTarget.value = { path, name }
  }
  function clearHistoryTarget() {
    historyTarget.value = null
  }

  // 收藏路径集合（以 projectRoot 为 key 持久化到 localStorage）

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

  /**
   * 路径迁移的统一入口：打开的文件、后退历史、选区、历史版本目标、收藏、
   * 展开状态、统计快照一次性迁移，并重新落盘标签。
   *
   * 为什么必须集中在同一处：旧实现里只有 movePath 写了完整的前缀映射，
   * renamePath / deletePath 只做精确匹配——重命名一个目录后，目录内已打开的
   * 章节标签全部指向旧路径，保存时直接报「路径超出项目目录」。
   *
   * @param activeContent 路径变化前从编辑器取到的最新内容；迁移时补回，
   *                      避免用 store 里的旧快照重建编辑器而丢掉未保存的编辑
   */
  function applyPathRemap(
    mapper: (p: string) => string,
    activeContent?: string | null,
  ) {
    const remapFile = (f: OpenFile): OpenFile => {
      const nextPath = mapper(f.path)
      return nextPath === f.path ? f : { ...f, path: nextPath, name: basename(nextPath) }
    }

    const beforeActive = openFile.value?.path
    openFiles.value = openFiles.value.map(remapFile)
    if (openFile.value) {
      const next = remapFile(openFile.value)
      if (activeContent != null && next.path !== beforeActive) next.content = activeContent
      openFile.value = next
    }
    if (selectedPath.value) selectedPath.value = mapper(selectedPath.value)
    openHistory.value = openHistory.value.map(mapper)
    if (historyTarget.value) {
      const nextPath = mapper(historyTarget.value.path)
      historyTarget.value = { path: nextPath, name: basename(nextPath) }
    }

    remapPersistedState(mapper)
    persistOpenTabs()
  }

  /** 删除（文件或整棵目录）后的状态清理：把涉及的路径从所有列表中移除 */
  function dropPathsUnder(target: string) {
    const affected = (p: string) => samePath(p, target) || isInside(target, p)

    openFiles.value = openFiles.value.filter((f) => !affected(f.path))
    if (openFile.value && affected(openFile.value.path)) {
      openFile.value = openFiles.value[0] ?? null
    }
    if (selectedPath.value && affected(selectedPath.value)) {
      selectedPath.value = openFile.value?.path ?? null
    }
    openHistory.value = openHistory.value.filter((p) => !affected(p))
    if (historyTarget.value && affected(historyTarget.value.path)) historyTarget.value = null

    favoritePaths.value = new Set([...favoritePaths.value].filter((p) => !affected(p)))
    persistFavorites()
    expandedPaths.value = expandedPaths.value.filter((p) => !affected(p))
    persistExpandedState()
    stats.removeChapterSnapshots(affected)
    persistOpenTabs()
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

  /**
   * 项目切换重置：清掉上一个项目遗留的标签、活动文件、树与临时 UI 状态。
   *
   * 不清 favorites / expandedPaths —— 它们按 projectRoot 分 key 存储，
   * 由 setProjectRoot 按新项目重新加载。
   *
   * 旧实现切项目时什么都没清：编辑器仍显示上一个项目的章节，Ctrl+S 撞上
   * 路径沙箱报「路径超出项目目录」；restoreOpenTabs 还会把旧路径写进
   * 新项目的标签持久化 key，形成双向污染。
   */
  function resetForProject(path: string) {
    openFile.value = null
    openFiles.value = []
    openHistory.value = []
    selectedPath.value = null
    tree.value = []
    historyTarget.value = null
    renamingPath.value = null
    draft.value = null
    dragSource.value = null
    contextMenu.value = { visible: false, x: 0, y: 0, nodePath: '', nodeType: 'blank' }
    contentProviders.clear()
    setProjectRoot(path)
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

  /** 展开某路径的全部祖先目录（搜索定位 / 外部跳转时让文件在树中可见） */
  function revealPath(path: string) {
    const sep = path.includes('\\') ? '\\' : '/'
    const firstIdx = path.lastIndexOf(sep)
    if (firstIdx <= 0) return
    let p = path.slice(0, firstIdx)
    while (true) {
      expandPath(p)
      if (findNode(p)) break // 已展开到树中真实存在的目录，不再向上
      const idx = p.lastIndexOf(sep)
      if (idx <= 0) break
      p = p.slice(0, idx)
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

  /**
   * 关闭标签。
   *
   * 与 Ctrl+W（closeActiveTab）保持同一条路径：关闭前先落盘，失败则不关。
   * 此前点标签上的 × 是直接移除，而自动保存有 1 秒防抖——打完字立刻点 ×
   * 会把刚落笔的内容丢掉（Ctrl+W 反而不会，两条关闭路径行为不一致）。
   */
  async function closeFile(path: string) {
    const target = openFiles.value.find((item) => item.path === path)
    if (target?.isDirty) {
      const saved = await saveFile(path)
      if (!saved) return
    }
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
    await closeFile(f.path)
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
    dropPathsUnder(path)
  }

  async function renamePath(path: string, newName: string) {
    const parent = dirname(path)
    const newPath = joinPath(parent, newName)
    // 路径变化前把编辑器最新内容刷进 store：之后编辑器会用 store 内容重建
    const latest = openFile.value ? getLatestContent(openFile.value.path) : null
    await api.renamePath(path, newPath)
    await loadTree(projectRoot.value)
    // 目录重命名时这里会迁移整棵子树下所有已打开的标签
    applyPathRemap((p) => remapPath(p, path, newPath), latest)
    return newPath
  }

  async function movePath(source: string, destDir: string) {
    const active = openFile.value
    const latest = active ? getLatestContent(active.path) : null
    await api.movePath(source, destDir)

    const movedRoot = joinPath(destDir, basename(source))
    const mapper = (p: string) => remapPath(p, source, movedRoot)
    await loadTree(projectRoot.value)
    applyPathRemap(mapper, latest)
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
    // 清洗非法字符：与编辑器标题栏改名用同一份规则，
    // 否则在树里输入 `第1章:开端` 会直接报「重命名失败」而不是自动纠正
    const cleaned = sanitizeFileName(newName)
    if (!path || !cleaned) {
      renamingPath.value = null
      return
    }

    // Clear the editing state before the async filesystem operation so an
    // Enter key event followed by blur cannot submit the same rename twice.
    renamingPath.value = null
    const node = findNode(path)
    if (!node) return

    // 文件必须保留原扩展名：用户可能把名字改成「第1章.」，清洗后丢掉 .md 会变成无扩展名文件
    let finalName = cleaned
    const ext = node.isDir ? '' : (node.name.match(/\.(md|txt)$/i)?.[0] ?? '')
    if (ext && !finalName.toLowerCase().endsWith(ext.toLowerCase())) finalName += ext

    if (finalName !== node.name) {
      try {
        await renamePath(path, finalName)
      } catch (e) {
        console.error('重命名失败:', e)
        useToastStore().push('error', '重命名失败', e instanceof Error ? e.message : String(e), 4000)
      }
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
    const finalName = sanitizeFileName(name) || draft.value.defaultName
    const targetPath = joinPath(draft.value.parentPath, finalName)
    // 同名冲突要提前拦：目录用 create_dir_all，已存在时静默成功，
    // 用户点了确认却什么都没发生；文件则要等到 Rust 抛错才知道。
    if (findNode(targetPath)) {
      const label = draft.value.type === 'dir' ? '文件夹' : '文件'
      useToastStore().push('info', `已存在同名${label}`, `「${finalName}」已存在，换个名字`, 2800)
      return // 保留草稿，让用户直接改名
    }
    try {
      if (draft.value.type === 'file') {
        const filePath = await createFile(draft.value.parentPath, finalName)
        await handleFileSelect(filePath)
      } else {
        await createDir(draft.value.parentPath, finalName)
      }
    } catch (e) {
      console.error('创建失败:', e)
      useToastStore().push('error', '创建失败', e instanceof Error ? e.message : String(e), 4000)
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
      revealPath(path) // 展开祖先目录，让文件在树中可见
      stats.syncChapterSnapshot(path, countWords(content))
    } catch (e) {
      console.error('读取文件失败:', e)
      // 文件可能已被删除或移出项目：从最近记录里剔除并提示。
      // 此前只在控制台留一行，用户点「最近打开」里的失效条目会毫无反应。
      openHistory.value = openHistory.value.filter((p) => p !== path)
      const failedName = path.split(/[/\\]/).pop() || path
      useToastStore().push('error', '打开失败', `「${failedName}」可能已被删除或移出项目`, 3500)
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
      useToastStore().push('error', '保存失败', e instanceof Error ? e.message : String(e), 4000)
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
      useToastStore().push('error', '保存失败', e instanceof Error ? e.message : String(e), 4000)
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
    historyTarget,
    favoritePaths,
    // Tree management
    setTree,
    setProjectRoot,
    resetForProject,
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
    revealPath,
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
    requestHistory,
    clearHistoryTarget,
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
