<template>
  <div class="ai-chat-view h-screen flex flex-col bg-bg-page">
    <!-- 顶栏 -->
    <div class="flex items-center gap-4 px-6 py-3 border-b shrink-0"
      style="border-color: var(--color-border)">
      <button class="text-sm text-accent hover:text-accent-hover transition-colors font-medium"
        @click="$emit('back')">
        ← 返回
      </button>
      <span class="text-xs text-text-muted">
        {{ activeFile?.name ?? '未打开文件' }} · 上下文：角色/、大纲/
      </span>
      <div class="flex-1" />
      <span class="text-[10px] text-text-muted">{{ tokenUsed }} / {{ tokenBudget }} tokens</span>
    </div>

    <!-- 对话区域 -->
    <div ref="chatContainer" class="flex-1 overflow-y-auto py-8">
      <div class="chat-messages" style="max-width: 680px; margin: 0 auto; padding: 0 24px;">
        <div v-if="messages.length === 0" class="text-center text-text-muted text-sm py-16">
          <div class="text-4xl mb-4">✦</div>
          <p>在这里跟 AI 深入讨论你的故事</p>
          <p class="text-xs mt-1">讨论角色成长、情节走向、世界观设定……</p>
        </div>

        <div v-for="(msg, i) in messages" :key="i" class="mb-6">
          <div class="text-xs font-semibold mb-1"
            :class="msg.role === 'user' ? 'text-accent text-right' : 'text-accent'">
            {{ msg.role === 'user' ? '你' : 'AI' }}
          </div>
          <div class="text-sm leading-relaxed"
            :class="msg.role === 'user'
              ? 'text-text-secondary text-right'
              : 'text-text-primary'"
            v-text="msg.content"
          />
          <!-- 如果是 AI 消息且有可应用的代码块 -->
          <div v-if="msg.role === 'assistant' && msg.hasInsert" class="mt-2 flex gap-2"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <button class="action-btn action-btn--apply" @click="$emit('insert', msg.insertContent ?? '')">
              应用
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="px-6 py-4 border-t shrink-0" style="border-color: var(--color-border)">
      <div style="max-width: 680px; margin: 0 auto; padding: 0 24px;">
        <textarea
          v-model="inputText"
          class="chat-input"
          rows="3"
          placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
          @keydown.enter.exact.prevent="sendMessage"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  activeFile?: { path: string; name: string } | null
  projectRoot?: string
}>()

defineEmits<{
  back: []
  insert: [text: string]
}>()

const inputText = ref('')
const messages = ref<{ role: string; content: string; hasInsert?: boolean; insertContent?: string }[]>([])

const tokenBudget = ref(60000)
const tokenUsed = ref(0)

function sendMessage() {
  if (!inputText.value.trim()) return
  messages.value.push({ role: 'user', content: inputText.value })
  // TODO: 调用 AI API
  inputText.value = ''
}
</script>

<style scoped>
.ai-chat-view {
  font-family: var(--font-sans);
}

.chat-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.chat-input:focus {
  border-color: var(--color-accent-border);
}

.action-btn {
  padding: 4px 12px;
  font-size: 11px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  border: none;
  transition: background 0.1s ease;
}

.action-btn--apply {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.action-btn--apply:hover {
  background: var(--color-accent-border);
}
</style>
