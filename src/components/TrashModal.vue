<template>
  <div v-if="show" class="trash-overlay" @click.self="$emit('close')">
    <div class="trash-modal">
      <div class="trash-header">
        <span class="trash-title">回收站</span>
        <div class="flex items-center gap-2">
          <button
            v-if="entries.length > 0"
            class="trash-btn trash-btn--danger"
            :disabled="busy"
            @click="confirmEmpty = true"
          >
            清空
          </button>
          <button class="trash-close" title="关闭" @click="$emit('close')">&times;</button>
        </div>
      </div>

      <div class="trash-body">
        <div v-if="entries.length === 0" class="trash-empty">
          <div class="text-3xl mb-2">🗑️</div>
          <div>回收站是空的</div>
          <div class="trash-empty-hint">删除的文件会先进回收站，可随时恢复</div>
        </div>

        <div v-for="e in entries" :key="e.trashPath" class="trash-item">
          <span class="trash-item-icon">{{ e.isDir ? '📁' : '📄' }}</span>
          <div class="flex-1 min-w-0">
            <div class="trash-item-name">{{ e.name }}</div>
            <div class="trash-item-path" :title="e.originalPath">{{ relPath(e.originalPath) }}</div>
          </div>
          <span class="trash-item-time">{{ formatTime(e.deletedAt) }}</span>
          <button class="trash-btn" :disabled="restoring === e.trashPath" @click="restore(e)">
            {{ restoring === e.trashPath ? '恢复中…' : '恢复' }}
          </button>
        </div>
      </div>

      <div class="trash-footer">
        <span v-if="errorMsg" class="trash-error">{{ errorMsg }}</span>
        <span v-else>删除的内容保存在项目 .trash 目录，恢复时回到原位置</span>
      </div>
    </div>

    <ConfirmDialog
      :show="confirmEmpty"
      title="清空回收站"
      message="回收站中的所有文件将被永久删除，此操作不可撤销。确定清空吗？"
      ok-label="清空"
      danger
      @confirm="emptyAll"
      @cancel="confirmEmpty = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import * as api from '../api/files'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  show: boolean
  projectRoot?: string
}>()

const emit = defineEmits<{
  close: []
  restored: [path: string]
}>()

const entries = ref<api.TrashEntry[]>([])
const restoring = ref<string | null>(null)
const busy = ref(false)
const confirmEmpty = ref(false)
const errorMsg = ref('')

async function load() {
  errorMsg.value = ''
  if (!props.projectRoot) return
  try {
    entries.value = await api.listTrash()
  } catch (e) {
    console.error('加载回收站失败:', e)
    errorMsg.value = '加载回收站失败'
  }
}

watch(() => props.show, (v) => { if (v) load() })

async function restore(entry: api.TrashEntry) {
  restoring.value = entry.trashPath
  try {
    const restoredTo = await api.restoreTrash(entry.trashPath, entry.originalPath)
    entries.value = entries.value.filter((e) => e.trashPath !== entry.trashPath)
    emit('restored', restoredTo)
  } catch (e) {
    console.error('恢复失败:', e)
    errorMsg.value = '恢复失败：' + (e as Error).message
  } finally {
    restoring.value = null
  }
}

async function emptyAll() {
  confirmEmpty.value = false
  if (!props.projectRoot) return
  busy.value = true
  try {
    await api.emptyTrash()
    entries.value = []
  } catch (e) {
    console.error('清空回收站失败:', e)
  } finally {
    busy.value = false
  }
}

function relPath(p: string): string {
  const root = props.projectRoot
  if (root && p.startsWith(root)) {
    const sep = root.includes('\\') ? '\\' : '/'
    const rel = p.slice(root.length).replace(/^[\\/]+/, '')
    return rel || p
  }
  return p
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
.trash-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.trash-modal {
  width: 560px;
  max-width: 90vw;
  height: 440px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}

.trash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.trash-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.trash-close {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--color-text-muted);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.trash-close:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.trash-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.trash-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.trash-empty-hint {
  font-size: 11px;
  margin-top: 6px;
  opacity: 0.8;
}

.trash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  transition: background 0.1s ease;
}

.trash-item:hover {
  background: var(--color-bg-surface-hover);
}

.trash-item-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.trash-item-name {
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item-path {
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item-time {
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.trash-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  color: var(--color-accent);
  background: var(--color-accent-bg);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s ease, color 0.1s ease;
}

.trash-btn:hover:not(:disabled) {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
}

.trash-btn--danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.trash-btn--danger:hover:not(:disabled) {
  background: var(--color-danger);
  color: #fff;
}

.trash-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.trash-footer {
  padding: 10px 20px;
  border-top: 1px solid var(--color-border);
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.trash-error {
  color: var(--color-danger);
}
</style>
