<template>
  <div class="editor relative flex-1 flex flex-col min-h-0 bg-bg-page">
    <!-- 章节标题（即文件名，编辑后回车/失焦自动重命名文件） -->
    <div class="editor-title-row">
      <input
        v-model="titleDraft"
        ref="titleInputRef"
        class="editor-title-input"
        spellcheck="false"
        placeholder="章节标题"
        title="章节标题（即文件名，回车或失焦后重命名文件）"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitle"
        @input="titleSyncError = ''"
      />
      <div v-if="titleSyncError" class="title-sync-error">{{ titleSyncError }}</div>
    </div>

    <!-- 编辑器容器 -->
    <div ref="editorEl" class="flex-1 overflow-y-auto" />

    <!-- 划词工具条：选区上方浮现，与侧栏快捷操作联动 -->
    <div v-if="selBar" class="sel-toolbar" :style="{ left: selBar.left + 'px', top: selBar.top + 'px' }" @mousedown.prevent>
      <span class="sel-count">已选中 {{ selection?.words ?? 0 }} 字</span>
      <span class="sel-divider" />
      <button class="sel-btn" title="润色选中内容" @click="runSelAction('润色')"><Sparkles :size="12" />润色</button>
      <button class="sel-btn" title="扩写选中内容" @click="runSelAction('扩写')"><ArrowLeftRight :size="12" />扩写</button>
      <button class="sel-btn" title="检查选中内容" @click="runSelAction('检查')"><CheckCircle2 :size="12" />检查</button>
      <div class="sel-more">
        <button class="sel-btn" title="更多操作" @click.stop="selMoreOpen = !selMoreOpen"><MoreHorizontal :size="12" /></button>
        <div v-if="selMoreOpen" class="sel-dropdown" @mousedown.stop>
          <button class="sel-dropdown-item" @click="runSelAction('摘要')">生成摘要</button>
        </div>
      </div>
    </div>

    <!-- 章节内大纲浮层 -->
    <div v-if="showOutline" class="outline-panel">
      <div v-if="headings.length === 0" class="outline-empty">本章没有标题（# / ## / ###）</div>
      <button
        v-for="(h, i) in headings"
        :key="i"
        class="outline-item"
        :style="{ paddingLeft: (h.level * 10 + 10) + 'px' }"
        @click="jumpToHeading(h.pos)"
      >
        {{ h.text }}
      </button>
    </div>

    <!-- 底部状态栏：左＝本章位置与保存，右＝写作统计，更多操作收进弹层 -->
    <div class="statusbar h-7 flex items-center px-4 text-xs shrink-0 border-t"
      style="border-color: var(--color-border); color: var(--color-text-muted)">
      <button class="nav-btn stat-btn--outline" title="章节内大纲" @click="toggleOutline">
        <ListTree :size="13" />
      </button>
      <button class="nav-btn" title="上一章" :disabled="!prevPath" @click="prevPath && $emit('navigate', prevPath)">
        <ChevronUp :size="13" />
      </button>
      <button class="nav-btn" title="下一章" :disabled="!nextPath" @click="nextPath && $emit('navigate', nextPath)">
        <ChevronDown :size="13" />
      </button>
      <span class="stat ml-2">本章 {{ chapterWords }} 字</span>
      <span class="mx-1">·</span>
      <span class="stat" :title="'阅读位置 ' + scrollPercent + '%'">{{ scrollPercent }}%</span>
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
      <div class="stat-more-wrap">
        <button class="nav-btn stat-btn--more" title="更多" @click="showMore = !showMore">
          <MoreHorizontal :size="13" />
        </button>
        <div v-if="showMore" class="more-popover">
          <button class="more-item" @click="stats.toggleSession(); showMore = false">
            {{ session.isRunning ? '暂停计时' : '开始计时' }}
          </button>
          <button class="more-item" @click="showHistory = true; showMore = false">历史版本</button>
        </div>
      </div>
    </div>

    <HistoryModal v-if="showHistory && path" :file-path="path" :file-name="name"
      @close="showHistory = false" @restored="handleRestored" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorState, Compartment, RangeSetBuilder } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, indentWithTab, history, historyField, undo, redo } from '@codemirror/commands'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { storeToRefs } from 'pinia'
