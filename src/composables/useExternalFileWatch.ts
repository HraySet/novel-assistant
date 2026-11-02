/**
 * 外部修改感知：定时比对当前文件的 mtime，发现被其他程序改动时同步进来。
 *
 * 从 App.vue 抽出的一坨生命周期代码（setInterval + 隐藏页跳过 + 脏文件保护）。
 * 规则保持不变：
 * - 窗口隐藏/最小化时跳过轮询，回到前台后下一 tick 自动恢复；
 * - 当前文件有未保存修改时以本地为准，不覆盖；
 * - 文件路径变化后重新建立基准 mtime，避免用上一个文件的时间戳误判。
 */
import { onMounted, onUnmounted } from 'vue'
import * as api from '../api/files'

export function useExternalFileWatch(opts: {
  getPath: () => string | undefined
  isDirty: () => boolean
  /** 是否处于应该监听的状态（如编辑器视图） */
  isActive: () => boolean
  onExternalChange: (content: string) => void
  intervalMs?: number
}) {
  let timer: ReturnType<typeof setInterval> | null = null
  let lastMtime: number | null = null
  let trackedPath = ''

  async function tick(): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!opts.isActive()) return
    const path = opts.getPath()
    if (!path) return
    try {
      const mtime = await api.fileMtime(path)
      if (mtime == null) return
      if (trackedPath !== path) {
        trackedPath = path
        lastMtime = mtime
        return
      }
      if (lastMtime != null && mtime > lastMtime && !opts.isDirty()) {
        const content = await api.readFile(path)
        opts.onExternalChange(content)
      }
      lastMtime = mtime
    } catch {
      /* 忽略瞬时读取失败 */
    }
  }

  function stop(): void {
    if (timer) clearInterval(timer)
    timer = null
  }

  function start(): void {
    stop()
    timer = setInterval(() => void tick(), opts.intervalMs ?? 3000)
  }

  /** 切换文件后调用：清掉旧基准，下一次 tick 重新取 mtime */
  function reset(): void {
    lastMtime = null
    trackedPath = ''
  }

  onUnmounted(stop)
  return { start, stop, reset, tick }
}

/**
 * 全局拖放守卫：文件被拖到没有 drop 处理器的区域（如编辑器）时，
 * 阻止 WebView 默认行为（直接打开该文件）。
 */
export function usePreventFileDropNavigation(): void {
  function prevent(e: DragEvent): void {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
    }
  }
  onMounted(() => {
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
  })
  onUnmounted(() => {
    window.removeEventListener('dragover', prevent)
    window.removeEventListener('drop', prevent)
  })
}
