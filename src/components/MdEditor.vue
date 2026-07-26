<template>
  <div class="editor flex-1 flex flex-col min-h-0 bg-bg-page">
    <!-- 编辑器容器 -->
    <div ref="editorEl" class="flex-1 overflow-y-auto" />

    <!-- 底部状态栏 -->
    <div class="statusbar h-7 flex items-center px-4 text-xs shrink-0 border-t"
      style="border-color: var(--color-border); color: var(--color-text-muted)">
      <span>第 {{ line }} 行</span>
      <span class="mx-1">·</span>
      <span>Markdown</span>
      <span class="mx-1">·</span>
      <span :class="savedClass">{{ savedText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  'update:content': [content: string]
  save: []
}>()

const editorEl = ref<HTMLElement>()
let view: EditorView | null = null

const line = ref(1)
const isSaved = ref(true)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const savedText = computed(() => isSaved.value ? '已保存 ✓' : '● 未保存')
const savedClass = computed(() => isSaved.value ? 'text-success' : 'text-warning')

function updateLine() {
  if (!view) return
  const pos = view.state.selection.main.head
  line.value = view.state.doc.lineAt(pos).number
}

function handleChange() {
  if (!view) return
  isSaved.value = false
  updateLine()
  emit('update:content', view.state.doc.toString())

  // 自动保存：1 秒无输入后保存
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    emit('save')
    isSaved.value = true
  }, 1000)
}

function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    emit('save')
    isSaved.value = true
  }
}

defineExpose({ flushPendingSave })

onMounted(() => {
  if (!editorEl.value) return

  const customTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: 'var(--font-size-editor)',
      fontFamily: 'var(--font-voice)',
      lineHeight: '1.8',
      color: 'var(--color-text-primary)',
      background: 'var(--color-bg-page)',
    },
    '.cm-content': {
      padding: '32px 48px',
      maxWidth: '720px',
      margin: '0 auto',
      fontFamily: 'var(--font-voice)',
    },
    '.cm-gutters': {
      background: 'var(--color-bg-page)',
      color: 'var(--color-text-muted)',
      border: 'none',
    },
    '.cm-activeLine': {
      background: 'var(--color-bg-surface-hover) !important',
    },
    '.cm-activeLineGutter': {
      background: 'var(--color-bg-surface-hover)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-accent)',
    },
    '.cm-selectionBackground': {
      background: 'var(--color-accent-bg) !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      background: 'var(--color-accent-bg) !important',
    },
    '.cm-selectionMatch': {
      background: 'var(--color-accent-bg) !important',
    },
    '&.cm-editor.cm-focused': {
      outline: 'none',
    },
    // Markdown 语法高亮
    '.cm-header': {
      color: 'var(--color-accent)',
      fontWeight: '600',
    },
    '.cm-header-1': { fontSize: '1.6em' },
    '.cm-header-2': { fontSize: '1.3em' },
    '.cm-header-3': { fontSize: '1.1em' },
    '.cm-strong': {
      fontWeight: '700',
      color: 'var(--color-text-primary)',
    },
    '.cm-emphasis': {
      fontStyle: 'italic',
    },
    '.cm-quote': {
      color: 'var(--color-text-muted)',
      borderLeft: '3px solid var(--color-accent-border)',
      paddingLeft: '12px',
    },
    '.cm-link': {
      color: 'var(--color-accent)',
      textDecoration: 'underline',
    },
    '.cm-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.9em',
      background: 'var(--color-bg-surface)',
      padding: '2px 4px',
      borderRadius: 'var(--radius-sm)',
    },
    '.cm-codeBlock': {
      fontFamily: 'var(--font-mono)',
    },
    '.cm-hr': {
      border: 'none',
      borderTop: '1px solid var(--color-border)',
    },
    '.cm-list': {},
  })

  const state = EditorState.create({
    doc: props.content,
    extensions: [
      customTheme,
      lineNumbers(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, indentWithTab]),
      markdown({ base: markdownLanguage }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          handleChange()
        }
        if (update.selectionSet) {
          updateLine()
        }
      }),
      EditorView.domEventHandlers({
        keydown: (e) => {
          // Ctrl+S 保存
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault()
            emit('save')
            isSaved.value = true
          }
        },
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: editorEl.value,
  })

  updateLine()
})

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  view?.destroy()
})

// 外部内容变化时更新编辑器
watch(() => props.content, (newContent) => {
  if (view && newContent !== view.state.doc.toString()) {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newContent,
      },
    })
  }
})
</script>

<style scoped>
.editor {
  min-height: 0;
}
</style>