import { useStatsStore } from '../stores/stats'
import { useSettingsStore } from '../stores/settings'
import { useFileStore } from '../stores/file'
import { useSelectionStore } from '../stores/selection'
import { QUICK_ACTIONS } from '../composables/aiQuickActions'
import { countWords } from '../utils/countWords'
import { ListTree, ChevronUp, ChevronDown, MoreHorizontal, Sparkles, ArrowLeftRight, CheckCircle2 } from 'lucide-vue-next'
import HistoryModal from './HistoryModal.vue'
import * as api from '../api/files'

const props = defineProps<{
  content: string
  path?: string
  name?: string
  prevPath?: string
  nextPath?: string
}>()

const emit = defineEmits<{
  'update:content': [content: string]
  save: []
  dirty: []
  navigate: [path: string]
}>()

// 每文件 EditorState 缓存：切换标签后撤销历史仍然可用（上限 20 个文件）
const stateCache = new Map<string, EditorState>()
const STATE_CACHE_MAX = 20

// ── 打字机模式：光标保持在视口约 1/3 高度 ──
const typewriterExtension = EditorView.updateListener.of((update) => {
  if (!update.docChanged && !update.selectionSet) return
  const view = update.view
  const coords = view.coordsAtPos(view.state.selection.main.head)
  if (!coords) return
  const scrollRect = view.scrollDOM.getBoundingClientRect()
  const targetY = scrollRect.top + scrollRect.height / 3
  const delta = coords.top - targetY
  if (Math.abs(delta) > 24) {
    view.scrollDOM.scrollTop += delta
  }
})

// ── 聚焦行：当前行以外的行变暗 ──
function buildFocusDecorations(view: EditorView): DecorationSet {
  if (!view.hasFocus) return Decoration.none
  const builder = new RangeSetBuilder<Decoration>()
  const currentLine = view.state.doc.lineAt(view.state.selection.main.head).number
  for (const range of view.visibleRanges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos)
      if (line.number !== currentLine) {
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-line-dimmed' }))
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const focusLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildFocusDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
        this.decorations = buildFocusDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const typewriterCompartment = new Compartment()
const focusCompartment = new Compartment()

const stats = useStatsStore()
const settings = useSettingsStore()
const fileStore = useFileStore()
const { todayWords, dailyGoal, todayGoalPercent, todayGoalMet, streakDays, sessionFormatted, session } = storeToRefs(stats)

const editorEl = ref<HTMLElement>()
let view: EditorView | null = null
/** 切换令牌：path 每次变化自增，异步恢复完成后校验，防止旧切换的结果覆盖新文件 */
let switchSeq = 0
/** 当前 view.state 实际属于哪个文件（切换完成前不更新，保证缓存/落盘的是正确的撤销历史） */
let currentPath: string | undefined = undefined
// ── 划词联动 ──
const selectionStore = useSelectionStore()
const { selection } = storeToRefs(selectionStore)
const selBar = ref<{ left: number; top: number } | null>(null)
const selMoreOpen = ref(false)
const showHistory = ref(false)
const showOutline = ref(false)
const headings = ref<{ level: number; text: string; pos: number }[]>([])
const chapterWords = ref(0)
const lastSavedTime = ref<Date | null>(null)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement>()
const titleSyncError = ref('')
let wordsTimer: ReturnType<typeof setTimeout> | null = null
let outlineCloseHandler: ((e: MouseEvent) => void) | null = null
let moreCloseHandler: ((e: MouseEvent) => void) | null = null

const scrollPercent = ref(0)
const showMore = ref(false)
const isSaved = ref(true)
let saveTimer: ReturnType<typeof setTimeout> | null = null

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ── 章节标题（即文件名，无 # 标题行） ──

function fileNameOf(name?: string): string {
  if (!name) return '未命名'
  return name.replace(/\.(md|txt)$/i, '')
}

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 80)
}

/** 标题即文件名：从文件名同步（去掉扩展名） */
function syncTitleFromName() {
  // 输入框正在编辑时不同步，避免覆盖未提交的草稿
  if (titleInputRef.value && document.activeElement === titleInputRef.value) return
  titleDraft.value = fileNameOf(props.name)
}

