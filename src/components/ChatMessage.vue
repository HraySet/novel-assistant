<template>
  <div
    class="chat-msg"
    :class="[
      msg.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai',
      msg.originalContent ? 'chat-msg--diff' : '',
      density === 'roomy' ? 'chat-msg--roomy' : 'chat-msg--compact',
    ]"
    style="animation: msg-in 0.15s ease"
  >
    <div class="chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>

    <DiffView
      v-if="msg.originalContent && msg.content"
      :compact="density === 'compact'"
      :editable="true"
      :old-text="msg.originalContent"
      :new-text="msg.content"
      @accept="(merged) => emit('apply-diff', merged)"
      @reject="emit('reject-diff')"
    />
    <div v-else class="chat-msg-content" v-html="html" />

    <div v-if="msg.role === 'assistant' && msg.content && !msg.originalContent" class="chat-msg-actions">
      <span v-if="applied" class="chat-applied-note"><Check :size="11" />已应用到文件</span>
      <template v-else>
        <button class="chat-action-btn" @click="emit('insert')">{{ inserted ? '✓ 已插入' : '插入编辑器' }}</button>
        <button class="chat-action-btn" :disabled="!canSaveSummary" @click="emit('save-summary')">
          {{ saved ? '✓ 已存入前情' : '存为摘要' }}
        </button>
      </template>
    </div>

    <!-- 全屏版独有：重新生成 / 复制（宿主按「最后一条且未在生成」控制显示） -->
    <div v-if="showExtras" class="chat-msg-actions">
      <button class="chat-action-btn" @click="emit('regenerate')">重新生成</button>
      <button class="chat-action-btn" @click="emit('copy')">复制</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import type { ChatMessage as ChatMessageModel } from '../stores/chat'
import DiffView from './DiffView.vue'

/**
 * 单条对话消息（紧凑面板与全屏对话共用）：
 * 角色行、DiffView 对比、Markdown 内容、操作按钮、可选扩展操作，
 * 模板与样式只维护这一份——两个入口自然同步。
 */
defineProps<{
  msg: ChatMessageModel
  /** 已渲染的 HTML（messageHtml 由宿主 useAiChat 计算，避免渲染逻辑双份维护） */
  html: string
  /** compact 侧栏紧凑档 / roomy 全屏宽松档 */
  density?: 'compact' | 'roomy'
  applied?: boolean
  inserted?: boolean
  saved?: boolean
  canSaveSummary?: boolean
  showExtras?: boolean
}>()

const emit = defineEmits<{
  'apply-diff': [merged: string]
  'reject-diff': []
  insert: []
  'save-summary': []
  regenerate: []
  copy: []
}>()
</script>

<style scoped>
.chat-msg {
  margin-bottom: 8px;
}
.chat-msg--roomy {
  margin-bottom: 20px;
}
.chat-msg--roomy.chat-msg--user {
  text-align: right;
}
.chat-msg--diff {
  max-width: none;
}
.chat-msg--diff .chat-msg-role {
  margin-bottom: 6px;
}

.chat-msg-role {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 2px;
  color: var(--color-accent);
}
.chat-msg--user .chat-msg-role {
  color: var(--color-text-muted);
}
.chat-msg--roomy .chat-msg-role {
  margin-bottom: 4px;
}

.chat-msg-content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
}
.chat-msg--compact .chat-msg-content {
  font-size: 13px;
  line-height: 1.65;
}
.chat-msg--roomy .chat-msg-content {
  font-size: 14px;
  line-height: 1.7;
}
.chat-msg--user .chat-msg-content {
  color: var(--color-text-secondary);
}

/* 流式光标：messageHtml 注入的内容无 scoped 属性，需用 :deep 匹配 */
.chat-msg-content :deep(.cursor-blink) {
  animation: blink 1s step-end infinite;
  color: var(--color-accent);
}
@keyframes blink {
  50% { opacity: 0; }
}

.chat-msg-actions {
  margin-top: 6px;
}
.chat-applied-note {
  font-size: 11px;
  color: var(--color-success);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.chat-action-btn {
  padding: 2px 10px;
  font-size: 11px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.chat-msg--compact .chat-action-btn {
  font-size: 10px;
  padding: 2px 8px;
  background: none;
  border-color: var(--color-border);
}
.chat-action-btn:hover:not(:disabled) {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}
.chat-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

@keyframes msg-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Markdown 渲染样式（两档密度共用一套） */
.chat-msg-content :deep(h1) { font-size: 1.3em; font-weight: 700; margin: 12px 0 6px; }
.chat-msg-content :deep(h2) { font-size: 1.15em; font-weight: 600; margin: 10px 0 4px; }
.chat-msg-content :deep(h3) { font-size: 1.05em; font-weight: 600; margin: 8px 0 4px; }
.chat-msg-content :deep(p) { margin: 4px 0; }
.chat-msg-content :deep(ul) { padding-left: 16px; margin: 4px 0; }
.chat-msg-content :deep(li) { margin: 2px 0; }
.chat-msg-content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--color-bg-surface);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}
.chat-msg-content :deep(pre) {
  background: var(--color-bg-surface);
  padding: 10px 14px;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 8px 0;
}
.chat-msg-content :deep(pre code) { background: none; padding: 0; }
.chat-msg-content :deep(hr) { border: none; border-top: 1px solid var(--color-border); margin: 12px 0; }
.chat-msg-content :deep(strong) { font-weight: 700; }
.chat-msg-content :deep(em) { font-style: italic; }
</style>
