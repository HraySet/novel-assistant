<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click.self="$emit('close')">
        <div class="char-modal">
          <div class="char-modal-header">
            <span class="char-modal-title">角色卡片</span>
            <span class="char-modal-hint">保存后自动进入 AI 上下文（角色设定）</span>
            <button class="dialog-close" @click="$emit('close')">
              <X :size="14" />
            </button>
          </div>
          <div class="char-modal-body">
            <!-- 左：卡片列表 -->
            <div class="char-list">
              <div class="char-list-toolbar">
                <button class="char-new-btn" @click="createCharacter">＋ 新建角色</button>
              </div>
              <div class="char-list-scroll">
                <div
                  v-for="ch in characters"
                  :key="ch.path"
                  class="char-card"
                  :class="{ 'char-card--active': selectedPath === ch.path }"
                  @click="selectCharacter(ch)"
                >
                  <div class="char-card-top">
                    <span class="char-name">{{ ch.name }}</span>
                    <span
                      class="char-role"
                      :style="{ color: roleColor(ch.content), borderColor: roleColor(ch.content) + '55' }"
                    >
                      {{ detectRole(ch.content) }}
                    </span>
                  </div>
                  <div class="char-preview">{{ preview(ch.content) }}</div>
                </div>
                <div v-if="!loading && characters.length === 0" class="char-empty">
                  还没有角色。<br />点「＋ 新建角色」创建第一张卡片。
                </div>
              </div>
            </div>

            <!-- 右：编辑区 -->
            <div class="char-editor">
              <template v-if="selected">
                <div class="char-editor-head">
                  <span class="char-editor-name">{{ selected.name }}</span>
                  <span v-if="dirty" class="char-dirty">● 未保存</span>
                </div>
                <textarea
                  v-model="editingContent"
                  class="char-textarea"
                  spellcheck="false"
                  placeholder="角色的设定内容（Markdown），例如：&#10;# 角色名&#10;- 定位：主角&#10;- 外貌：&#10;- 性格：&#10;- 背景：&#10;- 备注："
                  @input="dirty = true"
                />
                <div class="char-editor-actions">
                  <button class="char-save-btn" :disabled="saving || !dirty" @click="saveCharacter">
                    {{ saving ? '保存中…' : '保存' }}
                  </button>
                  <button class="char-delete-btn" :disabled="saving" @click="deleteCharacter">删除</button>
                </div>
              </template>
              <div v-else class="char-editor-empty">从左侧选择一张角色卡片</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    :show="!!pending"
    :title="confirmTitle"
    :message="confirmMessage"
    ok-label="确定"
    :danger="pending?.kind === 'delete'"
    @confirm="confirmPending"
    @cancel="cancelPending"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import * as api from '../api/files'
import { roleColor } from '../composables/useTheme'
import ConfirmDialog from './ConfirmDialog.vue'

interface CharEntry {
  name: string
  path: string
  content: string
}

const props = defineProps<{ show: boolean; projectRoot: string }>()
const emit = defineEmits<{ close: [] }>()

const characters = ref<CharEntry[]>([])
const selectedPath = ref<string | null>(null)
const editingContent = ref('')
const dirty = ref(false)
const saving = ref(false)
const loading = ref(false)
const pending = ref<{ kind: 'delete' } | { kind: 'switch'; target: CharEntry } | null>(null)

const confirmTitle = computed(() => (pending.value?.kind === 'delete' ? '删除角色' : '放弃修改'))
const confirmMessage = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.kind === 'delete') {
    return `确定删除角色「${selected.value?.name ?? ''}」吗？\n文件会移入项目回收站 .trash。`
  }
  return '有未保存的修改，放弃并切换吗？'
})

const selected = computed(
  () => characters.value.find((c) => norm(c.path) === norm(selectedPath.value ?? '')) ?? null,
)

const charDir = () => `${props.projectRoot.replace(/\\/g, '/')}/角色`

/** 路径比较统一用正斜杠（目录列表返回反斜杠，手工拼接用正斜杠） */
function norm(p: string) {
  return p.replace(/\\/g, '/')
}

async function loadCharacters() {
  loading.value = true
  try {
    const entries = await api.listDir(charDir())
    const files = (entries || []).filter((e: any) => !e.isDir && /\.md$/i.test(e.name))
    const list: CharEntry[] = []
    for (const f of files) {
      try {
        const content = await api.readFile(f.path)
        list.push({ name: f.name.replace(/\.md$/i, ''), path: f.path, content })
      } catch { /* 读不了就跳过 */ }
    }
    characters.value = list
    if (!list.some((c) => norm(c.path) === norm(selectedPath.value ?? ''))) {
      selectedPath.value = list[0]?.path ?? null
    }
  } catch {
    // 角色目录不存在 → 空列表
    characters.value = []
    selectedPath.value = null
  } finally {
    loading.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (pending.value) cancelPending()
  else emit('close')
}

watch(
  () => props.show,
  (v) => {
    if (v) {
      selectedPath.value = null
      editingContent.value = ''
      dirty.value = false
      loadCharacters()
      window.addEventListener('keydown', onKey)
    } else {
      window.removeEventListener('keydown', onKey)
    }
  },
)

function applySelect(ch: CharEntry) {
  selectedPath.value = ch.path
  editingContent.value = ch.content
  dirty.value = false
}

async function selectCharacter(ch: CharEntry) {
  if (dirty.value && selectedPath.value !== ch.path) {
    pending.value = { kind: 'switch', target: ch }
    return
  }
  applySelect(ch)
}

/** 从"定位"字段提取角色类型，用于标签与配色 */
function detectRole(content: string): string {
  const line = content.split('\n').find((l) => l.includes('定位'))
  if (line) {
    const m = line.match(/定位[：:]\s*(.+)/)
    if (m) return m[1].trim().slice(0, 6)
  }
  return '角色'
}

function preview(content: string): string {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('- 定位'))
  return lines[0]?.slice(0, 60) ?? '（空）'
}