/** 标题提交 = 重命名文件（保留原扩展名；不碰文档内容） */
async function commitTitle() {
  if (!props.path || !props.name) return
  const fallback = fileNameOf(props.name)
  const finalTitle = sanitizeFileName(titleDraft.value.trim()) || fallback
  titleDraft.value = finalTitle
  if (finalTitle === fallback) return
  const ext = props.name.match(/\.(md|txt)$/i)?.[0] ?? '.md'
  const newName = finalTitle + ext
  if (newName === props.name) return
  titleSyncError.value = ''
  try {
    await fileStore.renamePath(props.path, newName)
  } catch (e) {
    console.error('重命名失败:', e)
    titleSyncError.value = e instanceof Error ? e.message : '重命名失败'
    setTimeout(() => { titleSyncError.value = '' }, 3000)
  }
}


const savedText = computed(() => {
  if (!isSaved.value) return '● 未保存'
  return lastSavedTime.value ? `自动保存 ${formatTime(lastSavedTime.value)}` : '已保存 ✓'
})
const savedClass = computed(() => isSaved.value ? 'text-success' : 'text-warning')

function updateScrollPercent() {
  if (!view) return
  const el = view.scrollDOM
  const max = el.scrollHeight - el.clientHeight
  const pct = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0
  scrollPercent.value = pct
  // 防抖持久化阅读位置（切文件/重启后恢复）
  if (props.path) scheduleScrollSave(props.path, pct)
}

function updateChapterWords() {
  if (!view) return
  if (wordsTimer) clearTimeout(wordsTimer)
  wordsTimer = setTimeout(() => {
    if (view) chapterWords.value = countWords(view.state.doc.toString())
  }, 300)
}

// 文档替换来自 props 同步（保存落盘 / 外部修改 / 应用 AI 修改）时置位，
// 避免这类替换被 updateListener 误判为用户编辑（重新标记脏并触发自动保存）
let syncingFromProp = false

function handleChange() {
  if (!view || syncingFromProp) return
  isSaved.value = false
  // 只发轻量 dirty 信号；文档内容由 store 在保存时按需读取（零拷贝提供者），
  // 避免每次按键把整篇文档序列化成字符串塞进 store
  emit('dirty')
  updateChapterWords()

  // 自动保存：1 秒无输入后保存
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    emit('save')
    isSaved.value = true
    lastSavedTime.value = new Date()
  }, 1000)
}

function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    emit('save')
    isSaved.value = true
    lastSavedTime.value = new Date()
  }
}

function handleRestored(content: string) {
  if (view) {
    syncingFromProp = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
    syncingFromProp = false
  }
  isSaved.value = true
  lastSavedTime.value = null
  updateChapterWords()
  emit('update:content', content)
  // 历史版本已由 HistoryModal 写盘：补一次保存，把 store 的脏标记清掉
  emit('save')
}

/**
 * 智能插入：在光标处插入（有选区则替换选区）。
 * 若同一段文本已经紧邻光标之前、或选区正是该文本，则跳过，避免重复插入；
 * 用户删掉后再点仍然可以重新插入。
 */
function insertIfNotDuplicate(text: string): boolean {
  if (!view) return false
  const { from, to } = view.state.selection.main
  const before = view.state.doc.sliceString(Math.max(0, from - text.length), from)
  const selectedText = view.state.doc.sliceString(from, to)
  if (before === text || selectedText === text) {
    view.focus()
    return false
  }
  view.dispatch({ changes: { from, to, insert: text } })
  view.focus()
  return true
}

// ── 划词联动：选区跟踪、浮动工具条、选区替换 ──

/** 把当前选区写入共享 store（无选区则清空），并同步工具条位置 */
function trackSelection() {
  if (!view) return
  const sel = view.state.selection.main
  const text = sel.empty ? '' : view.state.doc.sliceString(sel.from, sel.to)
  if (text) selectionStore.setSelection(props.path ?? '', sel.from, sel.to, text)
  else selectionStore.clearSelection()
  updateSelBar()
}

