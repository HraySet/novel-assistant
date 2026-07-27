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

    <!-- 快捷操作 -->
    <div class="flex flex-wrap gap-1.5 px-3 py-2 border-b shrink-0" style="border-color: var(--color-border)">
      <button v-for="action in quickActions" :key="action.label"
        class="quick-action-btn" @click="runQuickAction(action)">
        {{ action.label }}
      </button>
    </div>

    <!-- 对话 -->
    <div ref="chatEl" class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
      <div v-if="messages.length === 0" class="text-xs text-text-muted text-center py-8">
        点一个快捷操作，或直接输入对话
      </div>
      <div v-for="(msg, i) in messages" :key="i"
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
        @keydown.enter.exact.prevent="handleSend" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { buildAiHeaders, getAiEndpoint } from '../composables/useAiApi'
import * as api from '../api/files'

const CHATLOG_DIR = '.chatlog'
const CHATLOG_FILE = 'history.json'

const props = defineProps<{
  activeFile?: { path: string; name: string; content?: string } | null
  projectRoot?: string
}>()
defineEmits<{ expand: [] }>()

const settings = useSettingsStore()
const inputText = ref('')
const messages = ref<{ role: string; content: string }[]>([])
const chatEl = ref<HTMLElement>()
const loading = ref(false)

function chatlogPath(): string {
  if (!props.projectRoot) return ''
  return `${props.projectRoot.replace(/\\/g, '/')}/${CHATLOG_DIR}`
}

function chatlogFilePath(): string {
  return `${chatlogPath()}/${CHATLOG_FILE}`
}

async function loadMessages() {
  if (!props.projectRoot) return
  try {
    const content = await api.readFile(chatlogFilePath())
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) messages.value = parsed
  } catch { /* 没有历史记录 */ }
}

async function saveMessages() {
  if (!props.projectRoot || messages.value.length === 0) return
  try {
    await api.createDir(chatlogPath())
  } catch { /* 目录可能已存在 */ }
  try {
    await api.writeFile(chatlogFilePath(), JSON.stringify(messages.value))
  } catch { /* 保存失败不阻塞 */ }
}

// 项目切换时加载历史
watch(() => props.projectRoot, (root) => {
  messages.value = []
  if (root) loadMessages()
})

onMounted(() => { if (props.projectRoot) loadMessages() })

// 消息变化后防抖保存
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(messages, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveMessages, 2000)
}, { deep: true })

const quickActions = [
  { label: '续写', prompt: '请续写以下内容，保持风格一致，直接给出续写结果：' },
  { label: '润色', prompt: '请润色以下文字，保持原意不变，优化表达和节奏：' },
  { label: '扩写', prompt: '请对以下内容进行扩写，增加细节和描写，但不要偏离原意：' },
  { label: '检查', prompt: '请检查以下内容，指出语法错误、逻辑矛盾或可以改进的地方：' },
]

async function readFileContent(): Promise<string> {
  if (!props.activeFile?.path) return ''
  try {
    if (props.activeFile.content) return props.activeFile.content
    return await api.readFile(props.activeFile.path)
  } catch { return '' }
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  send(text, '')
}

async function runQuickAction(action: typeof quickActions[number]) {
  const fileContent = await readFileContent()
  const context = fileContent
    ? `${action.prompt}\n\n---\n${fileContent.slice(-3000)}\n---`
    : action.prompt
  send(context, action.label)
}

async function send(content: string, prefix: string) {
  if (!settings.aiApiKey) return
  if (prefix) {
    messages.value.push({ role: 'user', content: `[${prefix}]` })
  } else {
    messages.value.push({ role: 'user', content })
  }
  inputText.value = ''
  loading.value = true

  try {
    const isClaude = settings.aiProvider === 'claude'
    const body = isClaude
      ? { model: settings.aiModel, max_tokens: 2048, messages: [{ role: 'user', content }] }
      : { model: settings.aiModel, messages: [{ role: 'user', content }], stream: true }
    const url = isClaude
      ? `${getAiEndpoint()}/messages`
      : `${getAiEndpoint()}/chat/completions`

    const res = await fetch(url, {
      method: 'POST',
      headers: buildAiHeaders(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      messages.value.push({ role: 'assistant', content: `错误 ${res.status}` })
      return
    }

    messages.value.push({ role: 'assistant', content: '' })
    const last = messages.value[messages.value.length - 1]

    if (isClaude) {
      const data = await res.json()
      last.content = data?.content?.[0]?.text ?? '(无响应)'
    } else {
      const reader = res.body?.getReader()
      if (!reader) return
      const decoder = new TextDecoder()
      let buffer = ''
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
            last.content += chunk.choices?.[0]?.delta?.content ?? ''
          } catch { /* skip */ }
        }
      }
    }
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `请求失败` })
  } finally {
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
.quick-action-btn {
  padding: 3px 8px; border-radius: var(--radius-sm); font-size: 11px; font-family: inherit;
  color: var(--color-text-secondary); background: var(--color-bg-surface);
  border: 1px solid var(--color-border); cursor: pointer;
}
.quick-action-btn:hover { background: var(--color-bg-surface-hover); }
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
