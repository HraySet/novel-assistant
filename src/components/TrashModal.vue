<template>
  <BaseModal :show="show" overlay-color="rgba(0, 0, 0, 0.3)" backdrop-blur width="560px" height="440px" @close="$emit('close')">
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
                清空<span class="trash-count">{{ entries.length }}</span>
              </button>
              <button class="trash-close" title="关闭" @click="$emit('close')"><X :size="14" /></button>
            </div>
          </div>

          <div class="trash-body">
            <div v-if="entries.length === 0" class="trash-empty">
              <div class="trash-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h16" />
                  <path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
                  <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
                  <path d="M10 11v5M14 11v5" />
                </svg>
              </div>
              <div class="trash-empty-title">回收站是空的</div>
              <div class="trash-empty-hint">删除的文件会先进回收站，可随时恢复</div>
            </div>

            <TransitionGroup v-else name="trash-item-anim" tag="div">
              <div v-for="e in entries" :key="e.trashPath" class="trash-item">
                <svg v-if="e.isDir" class="trash-item-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 4h4l1.5 1.5H14v8a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z"
                    stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                </svg>
                <svg v-else class="trash-item-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 2h5l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
                    stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="trash-item-name">{{ e.name }}</div>
                  <div class="trash-item-path" :title="e.originalPath">{{ relPath(e.originalPath) }}</div>
                </div>
                <span class="trash-item-time">{{ formatTime(e.deletedAt) }}</span>
                <button class="trash-btn" :disabled="restoring === e.trashPath" @click="restore(e)">
                  {{ restoring === e.trashPath ? '恢复中…' : '恢复' }}
                </button>
              </div>
            </TransitionGroup>
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
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import * as api from '../api/files'
import ConfirmDialog from './ConfirmDialog.vue'
import BaseModal from './BaseModal.vue'

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

/* ── 空状态：大而淡的图标 + 层级分明的文字 ── */
.trash-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-text-muted);
}

.trash-empty-icon {
  width: 40px;
  height: 40px;
  opacity: 0.25;
  margin-bottom: 10px;
}

.trash-empty-icon svg {
  width: 100%;
  height: 100%;
}

.trash-empty-title {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.trash-empty-hint {
  font-size: 11px;
  margin-top: 2px;
  opacity: 0.6;
}

/* ── 列表项：恢复时向右滑出 + 淡出 ── */
.trash-item-anim-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.trash-item-anim-leave-to {
  transform: translateX(24px);
  opacity: 0;
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
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.trash-item-name {
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 路径用等宽字体，与文件名区分主次 */
.trash-item-path {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono, ui-monospace, monospace);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 时间戳是辅助信息里最不重要的，再降一档 */
.trash-item-time {
  font-size: 11px;
  color: var(--color-text-muted);
  opacity: 0.6;
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

.trash-count {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 2px;
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