/** 工具条定位在选区上方（viewport 坐标 → position: fixed） */
function updateSelBar() {
  if (!view) { selBar.value = null; return }
  const sel = view.state.selection.main
  const storeSel = selectionStore.selection
  if (sel.empty || !storeSel || storeSel.path !== (props.path ?? '')) { selBar.value = null; return }
  const from = view.coordsAtPos(sel.from)
  if (!from) { selBar.value = null; return }
  selBar.value = { left: Math.max(8, Math.round(from.left)), top: Math.max(4, Math.round(from.top - 42)) }
}

/** 划词工具条动作：把动作写入 store，由 AI 面板消费执行 */
function runSelAction(label: string) {
  selMoreOpen.value = false
  const sel = selectionStore.selection
  if (!sel || !view) return
  const action = QUICK_ACTIONS.find((a) => a.label === label)
  if (!action) return
  const prompt = settings.aiQuickPrompts[label] || action.prompt
  selectionStore.requestAction({ label, prompt, selection: sel })
}

/** 替换选区（应用划词 Diff 用）：校验范围仍为原文，防止覆盖用户后续编辑 */
function replaceRange(from: number, to: number, text: string, expectedOriginal?: string): boolean {
  if (!view) return false
  const doc = view.state.doc
  if (from < 0 || to < from || to > doc.length) return false
  if (expectedOriginal !== undefined && doc.sliceString(from, to) !== expectedOriginal) return false
  return true
}

/** Word 式撤销/重做：编辑器未聚焦时也能由全局快捷键触发 */
function undoCommand(): boolean {
  if (!view) return false
  view.focus()
  return undo(view)
}

function redoCommand(): boolean {
  if (!view) return false
  view.focus()
  return redo(view)
}

// ── 章节内大纲 ──
function toggleOutline() {
  if (!view) return
  if (showOutline.value) {
    showOutline.value = false
    return
  }
  const doc = view.state.doc
  const list: { level: number; text: string; pos: number }[] = []
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const m = /^(#{1,3})\s+(.+)$/.exec(line.text)
    if (m) list.push({ level: m[1].length, text: m[2].trim(), pos: line.from })
  }
  headings.value = list
  showOutline.value = true
}

function jumpToHeading(pos: number) {
  if (!view) return
  view.dispatch({ selection: { anchor: pos } })
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
  view.focus()
  showOutline.value = false
}

// 点击浮层外关闭
watch(showOutline, (v) => {
  if (outlineCloseHandler) {
    document.removeEventListener('mousedown', outlineCloseHandler)
    outlineCloseHandler = null
  }
  if (v) {
    outlineCloseHandler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.outline-panel') || el.closest('.stat-btn--outline')) return
      showOutline.value = false
    }
    document.addEventListener('mousedown', outlineCloseHandler)
  }
})

// 更多弹层：点击外部关闭
watch(showMore, (v) => {
  if (moreCloseHandler) {
    document.removeEventListener('mousedown', moreCloseHandler)
    moreCloseHandler = null
  }
  if (v) {
    moreCloseHandler = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.more-popover') || el.closest('.stat-btn--more')) return
      showMore.value = false
    }
    document.addEventListener('mousedown', moreCloseHandler)
  }
})

defineExpose({ flushPendingSave, flushUndo, insertIfNotDuplicate, replaceRange, undoCommand, redoCommand })

// 编辑器主题（只依赖 CSS 变量）
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--font-size-editor)',
    fontFamily: 'var(--font-voice)',
    lineHeight: 'var(--line-height-editor)',
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-page)',
  },
  '.cm-content': {
    padding: '32px 48px',
    maxWidth: 'var(--editor-max-width, 760px)',
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
    borderRadius: '6px',
  },
  '.cm-activeLineGutter': {
    background: 'var(--color-bg-surface-hover)',
    borderRadius: '6px',
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
  '.cm-line-dimmed': { opacity: 0.35 },
})

