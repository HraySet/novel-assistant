<template>
  <aside class="ai-panel w-ai-panel shrink-0 border-l flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">

    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <span class="text-xs font-medium text-text-secondary">AI 助手</span>
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
    </div>

    <!-- 对话 -->
    <div ref="chatEl" class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
      <div v-if="!activeConversation || activeConversation.messages.length === 0" class="text-xs text-text-muted text-center py-8">
        点击右侧 续/润/扩/查 开始，或直接输入对话
      </div>
      <div v-for="(msg, i) in (activeConversation?.messages || [])" :key="i"
        :class="[msg.role === 'user' ? 'chat-user' : 'chat-ai', msg.originalContent ? 'chat-msg--diff' : '']">
        <div class="chat-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <DiffView
          v-if="msg.originalContent && msg.content"
          :editable="true"
          :old-text="msg.originalContent"
          :new-text="msg.content"
          @accept="(merged) => handleApplyDiff(merged)"
          @reject="console.log('diff rejected')"
        />
        <div v-else class="chat-content" v-html="sanitizeHtml(renderMarkdown(msg.content))" />
      </div>
      <div v-if="loading" class="text-xs text-text-muted">...</div>
    </div>

    <!-- 输入 -->
    <div class="p-3 border-t shrink-0" style="border-color: var(--color-border)">
      <textarea v-model="inputText" class="ai-input" rows="2"
        placeholder="输入消息，点击右侧 续/润/扩/查"
        :disabled="chatStore.streaming"
        @keydown.enter.exact.prevent="handleSend" />
      <button v-if="chatStore.streaming" class="chat-stop-btn mt-2" @click="chatStore.abortStreaming()">
        <Square :size="12" /> 停止生成
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useChatStore } from '../stores/chat'
import { buildAiHeaders, getAiEndpoint } from '../composables/useAiApi'
import DOMPurify from 'dompurify'
import { Expand, Square } from 'lucide-vue-next'
import { renderMarkdown } from '../composables/useMarkdown'
import { useAiContext } from '../composables/useAiContext'
import DiffView from './DiffView.vue'
import { useFileStore } from '../stores/file'
import * as api from '../api/files'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
  quickAction?: string | null
}>()
const emit = defineEmits<{ expand: [] }>()

const settings = useSettingsStore()
const chatStore = useChatStore()
const fileStore = useFileStore()
const activeConversation = computed(() => chatStore.activeConversation())

async function handleApplyDiff(merged: string) {
  const path = props.activeFile?.path
  if (!path) return
  try {
    await api.writeFile(path, merged)
    fileStore.updateActiveFile({ content: merged, isDirty: false })
  } catch (e) {
    console.error('应用修改失败:', e)
  }
}

function sanitizeHtml(html: string): string { return DOMPurify.sanitize(html) }

const inputText = ref('')
const chatEl = ref<HTMLElement>()
const loading = ref(false)

// 统一上下文
const { build, contextLabel } = useAiContext(
  () => props.projectRoot,
  () => props.activeFile?.content,
  () => props.activeFile?.name,
)

// 首次打开或项目切换时加载对话
onMounted(() => { if (props.projectRoot) chatStore.loadConversations(props.projectRoot) })
watch(() => props.projectRoot, (root) => { if (root) chatStore.loadConversations(root) })

// 自动触发快捷操作（App.vue 每次调用后 nextTick 重置为 null，保证同按钮可连点）
watch(() => props.quickAction, (action) => {
  if (!action) return
  const map: Record<string, string> = {
    '续写': '请续写以下内容，保持风格一致，直接给出续写结果：',
    '润色': '请润色以下文字，保持原意不变，优化表达和节奏：',
    '扩写': '请对以下内容进行扩写，增加细节和描写，但不要偏离原意：',
    '检查': '请检查以下角色一致性、伏笔、逻辑问题，指出语法错误、逻辑矛盾或可以改进的地方：',
  }
  const prompt = map[action]
  if (prompt) handleQuickAction(action, prompt)
})