async function createCharacter() {
  try {
    await api.createDir(charDir())
  } catch { /* 已存在 */ }

  // 找一个磁盘上真正不存在的名字（同名字符串已存在时自动换编号）
  let n = 1
  let name = '新角色'
  let path = `${charDir()}/${name}.md`
  let created = false
  while (!created && n <= 50) {
    const existsInList = characters.value.some((c) => norm(c.path) === norm(path))
    if (existsInList) {
      n++
      name = `新角色 ${n}`
      path = `${charDir()}/${name}.md`
      continue
    }
    try {
      await api.createFile(path)
      created = true
    } catch {
      // 磁盘上已存在（列表未及时同步等）：换下一个编号重试
      n++
      name = `新角色 ${n}`
      path = `${charDir()}/${name}.md`
    }
  }
  if (!created) return

  const template = `# ${name}\n\n- 定位：主角 / 配角 / 反派 / 路人\n- 外貌：\n- 性格：\n- 背景：\n- 备注：\n`
  try {
    await api.writeFile(path, template)
    await loadCharacters()
    const createdEntry = characters.value.find((c) => norm(c.path) === norm(path))
    if (createdEntry) {
      selectedPath.value = createdEntry.path
      editingContent.value = createdEntry.content
      dirty.value = false
    }
  } catch (e) {
    console.error('新建角色失败:', e)
  }
}

async function saveCharacter() {
  if (!selected.value || saving.value) return
  saving.value = true
  try {
    await api.writeFile(selected.value.path, editingContent.value)
    selected.value.content = editingContent.value
    dirty.value = false
  } catch (e) {
    console.error('保存角色失败:', e)
  } finally {
    saving.value = false
  }
}

function deleteCharacter() {
  if (!selected.value || saving.value) return
  pending.value = { kind: 'delete' }
}

async function confirmPending() {
  const p = pending.value
  pending.value = null
  if (!p) return
  if (p.kind === 'switch') {
    applySelect(p.target)
    return
  }
  await doDelete()
}

function cancelPending() {
  pending.value = null
}

async function doDelete() {
  if (!selected.value || saving.value) return
  try {
    await api.deletePath(selected.value.path)
    characters.value = characters.value.filter((c) => c.path !== selectedPath.value)
    selectedPath.value = characters.value[0]?.path ?? null
    editingContent.value = ''
    dirty.value = false
  } catch (e) {
    console.error('删除角色失败:', e)
  }
}
</script>

<style scoped>
/* 遮罩与关闭按钮（本组件自持，不依赖外部 scoped 样式） */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 64, 50, 0.1);
}

.dialog-close {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.char-modal {
  width: 780px;
  height: 540px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.char-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.char-modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.char-modal-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

.char-modal-header .dialog-close {
  margin-left: auto;
}

.char-modal-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ── 左：卡片列表 ── */
.char-list {
  width: 260px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.char-list-toolbar {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.char-new-btn {
  width: 100%;
  padding: 6px 0;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--color-border-strong);
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
}

.char-new-btn:hover {
  border-color: var(--color-accent-border);
  color: var(--color-accent);
}

.char-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-card {
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  background: var(--color-bg-page);
  transition: border-color 0.12s ease, background 0.12s ease;
}

.char-card:hover {
  border-color: var(--color-accent-border);
}

.char-card--active {
  border-color: var(--color-accent-border);
  background: var(--color-accent-bg);
}

.char-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}

.char-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-role {
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid;
  border-radius: 999px;
  flex-shrink: 0;
}

.char-preview {
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.char-empty {
  padding: 30px 12px;
  text-align: center;
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-muted);
}

/* ── 右：编辑区 ── */
.char-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
}

.char-editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.char-editor-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.char-dirty {
  font-size: 11px;
  color: var(--color-warning);
}

.char-textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  font-family: var(--font-sans);
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  outline: none;
}

.char-textarea:focus {
  border-color: var(--color-accent-border);
}

.char-editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.char-save-btn {
  padding: 6px 16px;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  cursor: pointer;
}

.char-save-btn:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.char-save-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.char-delete-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-danger-border);
  background: none;
  color: var(--color-danger);
  cursor: pointer;
}

.char-delete-btn:hover:not(:disabled) {
  background: var(--color-danger-bg);
}

.char-delete-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.char-editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
