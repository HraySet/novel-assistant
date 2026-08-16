<template>
  <Transition name="fade">
  <div v-if="show" class="hist-overlay" @click.self="$emit('close')">
    <div class="hist-modal">
      <div class="hist-header">
        <span class="hist-title">{{ fileName ? `历史版本 · ${fileName}` : '历史版本' }}</span>
        <button class="hist-close" title="关闭" @click="$emit('close')"><X :size="14" /></button>
      </div>

      <div class="hist-body">
        <!-- 备份列表 -->
        <div class="hist-list">
          <button v-for="b in backups" :key="b.path" class="hist-item"
            :class="{ 'hist-item--active': selected?.path === b.path }"
            @click="selectBackup(b)">
            <Clock :size="12" class="hist-item-icon" />
            {{ formatTime(b.timestamp) }}
          </button>
          <div v-if="backups.length === 0" class="hist-empty">
            <History :size="24" class="hist-empty-icon" />
            <div>暂无备份</div>
          </div>
        </div>

        <!-- 内容预览 -->
        <div class="hist-preview">
          <div v-if="preview" class="hist-preview-hint">以下为该版本的完整内容</div>
          <pre class="hist-pre">{{ preview }}</pre>
        </div>
      </div>

      <div class="hist-footer">
        <button class="hist-btn hist-btn--ghost" @click="$emit('close')">取消</button>
        <button class="hist-btn hist-btn--primary" :disabled="!selected || restoring" @click="restore">
          {{ restoring ? '恢复中…' : '恢复此版本' }}
        </button>
      </div>
    </div>
  </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, Clock, History } from 'lucide-vue-next'
import * as api from '../api/files'
const props = defineProps<{
  show: boolean
  filePath: string
  fileName?: string
}>()

const emit = defineEmits<{
  close: []
  restored: [content: string]
}>()

const backups = ref<api.BackupEntry[]>([])
const selected = ref<api.BackupEntry | null>(null)
const preview = ref('')
const restoring = ref(false)

async function load() {
  try {
    backups.value = await api.listBackups(props.filePath)
    if (backups.value.length > 0) await selectBackup(backups.value[0])
  } catch (e) {
    console.error('加载备份失败:', e)
  }
}

async function selectBackup(b: api.BackupEntry) {
  selected.value = b
  preview.value = await api.readFile(b.path)
}

async function restore() {
  if (!selected.value) return
  restoring.value = true
  try {
    await api.writeFile(props.filePath, preview.value)
    emit('restored', preview.value)
    emit('close')
  } catch (e) {
    console.error('恢复失败:', e)
  } finally {
    restoring.value = false
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

onMounted(load)
</script>

<style scoped>
.hist-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 64, 50, 0.1);
}

.hist-modal {
  width: 640px;
  max-width: 90vw;
  height: 420px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}

.hist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.hist-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.hist-close {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}
.hist-close:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.hist-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.hist-list {
  width: 180px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  padding: 8px;
  flex-shrink: 0;
}

.hist-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s, color 0.1s;
}
.hist-item-icon { color: var(--color-text-muted); flex-shrink: 0; }
.hist-item--active .hist-item-icon { color: var(--color-accent); }
.hist-item:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.hist-item--active { background: var(--color-accent-bg); color: var(--color-accent); }

.hist-empty {
  padding: 20px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.hist-empty-icon { opacity: 0.3; }

.hist-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px 16px;
}

.hist-preview-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.hist-pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.hist-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.hist-btn {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.hist-btn--ghost {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.hist-btn--ghost:hover { background: var(--color-bg-surface-hover); }
.hist-btn--primary {
  background: var(--color-accent);
  border: none;
  color: var(--color-text-on-accent);
}
.hist-btn--primary:hover:not(:disabled) { background: var(--color-accent-hover); }
.hist-btn--primary:disabled { opacity: 0.4; cursor: default; }
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
