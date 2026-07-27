<template>
  <aside class="ai-panel w-ai-panel shrink-0 border-l flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">

    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <span class="text-xs font-medium text-text-secondary">AI 助手</span>
      <button class="ai-btn" title="展开对话 (Ctrl+Shift+A)" @click="$emit('expand')">
        ⤢
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
        :class="msg.role === 'user' ? 'chat-user' : 'chat-ai'">
        <div class="chat-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="chat-content">{{ msg.content }}</div>
      </div>
      <div v-if="loading" class="text-xs text-text-muted">...</div>
    </div>

    <!-- 输入 -->
    <div class="p-3 border-t shrink-0" style="border-color: var(--color-border)">
      <textarea v-model="inputText" class="ai-input" rows="2"
        placeholder="输入消息或点上方快捷操作..."
        :disabled="chatStore.streaming"
        @keydown.enter.exact.prevent="handleSend" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useChatStore } from '../stores/chat'
import { buildAiHeaders, getAiEndpoint } from '../composables/useAiApi'
import * as api from '../api/files'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
  quickAction?: string | null
}>()
const emit = defineEmits<{ expand: [] }>()

const settings = useSettingsStore()
const chatStore = useChatStore()
const activeConversation = computed(() => chatStore.activeConversation())

const inputText = ref('')
const chatEl = ref<HTMLElement>()
const loading = ref(false)

// 首次打开或项目切换时加载对话
onMounted(() => { if (props.projectRoot) chatStore.loadConversations(props.projectRoot) })
watch(() => props.projectRoot, (root) => { if (root) chatStore.loadConversations(root) })

// 自动触发快捷操作
watch(() => props.quickAction, (action) => {
  if (!action) return
  const map: Record<string, string> = {
    '续写': '请续写以下内容，保持风格一致，直接给出续写结果：',
    '润色': '请润色以下文字，保持原意不变，优化表达和节奏：',
    '扩写': '请对以下内容进行扩写，增加细节和描写，但不要偏离原意：',
    '检查': '请检查以下内容，指出语法错误、逻辑矛盾或可以改进的地方：',
  }
  const prompt = map[action]
  if (prompt) runQuickAction(action, prompt)
})

async function readFileContent(): Promise<string> {
  if (!props.activeFile?.path) return ''
  try {
    if (props.activeFile.content) return props.activeFile.content
    return await api.readFile(props.activeFile.path)
  } catch { return '' }
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return
  send(text, '')
}

async function runQuickAction(label: string, prompt: string) {
  const fileContent = await readFileContent()
  const context = fileContent
    ? `${prompt}\n\n---\n${fileContent.slice(-3000)}\n---`
    : prompt
  send(context, label)
}

async function send(content: string, prefix: string) {
  if (!settings.aiApiKey) return

  let conv = activeConversation.value
  if (!conv) conv = chatStore.createConversation(undefined, props.activeFile?.path)
  const convId = conv.id
  inputText.value = ''

  const displayMsg = prefix ? `[${prefix}]` : content
  chatStore.addMessage(convId, { role: 'user', content: displayMsg })
  chatStore.addMessage(convId, { role: 'assistant', content: '' })
  chatStore.streaming = true
  loading.value = true

  try {
    // 把历史对话作为上下文一起发送
    const history = conv.messages
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    const isClaude = settings.aiProvider === 'claude'
    const apiMessages = [...history, { role: 'user', content }]
    const body = isClaude
      ? { model: settings.aiModel, max_tokens: 4096, messages: apiMessages }
      : { model: settings.aiModel, messages: apiMessages, stream: true }
    const url = isClaude
      ? `${getAiEndpoint()}/messages`
      : `${getAiEndpoint()}/chat/completions`

    const res = await fetch(url, {
      method: 'POST',
      headers: buildAiHeaders(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      chatStore.updateLastMessage(convId, `请求失败 (${res.status})`)
      return
    }

    if (isClaude) {
      const data = await res.json()
      chatStore.updateLastMessage(convId, data?.content?.[0]?.text ?? '(无响应)')
    } else {
      const reader = res.body?.getReader()
      if (!reader) { chatStore.updateLastMessage(convId, '(无法读取响应)'); return }
      const decoder = new TextDecoder()
      let buffer = ''
      let result = ''
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
    }
  } catch {
    chatStore.updateLastMessage(convId, '网络请求失败')
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
.chat-role { font-size: 10px; font-weight: 600; margin-bottom: 2px; color: var(--color-text-muted); }
.chat-ai .chat-role { color: var(--color-accent); }
.chat-content { font-size: 12px; line-height: 1.6; color: var(--color-text-primary); white-space: pre-wrap; word-break: break-word; }
.ai-input {
  width: 100%; resize: none; border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: 8px 10px; font-size: 12px; font-family: inherit;
  background: var(--color-bg-page); color: var(--color-text-primary); outline: none;
}
.ai-input:focus { border-color: var(--color-accent-border); }
</style>