function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return
  chatStore.streaming = true
  build()
    .then(({ prompt }) => { send(text, '', prompt) })
    .catch(() => { chatStore.streaming = false })
}

function handleQuickAction(label: string, prompt: string) {
  if (chatStore.streaming) return
  chatStore.streaming = true
  build()
    .then(({ prompt: ctx }) => { send(prompt, label, ctx) })
    .catch(() => { chatStore.streaming = false })
}

async function send(text: string, prefix: string, contextPrompt?: string) {
  if (!settings.aiApiKey) return

  let conv = activeConversation.value
  if (!conv) conv = chatStore.createConversation(undefined, props.activeFile?.path)
  const convId = conv.id
  inputText.value = ''
  loading.value = true

  const priorHistory = conv.messages
    .filter(m => m.content !== '')
    .map(m => ({ role: m.role, content: m.content }))

  const displayMsg = prefix ? `[${prefix}]` : text
  chatStore.addMessage(convId, { role: 'user', content: displayMsg })

  // 快捷操作时保存原始文件内容，供 DiffView 对比
  const originalContent = prefix ? (props.activeFile?.content ?? '') : undefined
  chatStore.addMessage(convId, { role: 'assistant', content: '', originalContent })

  try {
    const isClaude = settings.aiProvider === 'claude'
    const body = isClaude
      ? {
          model: settings.aiModel, max_tokens: 4096,
          system: contextPrompt || undefined,
          messages: [...priorHistory, { role: 'user', content: text }],
          stream: true,
        }
      : {
          model: settings.aiModel,
          messages: [
            ...(contextPrompt ? [{ role: 'system' as const, content: contextPrompt }] : []),
            ...priorHistory,
            { role: 'user', content: text },
          ],
          stream: true,
        }
    const url = isClaude
      ? `${getAiEndpoint()}/messages`
      : `${getAiEndpoint()}/chat/completions`

    const ctrl = chatStore.createAbortController()
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAiHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      chatStore.updateLastMessage(convId, `请求失败 (${res.status})`)
      return
    }

    if (isClaude) {
      const reader = res.body?.getReader()
      if (!reader) { chatStore.updateLastMessage(convId, '(无法读取响应)'); return }
      const decoder = new TextDecoder()
      let buffer = ''
      let result = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'content_block_delta') {
                result += data.delta?.text ?? ''
                chatStore.updateLastMessage(convId, result)
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* 中断保留已生成内容 */ }
    } else {
      const reader = res.body?.getReader()
      if (!reader) { chatStore.updateLastMessage(convId, '(无法读取响应)'); return }
      const decoder = new TextDecoder()
      let buffer = ''
      let result = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
              const chunk = JSON.parse(line.slice(6))
              result += chunk.choices?.[0]?.delta?.content ?? ''
              chatStore.updateLastMessage(convId, result)
            } catch { /* skip */ }
          }
        }
      } catch {
        // 中断时已生成内容保留
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      chatStore.updateLastMessage(convId, '网络请求失败')
    }
  } finally {
    chatStore.streaming = false
    loading.value = false
    nextTick(() => { chatEl.value?.scrollTo(0, chatEl.value.scrollHeight) })
  }
}
</script>

<style scoped>
.ai-panel { font-size: 13px; }
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

.chat-content :deep(h1) { font-size: 1.2em; font-weight: 700; margin: 8px 0 4px; }
.chat-content :deep(h2) { font-size: 1.1em; font-weight: 600; margin: 6px 0 3px; }
.chat-content :deep(h3) { font-size: 1em; font-weight: 600; margin: 4px 0 2px; }
.chat-content :deep(code) { font-family: var(--font-mono); font-size: 0.9em; background: var(--color-bg-surface); padding: 1px 4px; border-radius: 3px; }
.chat-content :deep(pre) { background: var(--color-bg-surface); padding: 8px 12px; border-radius: var(--radius-md); overflow-x: auto; margin: 6px 0; }
.chat-content :deep(pre code) { background: none; padding: 0; }
.chat-content :deep(strong) { font-weight: 700; }
.chat-content :deep(em) { font-style: italic; }
</style>
