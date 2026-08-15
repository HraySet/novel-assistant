<template>
  <aside class="ai-panel w-ai-panel shrink-0 border-l flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">

    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <span class="text-xs font-medium text-text-secondary">AI 助手</span>
      <button class="ai-btn" title="摘要库（存为摘要的内容）" @click="showSummaries = true">
        <NotebookText :size="14" />
      </button>
      <button class="ai-btn" title="展开对话 (Ctrl+Shift+A)" @click="$emit('expand')">
        <Expand :size="14" />
      </button>
    </div>

    <div class="px-3 py-2 border-b shrink-0" style="border-color: var(--color-border)">
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-text-muted">{{ settings.aiProvider }} · {{ settings.aiModel }}</span>
        <span v-if="!settings.aiApiKey" class="text-[10px] text-warning">未配置</span>
        <span v-else-if="activeFile" class="text-[10px] text-text-muted">📄 {{ activeFile.name }}</span>
      </div>
      <AiContextBar class="mt-1.5" :label="contextLabel" />
    </div>

    <!-- 快捷操作 -->
    <div class="px-3 py-2 border-b shrink-0" style="border-color: var(--color-border)">
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="a in quickActions" :key="a.label" class="quick-btn"
          :disabled="chatStore.streaming" :title="a.hint" @click="runQuick(a)">
          {{ a.label }}
        </button>
      </div>
    </div>

    <!-- 对话 -->
    <div ref="chatEl" class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
      <div v-if="!activeConversation || activeConversation.messages.length === 0" class="text-xs text-text-muted text-center py-8">
        点击上方快捷操作，或直接输入对话
      </div>
      <div v-for="(msg, i) in (activeConversation?.messages || [])" :key="i"
        :class="[msg.role === 'user' ? 'chat-user' : 'chat-ai', msg.originalContent ? 'chat-msg--diff' : '']">
        <div class="chat-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <DiffView
          v-if="msg.originalContent && msg.content"
          :editable="true"
          :old-text="msg.originalContent"
          :new-text="msg.content"
          @accept="(merged) => handleApplyDiff(merged, i)"
          @reject="handleRejectDiff(i)"
        />
        <div v-else class="chat-content" v-html="messageHtml(msg, i)" />
        <div v-if="msg.role === 'assistant' && msg.content && !msg.originalContent" class="chat-actions-row">
          <span v-if="appliedIndex === i" class="chat-applied-note">✓ 已应用到文件</span>
          <template v-else>
            <button class="chat-mini-btn" @click="handleInsertClick(msg.content, i)">{{ insertedIndex === i ? '✓ 已插入' : '插入编辑器' }}</button>
            <button class="chat-mini-btn" :disabled="!activeFile" @click="saveAsSummary(msg.content, i)">
              {{ savedIndex === i ? '✓ 已存入前情' : '存为摘要' }}
            </button>
          </template>
        </div>
      </div>
      <div v-if="loading" class="text-xs text-text-muted">...</div>
    </div>

    <!-- 输入 -->
    <div class="p-3 border-t shrink-0" style="border-color: var(--color-border)">
      <textarea v-model="inputText" class="ai-input" rows="2"
        placeholder="输入消息，或使用上方快捷操作"
        :disabled="chatStore.streaming"
        @keydown.enter.exact.prevent="handleSend" />
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
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Expand, Square, NotebookText } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import { useAiChat } from '../composables/useAiChat'
import { QUICK_ACTIONS } from '../composables/aiQuickActions'
import DiffView from './DiffView.vue'
import AiContextBar from './AiContextBar.vue'
import SummaryLibrary from './SummaryLibrary.vue'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
}>()
const emit = defineEmits<{ expand: []; insert: [text: string] }>()

const settings = useSettingsStore()

const chatEl = ref<HTMLElement>()
const inputText = ref('')
const showSummaries = ref(false)

