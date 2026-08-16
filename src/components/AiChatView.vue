<template>
  <div class="ai-chat-view h-screen flex bg-bg-page">
    <!-- 对话列表侧栏 -->
    <aside class="chat-sidebar">
      <div class="chat-sidebar-header">
        <span class="text-xs font-medium text-text-secondary">对话</span>
        <button class="chat-sidebar-btn" title="新建对话" @click="handleNewChat">
          <Plus :size="14" />
        </button>
      </div>
      <div class="chat-sidebar-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="chat-sidebar-item"
          :class="{ 'chat-sidebar-item--active': conv.id === activeId }"
          role="button"
          tabindex="0"
          @click="chatStore.switchConversation(conv.id)"
          @keydown.enter="chatStore.switchConversation(conv.id)"
        >
          <span class="chat-sidebar-title">{{ conv.title }}</span>
          <span v-if="conv.fileContext" class="chat-sidebar-file" :title="conv.fileContext">{{ conv.fileContext.split(/[/\\]/).pop() }}</span>
          <span class="chat-sidebar-date">{{ formatDate(conv.updatedAt) }}</span>
          <button class="chat-sidebar-del" @click.stop="handleDelete(conv.id)">
            <X :size="10" />
          </button>
        </div>
        <div v-if="conversations.length === 0" class="text-xs text-text-muted text-center py-8">
          还没有对话
        </div>
      </div>
    </aside>

    <!-- 对话主体 -->
    <div class="chat-main">
      <!-- 顶栏 -->
      <div class="chat-topbar">
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <span class="text-sm font-medium truncate">{{ activeConversation?.title || '新对话' }}</span>
          <span v-if="contextLabel" class="text-[10px] text-text-muted flex-shrink-0">{{ contextLabel }}</span>
        </div>
        <button class="chat-collapse-btn" title="摘要库" @click="showSummaries = true">
          <NotebookText :size="16" />
        </button>
        <button class="chat-collapse-btn" title="返回编辑模式" @click="$emit('back')">
          <Minimize2 :size="16" />
        </button>
      </div>

      <!-- 消息区域 -->
      <div ref="chatEl" class="chat-messages">
        <div class="chat-messages-inner">
          <div v-if="!activeConversation || activeConversation.messages.length === 0" class="chat-empty">
            <Sparkles :size="32" class="chat-empty-icon" />
            <p>在这里跟 AI 深入讨论你的故事</p>
            <p class="text-xs mt-1 text-text-muted">Ctrl+Enter 发送，纯 Enter 换行</p>
            <p v-if="contextLabel" class="text-[10px] mt-2 text-text-muted">{{ contextLabel }}</p>
          </div>

          <ChatMessage v-for="(msg, i) in activeConversation?.messages || []" :key="i"
            :msg="msg" :html="messageHtml(msg, i)" density="roomy"
            :applied="appliedIndex === i" :inserted="insertedIndex === i" :saved="savedIndex === i"
            :can-save-summary="!!activeFile"
            :show-extras="i === (activeConversation?.messages.length ?? 0) - 1 && !chatStore.streaming"
            @apply-diff="(merged) => handleApplyDiff(merged, i)" @reject-diff="handleRejectDiff(i)"
            @insert="handleInsertClick(msg.content, i)" @save-summary="saveAsSummary(msg.content, i)"
            @regenerate="regenerate()" @copy="copyMessage(msg.content)" />

          <!-- 打字中指示器：首个 token 返回前的唯一反馈 -->
          <div v-if="loading" class="chat-typing"><span /><span /><span /></div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input-area">
        <AiContextBar class="mb-1.5 px-1" :label="contextLabel" :counts="contextCounts" />
        <div class="chat-input-row">
          <textarea
            ref="inputEl"
            v-model="inputText"
            class="chat-input"
            rows="3"
            placeholder="输入消息… (Ctrl+Enter 发送)"
            :disabled="chatStore.streaming"
            @keydown.ctrl.enter.prevent="handleSend"
          />
        </div>
        <p v-if="showKeyHint && !settings.aiApiKey" class="text-[10px] text-warning mt-1.5">
          请先在设置中配置 API Key（Ctrl+,）
        </p>
        <div v-if="chatStore.streaming" class="chat-input-actions">
          <button class="chat-stop-btn" @click="chatStore.abortStreaming()">
            <Square :size="12" /> 停止生成
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 摘要库弹层 -->
  <SummaryLibrary
    :show="showSummaries"
    :project-root="projectRoot"
    @close="showSummaries = false"
    @insert="(text) => emit('insert', text)"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, X, Minimize2, Square, NotebookText, Sparkles } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useChatStore } from '../stores/chat'
