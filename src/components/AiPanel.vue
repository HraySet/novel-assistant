<template>
  <aside class="ai-panel shrink-0 border-l flex flex-col bg-bg-surface relative"
    :style="{ width: panelWidth + 'px', borderColor: 'var(--color-border)' }">

    <!-- 宽度拖拽手柄（面板左缘） -->
    <div class="resize-handle" :class="{ 'resize-handle--active': isResizing }" title="拖动调整面板宽度" @mousedown.prevent="startResize" />

    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <span class="text-xs font-medium text-text-secondary">AI 助手</span>
      <div class="flex items-center gap-1">
        <button class="ai-btn relative" title="人物/大纲变化检测" @click="showConsistency = true">
          <ListChecks :size="14" />
          <span v-if="detectionStore.pendingCount > 0" class="ai-btn-dot" />
        </button>
        <button class="ai-btn" :class="{ 'ai-btn--active': showQuickActions }"
          title="快捷操作（续写/润色/扩写/检查）" @click="toggleQuickActions">
          <Zap :size="14" />
        </button>
        <button class="ai-btn" title="摘要库（存为摘要的内容）" @click="showSummaries = true">
          <NotebookText :size="14" />
        </button>
        <button class="ai-btn" title="展开对话 (Ctrl+Shift+A)" @click="$emit('expand')">
          <Expand :size="14" />
        </button>
      </div>
    </div>

    <!-- 状态行 -->
    <div class="px-3 py-1.5 border-b shrink-0 flex items-center justify-between gap-2"
      style="border-color: var(--color-border)">
      <span class="text-[10px] text-text-muted">{{ settings.aiProvider }} · {{ settings.aiModel }}</span>
      <span v-if="!settings.aiApiKey" class="text-[10px] text-warning flex items-center gap-0.5"><AlertCircle :size="10" />未配置</span>
      <span v-else-if="activeFile" class="text-[10px] text-text-muted truncate max-w-[150px] flex items-center gap-1" :title="activeFile.name"><FileText :size="10" />{{ activeFile.name }}<template v-if="selection"> · 选中 {{ selection.words }} 字</template></span>
    </div>

    <!-- 快捷操作（可折叠） -->
    <Transition name="fade-fast">
    <div v-if="showQuickActions" class="px-3 py-2 border-b shrink-0" style="border-color: var(--color-border)">
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="a in quickActions" :key="a.label" class="quick-btn"
          :disabled="quickDisabled(a)" :title="quickTitle(a)" @click="runQuick(a)">
          {{ a.label }}
        </button>
      </div>
    </div>
    </Transition>

    <!-- 对话 -->
    <div ref="chatEl" class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
      <div v-if="!activeConversation || activeConversation.messages.length === 0" class="text-xs text-text-muted text-center py-8">
        点击上方快捷操作，或直接输入对话
      </div>
      <ChatMessage v-for="(msg, i) in (activeConversation?.messages || [])" :key="i"
        :msg="msg" :html="messageHtml(msg, i)" density="compact"
        :applied="appliedIndex === i" :inserted="insertedIndex === i" :saved="savedIndex === i"
        :can-save-summary="!!activeFile"
        @apply-diff="(merged) => handleApplyDiff(merged, i)" @reject-diff="handleRejectDiff(i)"
        @insert="handleInsertClick(msg.content, i)" @save-summary="saveAsSummary(msg.content, i)" />
      <div v-if="loading" class="chat-typing"><span /><span /><span /></div>
    </div>

    <!-- 输入区：上下文条 + 输入框 -->
    <div class="p-3 border-t shrink-0" style="border-color: var(--color-border)">
      <AiContextBar class="mb-2" :label="contextLabel" :counts="contextCounts" />
      <textarea v-model="inputText" class="ai-input" rows="2"
        placeholder="Ctrl+Enter 发送，Enter 换行"
        :disabled="chatStore.streaming"
        @keydown.ctrl.enter.prevent="handleSend" />
      <p v-if="showKeyHint && !settings.aiApiKey" class="text-[10px] text-warning mt-1.5">
        请先在设置中配置 API Key（Ctrl+,）
      </p>
      <button v-if="chatStore.streaming" class="chat-stop-btn mt-2" @click="chatStore.abortStreaming()">
        <Square :size="12" /> 停止生成
      </button>
    </div>

    <!-- 摘要库弹层 -->
    <SummaryLibrary
      :show="showSummaries"
      :project-root="projectRoot"
      @close="showSummaries = false"
      @insert="(text) => emit('insert', text)"
    />
    <ConsistencyPanel
      :show="showConsistency"
      :project-root="projectRoot"
      @close="showConsistency = false"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { Expand, Square, NotebookText, Zap, ListChecks, FileText, AlertCircle } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useAiChat } from '../composables/useAiChat'
