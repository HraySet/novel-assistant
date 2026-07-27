<template>
  <div class="ai-chat-view h-screen flex bg-bg-page">
    <!-- 对话列表侧栏 -->
    <aside class="chat-sidebar">
      <div class="chat-sidebar-header">
        <span class="text-xs font-medium text-text-secondary">对话</span>
        <button class="chat-sidebar-btn" title="新建对话" @click="handleNewChat">+</button>
      </div>
      <div class="chat-sidebar-list">
        <button
          v-for="conv in conversations"
          :key="conv.id"
          class="chat-sidebar-item"
          :class="{ 'chat-sidebar-item--active': conv.id === activeId }"
          @click="chatStore.switchConversation(conv.id)"
        >
          <span class="chat-sidebar-title">{{ conv.title }}</span>
          <span class="chat-sidebar-date">{{ formatDate(conv.updatedAt) }}</span>
          <button class="chat-sidebar-del" @click.stop="handleDelete(conv.id)">&times;</button>
        </button>
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
          <span class="text-[10px] text-text-muted flex-shrink-0">{{ activeConversation?.fileContext ? '📄 ' + getFileName(activeConversation.fileContext) : '' }}</span>
        </div>
        <button class="chat-collapse-btn" title="返回编辑模式" @click="$emit('back')">⊡</button>
      </div>

      <!-- 消息区域 -->
      <div ref="chatEl" class="chat-messages">
        <div class="chat-messages-inner">
          <div v-if="!activeConversation || activeConversation.messages.length === 0" class="chat-empty">
            <div class="text-4xl mb-4">✦</div>
            <p>在这里跟 AI 深入讨论你的故事</p>
            <p class="text-xs mt-1 text-text-muted">Ctrl+Enter 发送，纯 Enter 换行</p>
          </div>

          <div v-for="(msg, i) in activeConversation?.messages || []" :key="i" class="chat-msg"
            :class="msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai'">
            <div class="chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
            <div class="chat-msg-content" v-text="msg.content" />
            <div v-if="msg.role === 'assistant' && msg.content" class="chat-msg-actions">
              <button class="chat-action-btn" @click="$emit('insert', msg.content)">插入编辑器</button>
            </div>
          </div>

          <div v-if="chatStore.streaming" class="chat-msg chat-msg--ai">
            <div class="chat-msg-role">AI</div>
            <div class="chat-msg-content">{{ activeConversation?.messages.at(-1)?.content || '' }}<span class="cursor-blink">|</span></div>
          </div>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="chat-input-area">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { buildAiHeaders, getAiEndpoint } from '../composables/useAiApi'

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
const { conversations, activeId, streaming: isStreaming } = storeToRefs(chatStore)
const activeConversation = computed(() => chatStore.activeConversation())

const inputText = ref('')
const chatEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()

// ── 生命周期 ──

onMounted(() => {
  if (props.projectRoot) chatStore.loadConversations(props.projectRoot)
})

watch(() => props.projectRoot, (root) => {
  if (root) chatStore.loadConversations(root)
})

// 滚动到底部
watch(() => activeConversation.value?.messages.length, () => {
  nextTick(() => chatEl.value?.scrollTo(0, chatEl.value.scrollHeight))
})

// ── 对话管理 ──

function handleNewChat() {
  chatStore.createConversation(undefined, props.activeFile?.path)
  nextTick(() => inputEl.value?.focus())
}

function handleDelete(id: string) {
  chatStore.deleteConversation(id)
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getFileName(path: string) {
  return path.split(/[/\\]/).pop() || path
}

// ── AI 调用 ──

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.streaming) return

  let conv = activeConversation.value
  if (!conv) conv = chatStore.createConversation(undefined, props.activeFile?.path)

  const convId = conv.id
  inputText.value = ''

  // 组装上下文
  const context = await buildContext()
  const fullPrompt = context ? `${context}\n\n---\n${text}` : text

  chatStore.addMessage(convId, { role: 'user', content: text })
  chatStore.addMessage(convId, { role: 'assistant', content: '' })
  chatStore.streaming = true

  try {
    // 历史对话作为上下文（排除刚加的空 assistant 占位符）
    const history = conv.messages
      .slice(0, -1)
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    const isClaude = settings.aiProvider === 'claude'
    const apiMessages = [...history, { role: 'user', content: fullPrompt }]
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
      let content = ''
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
            content += chunk.choices?.[0]?.delta?.content ?? ''
            chatStore.updateLastMessage(convId, content)
          } catch { /* skip */ }
        }
      }
    }
  } catch {
    chatStore.updateLastMessage(convId, '网络请求失败')
  } finally {
    chatStore.streaming = false
    nextTick(() => chatEl.value?.scrollTo(0, chatEl.value.scrollHeight))
  }
}

async function buildContext(): Promise<string> {
  const parts: string[] = []
  if (props.activeFile?.content) {
    parts.push(`当前文件: ${props.activeFile.name}\n\`\`\`\n${props.activeFile.content.slice(-4000)}\n\`\`\``)
  }
  return parts.join('\n\n')
}
</script>

<style scoped>
.ai-chat-view { font-family: var(--font-sans); }

/* ── 侧栏 ── */
.chat-sidebar {
  width: 200px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.chat-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px; border-bottom: 1px solid var(--color-border);
}
.chat-sidebar-btn {
  width: 22px; height: 22px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
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
  width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
  display: none; align-items: center; justify-content: center;
  font-size: 12px; color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
}
.chat-sidebar-item:hover .chat-sidebar-del { display: flex; }
.chat-sidebar-del:hover { background: var(--color-danger-bg); color: var(--color-danger); }
/* ── 主体 ── */
.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--color-border);
  flex-shrink: 0; gap: 8px;
}
.chat-collapse-btn {
  width: 26px; height: 26px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; color: var(--color-text-muted);
  background: none; border: none; cursor: pointer; flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.chat-collapse-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.chat-messages { flex: 1; overflow-y: auto; padding: 24px 0; }
.chat-messages-inner { max-width: 680px; margin: 0 auto; padding: 0 24px; }
.chat-empty { text-align: center; color: var(--color-text-muted); padding: 64px 0; }
.chat-msg { margin-bottom: 20px; }
.chat-msg--user { text-align: right; }
.chat-msg-role { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--color-accent); }
.chat-msg--user .chat-msg-role { color: var(--color-text-muted); }
.chat-msg-content { font-size: 14px; line-height: 1.7; color: var(--color-text-primary); white-space: pre-wrap; word-break: break-word; }
.chat-msg--user .chat-msg-content { color: var(--color-text-secondary); }
.chat-msg-actions { margin-top: 6px; }
.chat-action-btn {
  padding: 2px 10px; font-size: 11px; font-family: inherit;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-bg-surface); color: var(--color-text-secondary); cursor: pointer;
}
.chat-action-btn:hover { background: var(--color-accent-bg); color: var(--color-accent); border-color: var(--color-accent-border); }
.cursor-blink { animation: blink 1s step-end infinite; color: var(--color-accent); }
@keyframes blink { 50% { opacity: 0; } }

.chat-input-area {
  padding: 16px 20px; border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.chat-input {
  width: 100%; max-width: 680px; margin: 0 auto; display: block;
  border: 1px solid var(--color-border); border-radius: var(--radius-lg);
  padding: 12px 16px; font-size: 14px; font-family: inherit;
  background: var(--color-bg-elevated); color: var(--color-text-primary);
  resize: none; outline: none; transition: border-color 0.15s;
}
.chat-input:focus { border-color: var(--color-accent-border); }
.chat-input:disabled { opacity: 0.5; }
</style>