// 编辑器基础扩展（不含 doc）：新建状态与从 JSON 恢复历史时共用
const baseExtensions = [
  editorTheme,
  typewriterCompartment.of(settings.typewriterMode ? typewriterExtension : []),
  focusCompartment.of(settings.focusLineMode ? focusLinePlugin : []),
  lineNumbers(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  // 撤销/重做历史（Ctrl+Z / Ctrl+Y）。缺 history() 时事务不会进入撤销历史，
  // Ctrl+Z 将毫无反应 —— 这是 Word 式撤销的根基
  history(),
  keymap.of([...defaultKeymap, indentWithTab]),
  search({ top: true }),
  highlightSelectionMatches(),
  keymap.of([...searchKeymap]),
  markdown({ base: markdownLanguage }),
  // 浏览器拼写检查（红波浪线，右键可用系统词典）
  EditorView.contentAttributes.of({ spellcheck: 'true' }),
  EditorView.updateListener.of(update => {
    if (update.docChanged) {
      handleChange()
    }
    if (update.viewportChanged) {
      updateScrollPercent()
    }
    // 划词跟踪：选区变化写入共享 store，并同步浮动工具条
    if (update.selectionSet || update.docChanged) {
      trackSelection()
    }
    if (update.viewportChanged || update.geometryChanged) {
      updateSelBar()
    }
  }),
  EditorView.domEventHandlers({
    keydown: (e) => {
      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        emit('save')
        isSaved.value = true
        lastSavedTime.value = new Date()
      }
    },
  }),
]

function buildState(content: string): EditorState {
  return EditorState.create({ doc: content, extensions: baseExtensions })
}

// ── 撤销历史持久化（跨重启保留 Ctrl+Z） ──

function undoFilePath(path: string): string {
  const root = fileStore.projectRoot
  if (!root) return ''
  const sep = root.includes('\\') ? '\\' : '/'
  return root + sep + '.stats' + sep + 'undo' + sep + encodeURIComponent(path) + '.json'
}

/** 序列化当前状态（含 doc、选区、撤销历史）写入 .stats/undo/ */
function saveUndoHistory(path: string) {
  if (!view || !path) return
  try {
    const file = undoFilePath(path)
    if (!file) return
    const json = view.state.toJSON({ history: historyField })
    api.writeFile(file, JSON.stringify(json)).catch(() => { /* 保存失败不阻塞 */ })
  } catch { /* 序列化失败忽略 */ }
}

/** 读取撤销历史：doc 与当前内容一致才恢复（位置才有效） */
async function loadSavedState(path: string | undefined, content: string): Promise<EditorState | null> {
  if (!path) return null
  try {
    const file = undoFilePath(path)
    if (!file) return null
    const raw = await api.readFile(file)
    const saved = JSON.parse(raw)
    if (!saved || saved.doc !== content) return null
    return EditorState.fromJSON(saved, { extensions: baseExtensions }, { history: historyField })
  } catch {
    return null
  }
}


// ── 阅读位置持久化（按文件记录滚动百分比） ──

function scrollStoreKey(): string {
  return 'editor-scroll:' + fileStore.projectRoot
}

let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleScrollSave(path: string, percent: number) {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => {
    scrollSaveTimer = null
    try {
      const map = JSON.parse(localStorage.getItem(scrollStoreKey()) || '{}')
      map[path] = Math.max(0, Math.min(100, percent))
      localStorage.setItem(scrollStoreKey(), JSON.stringify(map))
    } catch { /* 忽略 */ }
  }, 600)
}

/** 立刻记录当前滚动百分比（切文件/卸载前调用） */
function captureCurrentScroll(path: string) {
  if (!view) return
  const el = view.scrollDOM
  const max = el.scrollHeight - el.clientHeight
  if (max > 0) scheduleScrollSave(path, Math.round((el.scrollTop / max) * 100))
}

function restoreScrollPercent(path: string | undefined) {
  if (!view || !path) return
  if (!view) return
  try {
    const map = JSON.parse(localStorage.getItem(scrollStoreKey()) || '{}')
    const pct = map[path]
    if (typeof pct === 'number' && pct > 0) {
      const el = view.scrollDOM
      const max = el.scrollHeight - el.clientHeight
      if (max > 0) el.scrollTop = (pct / 100) * max
    }
  } catch { /* 忽略 */ }
}

/** 应用关闭前落盘撤销历史（App 关闭守卫调用） */
function flushUndo() {
  if (props.path) saveUndoHistory(props.path)
}