import { storeToRefs } from 'pinia'
import { useSelectionStore, type EditorSelection } from '../stores/selection'
import { QUICK_ACTIONS, type QuickAction } from '../composables/aiQuickActions'
import ChatMessage from './ChatMessage.vue'
import AiContextBar from './AiContextBar.vue'
import SummaryLibrary from './SummaryLibrary.vue'
import ConsistencyPanel from './ConsistencyPanel.vue'
import { useDetectionStore } from '../stores/detection'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
  /** 把 AI 结果替换进编辑器选区（App 转发到 MdEditor） */
  applyToSelection?: (target: { path: string; from: number; to: number; original?: string }, text: string) => boolean | Promise<boolean>
}>()
const emit = defineEmits<{ expand: []; insert: [text: string] }>()

const settings = useSettingsStore()
const detectionStore = useDetectionStore()
const selectionStore = useSelectionStore()
const { selection } = storeToRefs(selectionStore)

const chatEl = ref<HTMLElement>()
const inputText = ref('')
const showSummaries = ref(false)
const showConsistency = ref(false)

// ── 面板宽度：可拖拽调整，跨会话记忆 ──
const PANEL_MIN = 280
const PANEL_MAX = 640
const PANEL_WIDTH_KEY = 'ai-panel-width'

function clampWidth(v: number): number {
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(v)))
}

const panelWidth = ref<number>(360)
{
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  if (Number.isFinite(saved) && saved > 0) panelWidth.value = clampWidth(saved)
}

let resizeState: { startX: number; startWidth: number } | null = null
const isResizing = ref(false)

function onResizeMove(e: MouseEvent) {
  if (!resizeState) return
  // 手柄在面板左缘：鼠标左移 → 面板变宽
  panelWidth.value = clampWidth(resizeState.startWidth + (resizeState.startX - e.clientX))
}
function onResizeEnd() {
  if (!resizeState) return
  resizeState = null
  isResizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  document.body.style.userSelect = ''
  localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value))
}
function startResize(e: MouseEvent) {
  resizeState = { startX: e.clientX, startWidth: panelWidth.value }
  isResizing.value = true
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  document.body.style.userSelect = 'none'
}
onUnmounted(onResizeEnd)

// ── 快捷操作区折叠状态（跨会话记忆） ──
const showQuickActions = ref(localStorage.getItem('ai-panel-quick-open') !== '0')
function toggleQuickActions() {
  showQuickActions.value = !showQuickActions.value
  localStorage.setItem('ai-panel-quick-open', showQuickActions.value ? '1' : '0')
}

// AI 对话共享逻辑（与全屏对话共用）
const {
  chatStore,
  loading,
  activeConversation,
  contextLabel,
  contextCounts,
  showKeyHint,
  appliedIndex,
  savedIndex,
  insertedIndex,
  messageHtml,
  handleApplyDiff,
  handleRejectDiff,
  handleInsertClick,
  saveAsSummary,
  send,
} = useAiChat({
  projectRoot: () => props.projectRoot,
  activeFile: () => props.activeFile,
  insert: (text) => emit('insert', text),
  applyToSelection: props.applyToSelection,
  scrollToBottom: () => nextTick(() => {
    const el = chatEl.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTo(0, el.scrollHeight)
  }),
})

// 流式输出期间自动跟随滚动：最后一条消息每增长一个 token 就检查一次，
// 用户手动上滚查看历史时（距离底部 ≥48px）不打扰
watch(() => {
  const msgs = activeConversation.value?.messages
  const last = msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null
  return last && last.role === 'assistant' ? last.content.length : -1
}, () => {
  if (!chatStore.streaming) return
  nextTick(() => {
    const el = chatEl.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTo(0, el.scrollHeight)
  })
})

