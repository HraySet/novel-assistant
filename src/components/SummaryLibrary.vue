<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="sum-overlay" @click.self="$emit('close')">
        <Transition name="sum-modal" appear>
          <div class="sum-modal">
            <div class="sum-header">
              <div class="sum-header-text">
                <span class="sum-title">摘要库</span>
                <span class="sum-hint">存为摘要的内容都在这里，供前情提要使用</span>
              </div>
              <button class="dialog-close" @click="$emit('close')"><X :size="14" /></button>
            </div>

            <div class="sum-body">
              <!-- 左：摘要列表 -->
              <div class="sum-list">
                <div class="sum-list-toolbar">
                  <span class="sum-list-label">摘要</span>
                  <button class="sum-refresh-icon" title="刷新" @click="load()">
                    <RefreshCw :size="13" />
                  </button>
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
                  <div v-if="summaries.length === 0" class="sum-empty">
                    <BookOpen :size="28" class="sum-empty-icon" />
                    <div>还没有摘要</div>
                    <div class="sum-empty-hint">在 AI 对话里点「存为摘要」即可生成</div>
                  </div>
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
                <div v-else class="sum-preview-empty">
                  <BookOpen :size="28" class="sum-empty-icon" />
                  <div>从左侧选择一条摘要</div>
                </div>
              </div>
            </div>
          </div>
        </Transition>

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
import { X, RefreshCw, BookOpen } from 'lucide-vue-next'
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
/* ── 进出场：遮罩淡入淡出 + 弹窗位移缩放（贴合暖色遮罩的调性） ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sum-modal-enter-active, .sum-modal-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.sum-modal-enter-from, .sum-modal-leave-to {
  transform: scale(0.97) translateY(6px);
  opacity: 0;
}

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

/* header：标题与说明上下两行，hint 不再被压缩 */
.sum-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sum-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.sum-title { font-size: 14px; font-weight: 600; color: var(--color-text-primary); }
.sum-hint { font-size: 11px; color: var(--color-text-muted); }

.dialog-close {
  width: 24px; height: 24px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer;
  flex-shrink: 0;
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

.sum-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.sum-list-label {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
}

.sum-refresh-icon {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
}
.sum-refresh-icon:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.sum-list-scroll { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 2px; }

/* 选中语法与 SurfaceCard 统一：强调色左边条；宽度预留给透明边框避免重排 */
.sum-item {
  text-align: left;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}
.sum-item:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.sum-item--active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-left-color: var(--color-accent);
  padding-left: 8px; /* 10px - 2px 边框，文字不右移 */
}

/* 空状态：淡淡的图标做视觉锚点 */
.sum-empty {
  padding: 20px 10px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.sum-empty-hint { opacity: 0.7; }
.sum-empty-icon { opacity: 0.25; margin-bottom: 6px; }

.sum-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 预览用编辑器同款衬线字体——「在读你写的东西」而不是系统 UI 文本 */
.sum-pre {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 12px 16px;
  font-family: var(--font-voice, var(--font-sans));
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
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