onMounted(async () => {
  if (!editorEl.value) return
  const token = ++switchSeq
  const restored = await loadSavedState(props.path, props.content)
  // 已卸载则放弃创建；等待期间切换过文件则按当前 props 重建（丢弃过期的恢复结果）
  if (!editorEl.value.isConnected) return
  const state = token === switchSeq
    ? (restored ?? buildState(props.content))
    : ((props.path ? stateCache.get(props.path) : undefined) ?? buildState(props.content))

  view = new EditorView({
    state,
    parent: editorEl.value,
  })
  currentPath = props.path

  // 注册零拷贝内容读取器：保存 / 切换文件 / 构建 AI 上下文时按需读取最新文档
  if (props.path) fileStore.registerContentProvider(props.path, () => view?.state.doc.toString() ?? '')

  updateScrollPercent()
  updateChapterWords()
  syncTitleFromName()
  // 布局完成后恢复上次阅读位置
  requestAnimationFrame(() => restoreScrollPercent(props.path))
})

onUnmounted(() => {
  // 使所有挂起的异步恢复作废
  switchSeq++
  if (saveTimer) clearTimeout(saveTimer)
  if (outlineCloseHandler) document.removeEventListener('mousedown', outlineCloseHandler)
  if (moreCloseHandler) document.removeEventListener('mousedown', moreCloseHandler)
  if (props.path) fileStore.unregisterContentProvider(props.path)
  // 仅当 view 内容确实属于该文件时才缓存/落盘，避免把别的文件状态写进它的撤销历史
  if (view && props.path && currentPath === props.path) stateCache.set(props.path, view.state)
  if (props.path && currentPath === props.path) {
    saveUndoHistory(props.path)
    captureCurrentScroll(props.path)
  }
  selectionStore.clearSelection()
  selBar.value = null
  view?.destroy()
})

// 切换文件：保存当前文件的撤销历史，恢复目标文件的缓存（有则用）
watch(() => props.path, async (newPath, oldPath) => {
  if (!view) return
  const token = ++switchSeq
  // 切换前清理旧文件的待执行定时器，避免旧文件的自动保存打到新文件上
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  // 切换文件后旧文件的选区不再有效：清空共享选区并隐藏工具条
  selectionStore.clearSelection()
  selBar.value = null
  selMoreOpen.value = false
  // 仅当 view 内容确实属于旧文件时才缓存/落盘（快速连续切换时旧文件可能已被上一次异步恢复抢先覆盖）
  if (oldPath && currentPath === oldPath) {
    fileStore.unregisterContentProvider(oldPath)
    stateCache.set(oldPath, view.state)
    // 落盘撤销历史与滚动位置，切回或重启后仍可继续
    saveUndoHistory(oldPath)
    captureCurrentScroll(oldPath)
    if (stateCache.size > STATE_CACHE_MAX) {
      const first = stateCache.keys().next().value
      if (first !== undefined) stateCache.delete(first)
    }
  }
  if (!newPath) {
    currentPath = undefined
    return
  }
  const applyState = (state: EditorState) => {
    // 竞态守卫：await 期间又发生了切换，则丢弃本次恢复结果
    if (token !== switchSeq || !view || !view.dom.isConnected) return false
    view.setState(state)
    currentPath = newPath
    return true
  }
  const cached = stateCache.get(newPath)
  if (cached && cached.doc.toString() === props.content) {
    if (!applyState(cached)) return
  } else {
    // 重命名场景：旧路径缓存的就是当前文档（store 已在 renamePath 中刷新内容）
    // → 直接复用，保留撤销历史与未保存的编辑
    const renamed = oldPath && currentPath === oldPath ? stateCache.get(oldPath) : undefined
    if (renamed && renamed.doc.toString() === props.content) {
      stateCache.set(newPath, renamed)
      if (!applyState(renamed)) return
    } else {
      const restored = await loadSavedState(newPath, props.content)
      if (!applyState(restored ?? buildState(props.content))) return
    }
  }
  if (token !== switchSeq) return
  fileStore.registerContentProvider(newPath, () => view?.state.doc.toString() ?? '')
  isSaved.value = true
  lastSavedTime.value = null
  updateScrollPercent()
  updateChapterWords()
  requestAnimationFrame(() => restoreScrollPercent(newPath))
  syncTitleFromName()
})

