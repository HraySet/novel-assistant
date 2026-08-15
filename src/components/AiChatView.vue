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
            <div class="text-4xl mb-4">✦</div>
            <p>在这里跟 AI 深入讨论你的故事</p>
            <p class="text-xs mt-1 text-text-muted">Ctrl+Enter 发送，纯 Enter 换行</p>
            <p v-if="contextLabel" class="text-[10px] mt-2 text-text-muted">{{ contextLabel }}</p>
          </div>

          <div v-for="(msg, i) in activeConversation?.messages || []" :key="i" class="chat-msg"
            :class="[msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai', msg.originalContent ? 'chat-msg--diff' : '']">
            <div class="chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
            <DiffView
              v-if="msg.originalContent && msg.content"
              :editable="true"
              :old-text="msg.originalContent"
              :new-text="msg.content"
              @accept="(merged) => handleApplyDiff(merged, i)"
              @reject="handleRejectDiff(i)"
            />
            <div v-else class="chat-msg-content" v-html="messageHtml(msg, i)" />
            <div v-if="msg.role === 'assistant' && msg.content && !msg.originalContent" class="chat-msg-actions">
              <span v-if="appliedIndex === i" class="chat-applied-note">✓ 已应用到文件</span>
              <template v-else>
                <button class="chat-action-btn" @click="handleInsertClick(msg.content, i)">{{ insertedIndex === i ? '✓ 已插入' : '插入编辑器' }}</button>
                <button class="chat-action-btn" :disabled="!activeFile" @click="saveAsSummary(msg.content, i)">
                  {{ savedIndex === i ? '✓ 已存入前情' : '存为摘要' }}
                </button>
              </template>
            </div>
            <div
              v-if="msg.role === 'assistant' && msg.content && i === (activeConversation?.messages.length ?? 0) - 1 && !chatStore.streaming"
              class="chat-msg-actions"
            >
              <button class="chat-action-btn" @click="regenerate()">重新生成</button>
              <button class="chat-action-btn" @click="copyMessage(msg.content)">复制</button>
            </div>
          </div>

        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input-area">
        <AiContextBar class="mb-1.5 px-1" :label="contextLabel" />
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
import { Plus, X, Minimize2, Square, NotebookText } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useChatStore } from '../stores/chat'
import { useAiChat } from '../composables/useAiChat'
import DiffView from './DiffView.vue'
import AiContextBar from './AiContextBar.vue'
import SummaryLibrary from './SummaryLibrary.vue'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
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
  contextLabel,
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
.chat-sidebar-del {
  width: 16px; height: 16px; border-radius: 3px; flex-shrink: 0;
  display: none; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer;
}
.chat-sidebar-item:hover .chat-sidebar-del { display: flex; }
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
.chat-msg { margin-bottom: 20px; }
.chat-msg--user { text-align: right; }
.chat-msg-role { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--color-accent); }
.chat-msg--user .chat-msg-role { color: var(--color-text-muted); }
.chat-msg--diff { max-width: none; }
.chat-msg--diff .chat-msg-role { margin-bottom: 6px; }
.chat-msg-content { font-size: 14px; line-height: 1.7; color: var(--color-text-primary); white-space: pre-wrap; word-break: break-word; }
.chat-msg--user .chat-msg-content { color: var(--color-text-secondary); }
.chat-msg-actions { margin-top: 6px; }
.chat-applied-note { font-size: 11px; color: var(--color-success); }
.chat-action-btn {
  padding: 2px 10px; font-size: 11px; font-family: inherit;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-bg-surface); color: var(--color-text-secondary); cursor: pointer;
}
.chat-action-btn:hover { background: var(--color-accent-bg); color: var(--color-accent); border-color: var(--color-accent-border); }
.cursor-blink { animation: blink 1s step-end infinite; color: var(--color-accent); }
@keyframes blink { 50% { opacity: 0; } }

.chat-input-area { padding: 16px 20px; border-top: 1px solid var(--color-border); flex-shrink: 0; }
.chat-input-row { display: flex; max-width: 680px; margin: 0 auto; }
.chat-input {
  width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  padding: 12px 16px; font-size: 14px; font-family: inherit;
  background: var(--color-bg-elevated); color: var(--color-text-primary);
  resize: none; outline: none;
}
.chat-input:focus { border-color: var(--color-accent-border); }
.chat-input:disabled { opacity: 0.5; }
.chat-input-actions { max-width: 680px; margin: 0 auto; padding-top: 8px; display: flex; justify-content: flex-end; }
.chat-stop-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 12px; border-radius: var(--radius-sm); font-size: 12px; font-family: inherit;
  color: var(--color-danger); background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border); cursor: pointer;
}
.chat-stop-btn:hover { background: var(--color-danger); color: #fff; }

/* Markdown 渲染样式 */
.chat-msg-content :deep(h1) { font-size: 1.3em; font-weight: 700; margin: 12px 0 6px; }
.chat-msg-content :deep(h2) { font-size: 1.15em; font-weight: 600; margin: 10px 0 4px; }
.chat-msg-content :deep(h3) { font-size: 1.05em; font-weight: 600; margin: 8px 0 4px; }
.chat-msg-content :deep(p) { margin: 4px 0; }
.chat-msg-content :deep(ul) { padding-left: 16px; margin: 4px 0; }
.chat-msg-content :deep(li) { margin: 2px 0; }
.chat-msg-content :deep(code) {
  font-family: var(--font-mono); font-size: 0.9em;
  background: var(--color-bg-surface); padding: 1px 5px; border-radius: var(--radius-sm);
}
.chat-msg-content :deep(pre) {
  background: var(--color-bg-surface); padding: 10px 14px; border-radius: var(--radius-md);
  overflow-x: auto; margin: 8px 0;
}
.chat-msg-content :deep(pre code) { background: none; padding: 0; }
.chat-msg-content :deep(hr) { border: none; border-top: 1px solid var(--color-border); margin: 12px 0; }
.chat-msg-content :deep(strong) { font-weight: 700; }
.chat-msg-content :deep(em) { font-style: italic; }
</style>
