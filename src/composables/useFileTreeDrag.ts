import { ref } from 'vue'
import { useFileStore } from '../stores/file'
import { useToastStore } from '../stores/toast'
import { importDroppedFilesInto } from './useExternalFileImport'
import * as api from '../api/files'

const DRAG_THRESHOLD_PX = 4

// Windows 走原生 OLE 拖出（CF_HDROP）；其它平台原生拖出不可用，
// 改用 HTML5 dragstart（text/plain 携带路径），落点逻辑两边共用
const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

// ── 模块级拖拽控制器（单例）──────────────────────────────────────────
// Windows：不使用 HTML5 的 dragstart（浏览器默认拖拽会话会和 Rust 的
// DoDragDrop 抢鼠标导致拖不动）。改为 mousedown 记录起点，mousemove 超过阈值后
// 直接启动原生拖放。原生拖放经过 WebView 时会合成 HTML5 的 dragenter/dragover/drop
// 事件，所以应用内的落点逻辑（内部移动 / 外部导入）保持不变。
// 非 Windows：行元素 draggable=true + dragstart 写 text/plain，同样复用落点逻辑。
let fs: ReturnType<typeof useFileStore> | null = null
function fileStore() {
  return (fs ??= useFileStore())
}

let pending: { path: string; startX: number; startY: number } | null = null
let dragging = false
let suppressClick = false
let listenersBound = false

function onGlobalMouseMove(e: MouseEvent) {
  if (!pending || dragging) return
  const dx = e.clientX - pending.startX
  const dy = e.clientY - pending.startY
  if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return

  // 非 Windows 没有原生 OLE 拖出：放弃 pending，交给浏览器 HTML5 dragstart
  if (!IS_WINDOWS) {
    pending = null
    return
  }

  dragging = true
  suppressClick = true
  const path = pending.path
  pending = null
  fileStore().setDragSource(path)

  // 30s 看门狗：即使 Rust 端异常挂起也不会让 dragging 卡死，之后仍可再次拖拽
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('拖放超时(30s)')), 30000),
  )
  Promise.race([api.dragOutFiles([path]), timeout])
    .catch((err) => console.error('原生拖放失败:', err))
    .finally(() => {
      dragging = false
      fileStore().setDragSource(null)
      // 拖放结束瞬间 WebView 可能补发一次 click（mousedown+mouseup 配对），
      // 在短暂窗口内吞掉它；窗口过后正常点击不受影响
      setTimeout(() => {
        suppressClick = false
      }, 350)
    })
}

function onGlobalMouseUp() {
  pending = null
}

function bindGlobalListeners() {
  if (listenersBound) return
  listenersBound = true
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
  // 窗口失焦（Alt+Tab 等）时清掉按下状态，避免残留
  window.addEventListener('blur', onGlobalMouseUp)
}

export function useFileTreeDrag() {
  bindGlobalListeners()
  const dragOver = ref(false)

  function normalizePath(path: string) {
    return path.replace(/\\/g, '/')
  }

  function getParentPath(path: string) {
    const normalized = normalizePath(path)
    return normalized.slice(0, normalized.lastIndexOf('/'))
  }

  /** mousedown：记录起点，等待 mousemove 超过阈值后启动原生拖放 */
  function handleMouseDown(e: MouseEvent, nodePath: string) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    // 输入框/按钮上的按下不参与拖拽（重命名、收藏星标等）
    if (target?.closest('input, button')) return
    // 非 Windows：原生 OLE 拖出不可用，走 HTML5 dragstart fallback（见 handleDragStart），
    // 这里只记录 pending，onGlobalMouseMove 会放弃它
    pending = { path: nodePath, startX: e.clientX, startY: e.clientY }
  }

  /**
   * 非 Windows 平台的拖拽源：行元素 draggable=true 时浏览器发起 HTML5
   * 拖拽，这里把节点路径写进 text/plain，落点逻辑与原生拖放完全一致。
   * Windows 上禁用（原生 OLE 拖出接管），preventDefault 防止双轨拖拽。
   */
  function handleDragStart(e: DragEvent, nodePath: string) {
    if (IS_WINDOWS) {
      e.preventDefault()
      return
    }
    if (!e.dataTransfer) return
    e.dataTransfer.setData('text/plain', nodePath)
    e.dataTransfer.effectAllowed = 'copy'
  }

  /** 行点击：拖拽结束后短暂窗口内的 click 会被吞掉，避免误打开文件 */
  function handleRowClick(nodePath: string, isDir: boolean) {
    if (suppressClick) {
      suppressClick = false
      return
    }
    if (isDir) fileStore().handleDirectoryClick(nodePath)
    else fileStore().handleFileSelect(nodePath)
  }

  // ── 落点侧（原生拖放 / 外部拖入经过 WebView 合成的 HTML5 拖放事件） ──

  function handleDragEnter(_e: DragEvent) {
    dragOver.value = true
  }

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer) return
    const types = Array.from(e.dataTransfer.types)
    // 注意：原生拖拽源只允许 DROPEFFECT_COPY（保证拖到外部永远是复制），
    // 因此应用内也必须请求 copy 才能让 OLE 效果协商成功、允许放下；
    // 真正的"移动"由 handleDrop 里的 move_path 执行，与系统效果无关
    if (types.includes('text/plain') || types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
      dragOver.value = true
    }
  }

  function handleDragLeave() {
    dragOver.value = false
  }

  async function handleDrop(e: DragEvent, destDir: string) {
    dragOver.value = false
    const dt = e.dataTransfer
    if (!dt) return

    // 1) 内部移动优先：text/plain 是树内有效节点路径（原生拖放会同时携带 Files）
    const sourcePath = dt.getData('text/plain') || fileStore().dragSource
    fileStore().setDragSource(null)
    if (sourcePath && fileStore().findNode(sourcePath)) {
      const source = normalizePath(sourcePath)
      const destination = normalizePath(destDir)
      if (source === destination || getParentPath(source) === destination || destination.startsWith(`${source}/`)) return
      try {
        fileStore().expandPath(destDir)
        await fileStore().handleDrop(sourcePath, destDir)
        useToastStore().push('success', '已移动', (sourcePath.split(/[\\/]/).pop() || sourcePath))
      } catch (err) {
        console.error('移动失败:', err)
        useToastStore().push('error', '移动失败', err instanceof Error ? err.message : String(err), 4000)
      }
      return
    }

    // 2) 外部文件拖入 → 复制进项目
    if (dt.files.length > 0) {
      await importDroppedFilesInto(dt, destDir)
    }
  }

  return {
    dragOver,
    handleMouseDown,
    handleRowClick,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragStart,
    isWindows: IS_WINDOWS,
  }
}
