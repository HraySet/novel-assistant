import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  type: ToastType
  title: string
  message?: string
  /** 展示时长（ms）；0 = 常驻，需手动关闭 */
  duration: number
  pushedAt: number
  timer?: ReturnType<typeof setTimeout>
}

let nextId = 1

/**
 * 全局轻提示（Toast）：保存失败、导入导出、恢复历史、回收站操作等
 * 所有"需要让用户知道结果"的动作统一走这里，避免 console.error 或瞬时文字。
 */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([])
  const MAX_TOASTS = 4

  function dismiss(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    const t = toasts.value[idx]
    if (t.timer) clearTimeout(t.timer)
    toasts.value.splice(idx, 1)
  }

  function push(type: ToastType, title: string, message?: string, duration = 2800): number {
    // 去重：连续触发相同的提示（如自动保存每秒重试失败）只保留一条，避免刷屏
    const last = toasts.value[toasts.value.length - 1]
    if (
      last &&
      last.type === type &&
      last.title === title &&
      last.message === message &&
      Date.now() - last.pushedAt < 1500
    ) {
      return last.id
    }

    const id = nextId++
    const item: ToastItem = { id, type, title, message, duration, pushedAt: Date.now() }
    toasts.value.push(item)
    if (toasts.value.length > MAX_TOASTS) dismiss(toasts.value[0].id)
    if (duration > 0) {
      item.timer = setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  return { toasts, push, dismiss }
})

// 开发模式 HMR：store 改动时热替换定义
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useToastStore, import.meta.hot))
}
