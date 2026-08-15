import { onMounted, onUnmounted, type Ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

export function useKeyboardShortcuts(opts: {
  view: Ref<string>
  showSidebar: Ref<boolean>
  showAiPanel: Ref<boolean>
  showSearch: Ref<boolean>
  showSettings: Ref<boolean>
  settingsSection: Ref<string>
  showNewProjectDialog: Ref<boolean>
  showCharacters: Ref<boolean>
  focusMode: Ref<boolean>
  onUndo?: () => void
  onRedo?: () => void
  onCloseTab?: () => void
  onCycleTab?: (delta: number) => void
}) {
  function isEditorFocused(): boolean {
    const el = document.activeElement
    return el !== null && (el.closest('.cm-editor') !== null || el.closest('.cm-content') !== null)
  }

  function isAnyOverlayOpen(): boolean {
    return opts.showNewProjectDialog.value || opts.showSearch.value || opts.showSettings.value || opts.showCharacters.value
  }

  function handler(e: KeyboardEvent) {
    if (isAnyOverlayOpen()) {
      if (e.key === 'Escape') {
        opts.showSettings.value = false
        opts.showSearch.value = false
        opts.showNewProjectDialog.value = false
        opts.showCharacters.value = false
      }
      return
    }

    if (opts.view.value === 'ai-chat') {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        opts.view.value = 'editor'
      }
      return
    }

    if (opts.view.value !== 'editor') return

    // Word 式撤销/重做：焦点不在编辑器、也不在文本输入框时，把 Ctrl+Z/Y 路由到编辑器
    const active = document.activeElement as HTMLElement | null
    const inTextInput = active !== null && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
    if (!inTextInput && !isEditorFocused()) {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        opts.onUndo?.()
        return
      }
      if (e.ctrlKey && !e.altKey && (e.key === 'y' || (e.shiftKey && (e.key === 'Z' || e.key === 'z')))) {
        e.preventDefault()
        opts.onRedo?.()
        return
      }
    }

    // Ctrl+W 关闭当前标签
    if (e.ctrlKey && !e.altKey && e.key === 'w') {
      e.preventDefault()
      opts.onCloseTab?.()
      return
    }
    // Ctrl+Tab / Ctrl+Shift+Tab 循环切换标签
    if (e.ctrlKey && !e.altKey && e.key === 'Tab') {
      e.preventDefault()
      opts.onCycleTab?.(e.shiftKey ? -1 : 1)
      return
    }
    // Ctrl+= / Ctrl+- 调编辑器字号（写作高频操作）
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      const s = useSettingsStore()
      s.setEditorFontSize(s.editorFontSize + 1)
      return
    }
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault()
      const s = useSettingsStore()
      s.setEditorFontSize(s.editorFontSize - 1)
      return
    }

    // 专注模式：Esc 退出，其余快捷键忽略（面板已隐藏）
    if (opts.focusMode.value) {
      if (e.key === 'Escape') {
        e.preventDefault()
        opts.focusMode.value = false
      }
      return
    }

    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      opts.focusMode.value = true
      return
    }

    if (e.ctrlKey && e.key === 'b' && !isEditorFocused()) {
      e.preventDefault()
      opts.showSidebar.value = !opts.showSidebar.value
    }
    if (e.ctrlKey && e.key === 'j') {
      e.preventDefault()
      opts.showAiPanel.value = !opts.showAiPanel.value
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault()
      opts.view.value = 'ai-chat'
    }
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault()
      opts.showSettings.value = true
      opts.settingsSection.value = 'writing'
    }
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault()
      if (!isEditorFocused()) opts.showSearch.value = true
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
