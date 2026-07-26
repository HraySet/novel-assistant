<template>
  <aside class="ai-panel w-ai-panel shrink-0 border-l flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">
    
    <!-- 面板标题 -->
    <div class="flex items-center justify-between px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <span class="text-xs font-medium text-text-secondary">AI 助手</span>
      <div class="flex items-center gap-1">
        <button class="ai-btn" title="AI 设置" @click="showSettings = true">
          ⚙
        </button>
        <button class="ai-btn" title="展开对话 (Ctrl+Shift+A)" @click="$emit('expand')">
          ⤢
        </button>
      </div>
    </div>

    <!-- 上下文指示器 -->
    <div class="px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[10px] uppercase tracking-wide text-text-muted">上下文</span>
        <span class="text-[10px] text-text-muted">{{ tokenUsed }} / {{ tokenBudget }}</span>
      </div>
      <!-- 预算条 -->
      <div class="h-1 rounded-full bg-bg-surface-hover mb-2">
        <div class="h-full rounded-full transition-all duration-300"
          :style="{ width: budgetPercent + '%', background: budgetColor }" />
      </div>
      <!-- 上下文文件列表 -->
      <div class="context-list text-[10px]">
        <div v-if="activeFile" class="context-item">
          📄 {{ activeFile.name }} (当前)
        </div>
        <div class="context-item">📁 角色/ (auto)</div>
        <div class="context-item">📁 大纲/ (auto)</div>
        <div class="context-item">📁 _project.md</div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="flex flex-wrap gap-1.5 px-3 py-2 border-b shrink-0"
      style="border-color: var(--color-border)">
      <button v-for="action in quickActions" :key="action.label"
        class="quick-action-btn" @click="runQuickAction(action.label)">
        {{ action.label }}
      </button>
    </div>

    <!-- 对话区域 -->
    <div ref="chatEl" class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
      <div v-if="messages.length === 0" class="text-xs text-text-muted text-center py-8">
        写一段话，或者点一个快捷操作
      </div>
      <div v-for="(msg, i) in messages" :key="i"
        :class="msg.role === 'user' ? 'chat-user' : 'chat-ai'">
        <div class="chat-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="chat-content" v-text="msg.content" />
      </div>
    </div>

    <!-- 输入框 -->
    <div class="p-3 border-t shrink-0" style="border-color: var(--color-border)">
      <textarea
        v-model="inputText"
        class="ai-input"
        rows="2"
        placeholder="输入消息..."
        @keydown.enter.exact.prevent="sendMessage"
      />
    </div>

    <!-- 设置弹窗 -->
    <DialogRoot v-if="showSettings" @update:open="showSettings = false">
      <DialogContent>
        <div class="ai-settings">
          <h3 class="text-sm font-medium text-text-primary mb-4">AI 设置</h3>
          <label class="block text-xs text-text-secondary mb-1">API Key</label>
          <input v-model="apiKey" type="password" class="ai-settings-input" placeholder="sk-..." />
          <label class="block text-xs text-text-secondary mb-1 mt-3">API URL</label>
          <input v-model="apiUrl" class="ai-settings-input" placeholder="https://api.openai.com" />
          <label class="block text-xs text-text-secondary mb-1 mt-3">模型</label>
          <input v-model="model" class="ai-settings-input" placeholder="gpt-4o" />
          <div class="flex justify-end gap-2 mt-4">
            <button class="btn-ghost text-xs" @click="showSettings = false">取消</button>
            <button class="btn-accent text-xs" @click="saveSettings">保存</button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { DialogRoot, DialogContent, DialogClose, DialogPortal, DialogOverlay } from 'reka-ui'

const props = defineProps<{
  activeFile?: { path: string; name: string } | null
  projectRoot?: string
}>()

defineEmits<{
  expand: []
}>()

const showSettings = ref(false)
const apiKey = ref('')
const apiUrl = ref('https://api.openai.com/v1')
const model = ref('gpt-4o')
const inputText = ref('')
const messages = ref<{ role: string; content: string }[]>([])

const quickActions = [
  { label: '续写' },
  { label: '润色' },
  { label: '扩写' },
  { label: '检查' },
]

const tokenBudget = ref(30000)
const tokenUsed = ref(0)
const budgetPercent = computed(() => Math.min(100, (tokenUsed.value / tokenBudget.value) * 100))
const budgetColor = computed(() => {
  if (budgetPercent.value > 80) return 'var(--color-warning)'
  if (budgetPercent.value > 60) return 'var(--color-accent)'
  return 'var(--color-success)'
})

function runQuickAction(action: string) {
  inputText.value = action
  sendMessage()
}

function sendMessage() {
  if (!inputText.value.trim()) return
  messages.value.push({ role: 'user', content: inputText.value })
  // TODO: 调用 AI API
  inputText.value = ''
}

function saveSettings() {
  // TODO: 保存到 Rust 配置
  showSettings.value = false
}
</script>

<style scoped>
.ai-panel {
  font-size: 13px;
}

.ai-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.ai-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.context-item {
  padding: 2px 0;
  color: var(--color-text-muted);
}

.quick-action-btn {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-surface-hover);
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s ease, color 0.1s ease;
}

.quick-action-btn:hover {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.quick-action-btn:active {
  transform: scale(0.97);
}

.chat-user {
  text-align: right;
}

.chat-ai {
  text-align: left;
}

.chat-role {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-accent);
  margin-bottom: 2px;
}

.chat-content {
  font-size: 12px;
  color: var(--color-text-primary);
  line-height: 1.6;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  display: inline-block;
  max-width: 100%;
  text-align: left;
}

.ai-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  resize: none;
  outline: none;
}

.ai-input:focus {
  border-color: var(--color-accent-border);
}

.ai-settings {
  padding: 20px;
}

.ai-settings-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  outline: none;
}

.ai-settings-input:focus {
  border-color: var(--color-accent-border);
}

.btn-ghost {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-family: inherit;
}

.btn-accent {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-on-accent);
  background: var(--color-accent);
  border: none;
  cursor: pointer;
  font-family: inherit;
}
</style>