// 快捷操作：内置提示词 + 用户在设置里的覆盖（按 label）
const quickActions = QUICK_ACTIONS.map((a) => ({
  ...a,
  prompt: settings.aiQuickPrompts[a.label] || a.prompt,
}))

// 编辑类操作保留原文供 DiffView 对比；续写/检查等不对比
const DIFF_ACTIONS = new Set(['润色', '扩写'])
// 依赖划词选区的操作：无选区时禁用并提示（而不是点了才发现没反应）
const SELECTION_REQUIRED = new Set(['润色', '扩写'])
// 有选区时优先针对选区执行的操作
const SELECTION_AWARE = new Set(['润色', '扩写', '检查'])

function quickDisabled(a: QuickAction): boolean {
  if (chatStore.streaming) return true
  if (SELECTION_REQUIRED.has(a.label) && !selection.value) return true
  return false
}

function quickTitle(a: QuickAction): string {
  if (SELECTION_REQUIRED.has(a.label) && !selection.value) return '先选中文字再使用'
  if (selection.value && SELECTION_AWARE.has(a.label)) return `针对选中内容（${selection.value.words} 字）`
  return a.hint
}

function runQuick(action: { label: string; prompt: string; hint?: string }) {
  if (SELECTION_REQUIRED.has(action.label) && !selection.value) return
  const sel = SELECTION_AWARE.has(action.label) ? selection.value : null
  handleQuickAction(action.label, action.prompt, sel)
}

async function handleQuickAction(label: string, prompt: string, sel: EditorSelection | null) {
  if (chatStore.streaming) return
  const requestText = sel
    ? `本次操作的对象是【选中文字】（共 ${sel.words} 字），不是全文。\n${prompt}\n\n【选中文字】\n"""\n${sel.text}\n"""`
    : prompt
  const diffable = DIFF_ACTIONS.has(label) && !!sel
  await send({
    text: requestText,
    display: sel ? `[${label}·选中 ${sel.words} 字]` : '[' + label + ']',
    withOriginal: diffable,
    selection: diffable && sel ? { path: sel.path, from: sel.from, to: sel.to, text: sel.text } : undefined,
  })
}

// 编辑器划词工具条的动作：面板消费执行（App 会先自动打开面板）
// immediate：面板可能在动作触发后才被 App 打开（挂载时补消费一次）
watch(() => selectionStore.pendingAction, (action) => {
  if (!action) return
  if (chatStore.streaming) return // 正在生成：不消费，用户可在结束后重新触发
  selectionStore.consumePendingAction()
  void handleQuickAction(action.label, action.prompt, action.selection)
}, { immediate: true })

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return
  const ok = await send({ text, display: text })
  if (ok) inputText.value = ''
}
</script>

<style scoped>
.ai-panel { font-size: 13px; }

.resize-handle {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.12s ease;
}
.resize-handle:hover { background: var(--color-accent-border); }

.quick-btn {
  flex: 1;
  padding: 5px 0;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: var(--color-bg-page);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.quick-btn:hover:not(:disabled) {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}
.quick-btn:disabled { opacity: 0.4; cursor: default; }
.ai-btn {
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer; font-size: 12px;
}
.ai-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.ai-btn--active { color: var(--color-accent); }
/* 消息渲染样式（角色/Diff/Markdown/操作按钮）由 ChatMessage 组件统一提供 */
/* 待处理项是提醒不是错误，用强调色而非危险色 */
.ai-btn-dot {
  position: absolute; top: 2px; right: 2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--color-accent);
}

/* 快捷操作区折叠淡入淡出 */
.fade-fast-enter-active,
.fade-fast-leave-active { transition: opacity 0.12s ease; }
.fade-fast-enter-from,
.fade-fast-leave-to { opacity: 0; }

/* 拖拽中手柄持续高亮 */
.resize-handle--active { background: var(--color-accent); }

/* 打字中指示器 */
.chat-typing { display: flex; gap: 3px; padding: 4px 0; }
.chat-typing span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--color-text-muted);
  animation: typing-bounce 1.2s ease-in-out infinite;
}
.chat-typing span:nth-child(2) { animation-delay: 0.15s; }
.chat-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-3px); opacity: 1; }
}
</style>