// AI 对话共享逻辑（与全屏对话共用）
const {
  chatStore,
  loading,
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
} = useAiChat({
  projectRoot: () => props.projectRoot,
  activeFile: () => props.activeFile,
  insert: (text) => emit('insert', text),
  scrollToBottom: () => nextTick(() => {
    const el = chatEl.value
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 48) el.scrollTo(0, el.scrollHeight)
  }),
})

// 快捷操作：内置提示词 + 用户在设置里的覆盖（按 label）
const quickActions = QUICK_ACTIONS.map((a) => ({
  ...a,
  prompt: settings.aiQuickPrompts[a.label] || a.prompt,
}))

// 编辑类操作保留原文供 DiffView 对比；续写/检查等不对比
const DIFF_ACTIONS = new Set(['润色', '扩写'])

function runQuick(action: { label: string; prompt: string; hint?: string }) {
  handleQuickAction(action.label, action.prompt)
}

async function handleQuickAction(label: string, prompt: string) {
  if (chatStore.streaming) return
  await send({ text: prompt, display: '[' + label + ']', withOriginal: DIFF_ACTIONS.has(label) })
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return
  const ok = await send({ text, display: text })
  if (ok) inputText.value = ''
}
</script>

<style scoped>
.ai-panel { font-size: 13px; }
.quick-btn {
  flex: 1;
  padding: 4px 0;
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
.chat-user, .chat-ai { margin-bottom: 8px; }
.chat-msg--diff { max-width: none; }
.chat-msg--diff .chat-role { margin-bottom: 6px; }
.chat-role { font-size: 10px; font-weight: 600; margin-bottom: 2px; color: var(--color-text-muted); }
.chat-ai .chat-role { color: var(--color-accent); }
.chat-content { font-size: 12px; line-height: 1.6; color: var(--color-text-primary); white-space: pre-wrap; word-break: break-word; }
.ai-input {
  width: 100%; resize: none; border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: 8px 10px; font-size: 12px; font-family: inherit;
  background: var(--color-bg-page); color: var(--color-text-primary); outline: none;
}
.ai-input:focus { border-color: var(--color-accent-border); }
.chat-stop-btn {
  width: 100%; padding: 6px 0; border-radius: var(--radius-sm); font-size: 12px; font-family: inherit;
  color: var(--color-danger); background: var(--color-danger-bg);
  border: 1px solid var(--color-danger-border); cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.chat-stop-btn:hover { background: var(--color-danger); color: #fff; }
.chat-actions-row { margin-top: 4px; }
.chat-mini-btn {
  font-size: 10px; padding: 2px 8px; border-radius: var(--radius-sm);
  color: var(--color-text-muted); background: none;
  border: 1px solid var(--color-border); cursor: pointer; font-family: inherit;
  transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}
.chat-mini-btn:hover:not(:disabled) {
  background: var(--color-accent-bg); color: var(--color-accent); border-color: var(--color-accent-border);
}
.chat-mini-btn:disabled { opacity: 0.4; cursor: default; }
.chat-applied-note { font-size: 10px; color: var(--color-success); }

.chat-content :deep(h1) { font-size: 1.2em; font-weight: 700; margin: 8px 0 4px; }
.chat-content :deep(h2) { font-size: 1.1em; font-weight: 600; margin: 6px 0 3px; }
.chat-content :deep(h3) { font-size: 1em; font-weight: 600; margin: 4px 0 2px; }
.chat-content :deep(code) { font-family: var(--font-mono); font-size: 0.9em; background: var(--color-bg-surface); padding: 1px 4px; border-radius: 3px; }
.chat-content :deep(pre) { background: var(--color-bg-surface); padding: 8px 12px; border-radius: var(--radius-md); overflow-x: auto; margin: 6px 0; }
.chat-content :deep(pre code) { background: none; padding: 0; }
.chat-content :deep(strong) { font-weight: 700; }
.chat-content :deep(em) { font-style: italic; }
</style>
