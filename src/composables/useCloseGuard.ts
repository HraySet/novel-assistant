/**
 * 关窗守卫：有未保存修改时拦下关闭，询问「保存并退出 / 不保存 / 取消」，
 * 确认后统一落盘（统计、聊天记录、撤销历史、AI 配置）再销毁窗口。
 *
 * 从 App.vue 抽出。这类逻辑只有真机才能验证，抽出来的意义是它不再和
 * 视图状态混在一个 700 多行的组件里，改窗口行为时不用通读整个 App。
 */
import { computed, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@tauri-apps/api/core'

export type CloseChoice = 'save' | 'discard' | 'cancel'

export interface DirtyFileRef {
  path: string
  name: string
}

export function useCloseGuard(opts: {
  getDirtyFiles: () => DirtyFileRef[]
  saveAllDirty: () => Promise<boolean>
  /** 销毁窗口前统一落盘（统计 / 聊天 / 撤销 / 设置） */
  flushBeforeClose: () => Promise<void> | void
}) {
  const showCloseConfirm = ref(false)
  const dirtyFiles = computed(() => opts.getDirtyFiles())
  let resolver: ((choice: CloseChoice) => void) | null = null

  function resolveClose(choice: CloseChoice): void {
    const resolve = resolver
    resolver = null
    showCloseConfirm.value = false
    resolve?.(choice)
  }

  /** 安装窗口关闭拦截（仅桌面环境）；返回取消监听的函数 */
  async function install(): Promise<() => void> {
    if (!isTauri()) return () => {}
    const win = getCurrentWindow()
    let allowClose = false

    const unlisten = await win.onCloseRequested(async (event) => {
      if (allowClose) return
      event.preventDefault()

      if (opts.getDirtyFiles().length > 0) {
        showCloseConfirm.value = true
        const choice = await new Promise<CloseChoice>((resolve) => {
          resolver = resolve
        })
        if (choice === 'cancel') return
        if (choice === 'save') await opts.saveAllDirty()
      }

      await opts.flushBeforeClose()
      allowClose = true
      await win.destroy()
    })

    return unlisten
  }

  return { showCloseConfirm, dirtyFiles, resolveClose, install }
}
