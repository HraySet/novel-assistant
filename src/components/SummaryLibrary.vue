<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="sum-overlay" @click.self="$emit('close')">
        <div class="sum-modal">
          <div class="sum-header">
            <span class="sum-title">摘要库</span>
            <span class="sum-hint">存为摘要的内容都在这里，供前情提要使用</span>
            <button class="dialog-close" @click="$emit('close')"><X :size="14" /></button>
          </div>

          <div class="sum-body">
            <!-- 左：摘要列表 -->
            <div class="sum-list">
              <div class="sum-list-toolbar">
                <button class="sum-refresh" @click="load()">刷新</button>
              </div>
              <div class="sum-list-scroll">
                <button
                  v-for="s in summaries"
                  :key="s.path"
                  class="sum-item"
                  :class="{ 'sum-item--active': selected?.path === s.path }"
                  @click="selectSummary(s)"
                >
                  {{ s.name }}
                </button>
                <div v-if="summaries.length === 0" class="sum-empty">还没有摘要。在 AI 对话里点「存为摘要」即可生成。</div>
              </div>
            </div>

            <!-- 右：预览与操作 -->
            <div class="sum-preview">
              <template v-if="selected">
                <pre class="sum-pre">{{ selected.content }}</pre>
                <div class="sum-actions">
                  <button class="sum-btn sum-btn--primary" @click="insertSelected">插入编辑器</button>
                  <button class="sum-btn sum-btn--danger" @click="confirmDelete = true">删除</button>
                </div>
              </template>
              <div v-else class="sum-preview-empty">从左侧选择一条摘要</div>
            </div>
          </div>
        </div>

        <ConfirmDialog
          :show="confirmDelete"
          title="删除摘要"
          :message="'确定删除摘要「' + (selected?.name ?? '') + '」吗？此操作不可恢复。'"
          ok-label="删除"
          danger
          @confirm="doDelete"
          @cancel="confirmDelete = false"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import * as api from '../api/files'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ show: boolean; projectRoot?: string }>()
const emit = defineEmits<{ close: []; insert: [text: string] }>()

interface SummaryEntry { name: string; path: string; content: string }

const summaries = ref<SummaryEntry[]>([])
const selected = ref<SummaryEntry | null>(null)
const confirmDelete = ref(false)

function sumDir() {
  return props.projectRoot ? props.projectRoot.replace(/\\/g, '/') + '/.summaries' : ''
}

async function load() {
  summaries.value = []
  selected.value = null
  const dir = sumDir()
  if (!dir) return
  try {
    const entries = await api.listDir(dir)
    const files = (entries || []).filter((e: any) => !e.isDir && /\.md$/i.test(e.name))
    for (const f of files) {
      try {
        const content = await api.readFile(f.path)
        summaries.value.push({ name: f.name.replace(/\.md$/i, ''), path: f.path, content })
      } catch { /* skip */ }
    }
  } catch { /* 目录不存在 */ }
}

async function selectSummary(s: SummaryEntry) {
  selected.value = s
}

function insertSelected() {
  if (selected.value) {
    emit('insert', selected.value.content)
    emit('close')
  }
}

async function doDelete() {
  confirmDelete.value = false
  if (!selected.value) return
  try {
    await api.deleteFile(selected.value.path)
    await load()
  } catch (e) {
    console.error('删除摘要失败:', e)
  }
}

watch(() => props.show, (v) => {
  if (v) {
    confirmDelete.value = false
    load()
  }
})
</script>

<style scoped>
.sum-overlay {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 64, 50, 0.12);
}

.sum-modal {
  width: 640px;
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

.sum-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sum-title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.sum-hint { font-size: 11px; color: var(--color-text-muted); flex: 1; }

.dialog-close {
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer;
}
.dialog-close:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.sum-body { flex: 1; min-height: 0; display: flex; }

.sum-list {
  width: 200px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sum-list-toolbar { padding: 8px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }

.sum-refresh {
  width: 100%;
  padding: 4px 0;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.sum-refresh:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.sum-list-scroll { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }

.sum-item {
  text-align: left;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sum-item:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.sum-item--active { background: var(--color-accent-bg); color: var(--color-accent); }

.sum-empty { padding: 20px 10px; text-align: center; font-size: 11px; line-height: 1.7; color: var(--color-text-muted); }

.sum-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sum-pre {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 12px 16px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.sum-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sum-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.sum-btn--primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-text-on-accent); }
.sum-btn--danger { color: var(--color-danger); border-color: var(--color-danger-border); }
.sum-btn--danger:hover { background: var(--color-danger-bg); }

.sum-preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