// 打字机 / 聚焦行开关实时生效
watch(() => settings.typewriterMode, (on) => {
  if (!view) return
  view.dispatch({ effects: typewriterCompartment.reconfigure(on ? typewriterExtension : []) })
})

watch(() => settings.focusLineMode, (on) => {
  if (!view) return
  view.dispatch({ effects: focusCompartment.reconfigure(on ? focusLinePlugin : []) })
})

// 外部内容变化时更新编辑器（保存落盘后内容与文档一致，不会触发）
watch(() => props.content, (newContent) => {
  if (!view) return
  const doc = view.state.doc
  // 长度不等直接替换；长度相同才做全量比较，省掉大部分场景的整篇字符串比对
  if (newContent.length !== doc.length || newContent !== doc.toString()) {
    syncingFromProp = true
    view.dispatch({
      changes: {
        from: 0,
        to: doc.length,
        insert: newContent,
      },
    })
    syncingFromProp = false
    updateChapterWords()
  }
})
</script>

<style scoped>
.editor {
  min-height: 0;
}

/* 滚动条美化 */
.editor :deep(.cm-scroller)::-webkit-scrollbar {
  width: 10px;
}

.editor :deep(.cm-scroller)::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.editor :deep(.cm-scroller)::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
  background-clip: content-box;
  border: 2px solid transparent;
}

.editor :deep(.cm-scroller)::-webkit-scrollbar-track {
  background: transparent;
}

/* ── 文档标题 ── */
.editor-title-row {
  position: relative;
  max-width: var(--editor-max-width, 760px);
  width: calc(100% - 96px);
  margin: 0 auto;
  padding: 12px 0 2px;
  flex-shrink: 0;
}

.editor-title-input {
  width: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-family: var(--font-voice);
  font-size: 1.45em;
  font-weight: 600;
  color: var(--color-text-primary);
  outline: none;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.1s ease;
}

.editor-title-input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.editor-title-input:hover,
.editor-title-input:focus {
  background: var(--color-bg-surface-hover);
}

.title-sync-error {
  text-align: center;
  font-size: 11px;
  color: var(--color-danger);
  margin-top: 2px;
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

.stat-more-wrap {
  position: relative;
  margin-left: 4px;
}

.more-popover {
  position: absolute;
  right: 0;
  bottom: 26px;
  min-width: 140px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  padding: 4px;
  z-index: 60;
}

.more-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.more-item:hover {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.nav-btn {
  margin-left: 8px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.outline-panel {
  position: absolute;
  right: 12px;
  bottom: 40px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  padding: 6px;
  z-index: 50;
}

.outline-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 5px 8px;
  font-size: 12px;
  font-family: var(--font-sans);
  border: none;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-item:hover {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.outline-empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}
/* 划词工具条：跟随选区、悬于文字上方 */
.sel-toolbar {
  position: fixed;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  background: var(--color-bg-elevated, var(--color-bg-surface));
  border: 1px solid var(--color-border-strong, var(--color-border));
  border-radius: 10px;
  box-shadow: var(--shadow-popover);
  font-size: 12px;
  color: var(--color-text-primary);
}
.sel-count { font-size: 11px; color: var(--color-text-muted); padding: 0 6px; white-space: nowrap; }
.sel-divider { width: 1px; height: 14px; background: var(--color-border); margin: 0 2px; flex-shrink: 0; }
.sel-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: var(--radius-sm);
  border: none; background: none; color: var(--color-text-secondary);
  font-size: 12px; font-family: inherit; cursor: pointer;
  white-space: nowrap;
}
.sel-btn:hover { background: var(--color-accent-bg); color: var(--color-accent); }
.sel-more { position: relative; }
.sel-dropdown {
  position: absolute; top: calc(100% + 4px); right: 0;
  min-width: 128px; padding: 4px;
  background: var(--color-bg-elevated, var(--color-bg-surface));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  z-index: 41;
}
.sel-dropdown-item {
  display: block; width: 100%; text-align: left;
  padding: 6px 10px; border: none; background: none;
  font-size: 12px; font-family: inherit; color: var(--color-text-secondary);
  border-radius: var(--radius-sm); cursor: pointer;
}
.sel-dropdown-item:hover { background: var(--color-accent-bg); color: var(--color-accent); }
</style>
