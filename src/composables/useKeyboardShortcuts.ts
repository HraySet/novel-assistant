import { onMounted, onUnmounted, type Ref } from 'vue'

export function useKeyboardShortcuts(opts: {
  view: Ref<string>
  showSidebar: Ref<boolean>
  showAiPanel: Ref<boolean>
  showSearch: Ref<boolean>
  showSettings: Ref<boolean>
  settingsSection: Ref<string>
  showNewProjectDialog: Ref<boolean>
}) {
  function isEditorFocused(): boolean {
    const el = document.activeElement
    return el !== null && (el.closest('.cm-editor') !== null || el.closest('.cm-content') !== null)
  }

  function isAnyOverlayOpen(): boolean {
    return opts.showNewProjectDialog.value || opts.showSearch.value || opts.showSettings.value
  }

  function handler(e: KeyboardEvent) {
    if (isAnyOverlayOpen()) {
      if (e.key === 'Escape') {
        opts.showSettings.value = false
        opts.showSearch.value = false
        opts.showNewProjectDialog.value = false
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
