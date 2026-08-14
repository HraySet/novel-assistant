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

      <div class="flex-1"></div>

      <!-- 写作统计（整合进编辑区底部） -->
      <span class="stat">{{ todayWords }} / {{ dailyGoal }} 字</span>
      <span class="stat-progress" :title="`今日目标进度 ${todayGoalPercent}%`">
        <span class="stat-progress-fill" :class="{ met: todayGoalMet }" :style="{ width: todayGoalPercent + '%' }"></span>
      </span>
      <span v-if="streakDays > 0" class="stat" title="连续写作天数">🔥 {{ streakDays }}</span>
      <span class="stat" title="本次写作时长">⏱ {{ sessionFormatted }}</span>
      <button class="stat-btn" :title="session.isRunning ? '暂停计时' : '开始计时'" @click="stats.toggleSession()">
        {{ session.isRunning ? '暂停' : '开始' }}
      </button>
      <button class="stat-btn" title="查看历史版本" @click="showHistory = true">历史</button>
    </div>

    <HistoryModal v-if="showHistory && path" :file-path="path" :file-name="name"
      @close="showHistory = false" @restored="handleRestored" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { storeToRefs } from 'pinia'
import { useStatsStore } from '../stores/stats'
import HistoryModal from './HistoryModal.vue'

const props = defineProps<{
  content: string
  path?: string
  name?: string
}>()

const emit = defineEmits<{
  'update:content': [content: string]
  save: []
}>()

const stats = useStatsStore()
const { todayWords, dailyGoal, todayGoalPercent, todayGoalMet, streakDays, sessionFormatted, session } = storeToRefs(stats)

const editorEl = ref<HTMLElement>()
let view: EditorView | null = null
const showHistory = ref(false)

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

function handleRestored(content: string) {
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
  }
  isSaved.value = true
  emit('update:content', content)
}

function insertAtCursor(text: string) {
  if (!view) return
  view.dispatch({
    changes: { from: view.state.selection.main.head, insert: text },
  })
  view.focus()
}

defineExpose({ flushPendingSave, insertAtCursor })

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
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, indentWithTab]),
      search({ top: true }),
      highlightSelectionMatches(),
      keymap.of([...searchKeymap]),
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

.stat {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stat-progress {
  width: 60px;
  height: 3px;
  border-radius: 999px;
  background: var(--color-bg-surface-hover);
  overflow: hidden;
  margin: 0 8px;
}

.stat-progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.stat-progress-fill.met {
  background: #34d399;
}

.stat-btn {
  margin-left: 8px;
  padding: 1px 10px;
  font-size: 11px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  color: var(--color-accent);
  background: var(--color-accent-bg);
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.stat-btn:hover {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}
</style>