import { useAiChat } from '../composables/useAiChat'
import ChatMessage from './ChatMessage.vue'
import AiContextBar from './AiContextBar.vue'
import SummaryLibrary from './SummaryLibrary.vue'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
  /** 把 AI 结果替换进编辑器选区（App 转发到 MdEditor） */
  applyToSelection?: (target: { path: string; from: number; to: number; original?: string }, text: string) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  back: []
  insert: [text: string]
}>()

const chatStore = useChatStore()
const settings = useSettingsStore()
const { conversations, activeId } = storeToRefs(chatStore)

const chatEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()
const inputText = ref('')
const showSummaries = ref(false)

// AI 对话共享逻辑（与紧凑面板共用）
const {
  activeConversation,
  loading,
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
  regenerate,
  copyMessage,
  formatDate,
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

// 新消息时自动滚到底部
watch(() => activeConversation.value?.messages.length, () => {
  nextTick(() => {
    const el = chatEl.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTo(0, el.scrollHeight)
  })
})

// 流式输出期间自动跟随滚动（用户上滚查看历史时不打扰）
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

function handleNewChat() {
  chatStore.createConversation(undefined, props.activeFile?.path)
  nextTick(() => inputEl.value?.focus())
}

function handleDelete(id: string) { chatStore.deleteConversation(id) }

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return
  const ok = await send({ text, display: text })
  if (ok) inputText.value = ''
}
</script>

<style scoped>
.ai-chat-view { font-family: var(--font-sans); }

.chat-sidebar {
  width: 200px; border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface); display: flex; flex-direction: column; flex-shrink: 0;
}
.chat-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px; border-bottom: 1px solid var(--color-border);
}
.chat-sidebar-btn {
  width: 26px; height: 26px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer;
}
.chat-sidebar-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.chat-sidebar-list { flex: 1; overflow-y: auto; padding: 4px; }
.chat-sidebar-item {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer;
  font-size: 11px; color: var(--color-text-secondary);
  background: none; border: none; width: 100%; text-align: left; font-family: inherit;
  transition: background 0.1s;
}
.chat-sidebar-item:hover { background: var(--color-bg-surface-hover); }
.chat-sidebar-item--active { background: var(--color-accent-bg); color: var(--color-accent); }
.chat-sidebar-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-sidebar-date { font-size: 9px; color: var(--color-text-muted); flex-shrink: 0; }
.chat-sidebar-file {
  font-size: 9px;
  color: var(--color-text-muted);
  background: var(--color-bg-surface-hover);
  border-radius: 3px;
  padding: 0 4px;
  flex-shrink: 0;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-sidebar-del {
  width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s ease, background 0.1s ease, color 0.1s ease;
}
.chat-sidebar-item:hover .chat-sidebar-del { opacity: 1; }
.chat-sidebar-del:hover { background: var(--color-danger-bg); color: var(--color-danger); }

.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0; gap: 8px;
}
.chat-collapse-btn {
  width: 28px; height: 28px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer; flex-shrink: 0;
}
.chat-collapse-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.chat-messages { flex: 1; overflow-y: auto; padding: 24px 0; }
.chat-messages-inner { max-width: 680px; margin: 0 auto; padding: 0 24px; }
.chat-empty { text-align: center; color: var(--color-text-muted); padding: 64px 0; }
.chat-empty-icon { color: var(--color-accent); opacity: 0.4; margin-bottom: 16px; }
/* 消息渲染样式（角色/Diff/Markdown/操作按钮）由 ChatMessage 组件统一提供 */
.chat-typing { display: flex; gap: 3px; padding: 8px 0; }
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
