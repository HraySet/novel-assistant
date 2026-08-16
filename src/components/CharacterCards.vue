<template>
  <BaseModal :show="show" :close-on-esc="false" width="780px" height="540px" @close="$emit('close')">
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
                <button class="char-new-btn" @click="createCharacter"><Plus :size="13" />新建角色</button>
                <button class="char-extract-btn" :disabled="extracting || !canExtract"
                  :title="canExtract ? '从当前打开的章节抽取新角色名（一次小调用）' : '先打开一章正文（至少 200 字）'"
                  @click="extractCharacters">
                  <Sparkles :size="13" />{{ extracting ? '抽取中…' : '从本章抽取' }}
                </button>
                <div v-if="extractNote" class="char-extract-note">{{ extractNote }}</div>
              </div>
              <div class="char-list-scroll">
                <div v-if="loading" class="char-loading"><RefreshCw :size="14" class="spinning" />加载中…</div>
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
                      :style="{ color: roleColor(ch.content), borderColor: `color-mix(in srgb, ${roleColor(ch.content)} 33%, transparent)` }"
                    >
                      {{ detectRole(ch.content) }}
                    </span>
                  </div>
                  <div class="char-preview">{{ preview(ch.content) }}</div>
                  <div class="char-mention" :class="{ 'char-mention--none': !mentionCount(ch.name) }">{{ mentionText(ch.name) }}</div>
                </div>
                <div v-if="!loading && characters.length === 0" class="char-empty">
                  <Users :size="28" class="char-empty-icon" />
                  <div>还没有角色</div>
                  <div class="char-empty-hint">点「新建角色」创建第一张卡片</div>
                </div>
              </div>
            </div>

            <!-- 右：编辑区 -->
            <div class="char-editor">
              <template v-if="selected">
                <div class="char-editor-head">
                  <span class="char-editor-name">{{ selected.name }}</span>
                  <span v-if="dirty" class="char-dirty"><StatusDot level="mid" size="sm" :glow="false" />未保存</span>
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
  </BaseModal>

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
import { X, Plus, Users, RefreshCw, Sparkles } from 'lucide-vue-next'
import * as api from '../api/files'
import { roleColor } from '../composables/useTheme'
import { streamChat } from '../composables/useAiStream'
import { useSettingsStore } from '../stores/settings'
import ConfirmDialog from './ConfirmDialog.vue'
import BaseModal from './BaseModal.vue'
import StatusDot from './StatusDot.vue'

interface CharEntry {
  name: string
  path: string
  content: string
}

const props = defineProps<{ show: boolean; projectRoot: string; currentContent: string }>()
const emit = defineEmits<{ close: [] }>()

const characters = ref<CharEntry[]>([])
const selectedPath = ref<string | null>(null)
const editingContent = ref('')
const dirty = ref(false)
const saving = ref(false)
const loading = ref(false)
const pending = ref<{ kind: 'delete' } | { kind: 'switch'; target: CharEntry } | { kind: 'extract' } | null>(null)
const mentions = ref<Record<string, api.MentionStat>>({})
const extracting = ref(false)
const extractCandidates = ref<string[]>([])
const extractNote = ref('')

const confirmTitle = computed(() => {
  const p = pending.value
  if (p?.kind === 'delete') return '删除角色'
  if (p?.kind === 'extract') return '从本章抽取角色'
  return '放弃修改'
})
const confirmMessage = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.kind === 'delete') {
    return `确定删除角色「${selected.value?.name ?? ''}」吗？\n文件会移入项目回收站 .trash。`
  }
  if (p.kind === 'extract') {
    return `将为以下新角色创建卡片（创建后可编辑设定）：\n${extractCandidates.value.join('、')}`
  }
  return '有未保存的修改，放弃并切换吗？'
})

const selected = computed(
  () => characters.value.find((c) => norm(c.path) === norm(selectedPath.value ?? '')) ?? null,
)

const canExtract = computed(() => (props.currentContent ?? '').trim().length >= 200)

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
    void scanMentionsFor(list)
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

/** 角色出场统计（零 token：本地扫描正文） */
function mentionCount(name: string): number {
  return mentions.value[name]?.count ?? 0
}
function mentionText(name: string): string {
  const m = mentions.value[name]
  if (!m || m.count <= 0) return '正文中未出场'
  const file = m.lastFile.split('/').pop() || m.lastFile
  return `出场 ${m.count} 次 · 最近 ${file}`
}
async function scanMentionsFor(list: CharEntry[]) {
  if (list.length === 0) {
    mentions.value = {}
    return
  }
  try {
    const stats = await api.scanMentions(list.map((c) => c.name))
    const map: Record<string, api.MentionStat> = {}
    for (const s of stats) map[s.name] = s
    mentions.value = map
  } catch { /* 扫描失败不阻塞面板 */ }
}

async function createCharacter() {
  const created = await createCharFile('新角色')
  if (!created) return
  await loadCharacters()
  const entry = characters.value.find((c) => norm(c.path) === norm(created))
  if (entry) {
    selectedPath.value = entry.path
    editingContent.value = entry.content
    dirty.value = false
  }
}

/** 创建一张角色卡文件（重名自动加编号）；返回创建的路径，失败返回 null */
async function createCharFile(name: string): Promise<string | null> {
  const safe = name.replace(/[\\/:*?"<>|]/g, '').trim()
  if (!safe) return null
  try {
    await api.createDir(charDir())
  } catch { /* 已存在 */ }
  let n = 1
  let candidate = safe
  let path = `${charDir()}/${candidate}.md`
  while (n <= 50) {
    const exists = characters.value.some((c) => norm(c.path) === norm(path))
    if (!exists) {
      try {
        await api.createFile(path)
        const template = `# ${candidate}\n\n- 定位：主角 / 配角 / 反派 / 路人\n- 外貌：\n- 性格：\n- 背景：\n- 备注：\n`
        try { await api.writeFile(path, template) } catch { /* 模板写失败不阻塞 */ }
        return path
      } catch { /* 磁盘上已存在 → 换编号 */ }
    }
    n++
    candidate = `${safe} ${n}`
    path = `${charDir()}/${candidate}.md`
  }
  return null
}

/** AI 抽取：从当前打开的章节提取人名（一次小调用，只输出名字 JSON，不重写内容） */
const EXTRACT_SYSTEM = '你是小说人物名提取器。阅读给定正文，提取其中出现的人物名（人名，含明显指向人物的昵称）。只输出一个 JSON 字符串数组，例如 ["张三","李四"]。不要输出任何其他内容；没有人物则输出 []。'

async function extractCharacters() {
  if (extracting.value || !canExtract.value) return
  const settings = useSettingsStore()
  if (!settings.aiApiKey) {
    extractNote.value = '需先在设置中配置 API Key'
    clearNote()
    return
  }
  extracting.value = true
  extractNote.value = ''
  try {
    const content = props.currentContent.slice(0, 8000)
    const { text } = await streamChat({
      provider: settings.aiProvider,
      endpoint: settings.aiEndpoint,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      system: EXTRACT_SYSTEM,
      temperature: 0.2,
      messages: [{ role: 'user', content: `正文：\n${content}` }],
      signal: new AbortController().signal,
      onToken: () => {},
    })
    const fresh = parseNameList(text).filter(
      (n) => !characters.value.some((c) => c.name === n),
    )
    if (fresh.length === 0) {
      extractNote.value = '未发现新角色名'
      clearNote()
      return
    }
    extractCandidates.value = fresh
    pending.value = { kind: 'extract' }
  } catch (e) {
    console.error('抽取失败:', e)
    extractNote.value = '抽取失败，请重试'
    clearNote()
  } finally {
    extracting.value = false
  }
}

/** 容错解析 AI 返回的名字数组（只取 [ ] 之间的 JSON） */
function parseNameList(text: string): string[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const arr = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim())
      .filter((n) => n.length >= 2 && n.length <= 12 && !/^[\d\s]+$/.test(n))
  } catch {
    return []
  }
}

function clearNote() {
  setTimeout(() => { extractNote.value = '' }, 4000)
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
  if (p.kind === 'delete') {
    await doDelete()
    return
  }
  // extract：批量创建候选角色卡
  const names = extractCandidates.value
  extractCandidates.value = []
  let created = 0
  for (const n of names) {
    if (await createCharFile(n)) created++
  }
  if (created > 0) {
    await loadCharacters()
    extractNote.value = `已创建 ${created} 张角色卡`
    clearNote()
  }
}

function cancelPending() {
  extractCandidates.value = []
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

/* 盒子外壳（背景/圆角/阴影/进出场）由 BaseModal 统一提供 */
.char-modal {
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
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: border-color 0.12s ease, color 0.12s ease;
}

.char-new-btn:hover {
  border-color: var(--color-accent-border);
  color: var(--color-accent);
}

.char-extract-btn {
  width: 100%;
  padding: 6px 0;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-strong);
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: border-color 0.12s ease, color 0.12s ease;
}
.char-extract-btn:hover:not(:disabled) {
  border-color: var(--color-accent-border);
  color: var(--color-accent);
}
.char-extract-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.char-extract-note {
  font-size: 11px;
  color: var(--color-warning);
  text-align: center;
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
  border: 1px solid var(--color-border); /* fallback：:style 有值时覆盖，没有时不裸露浏览器默认色 */
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

.char-mention {
  margin-top: 4px;
  font-size: 10px;
  color: var(--color-accent);
}
.char-mention--none {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.char-empty {
  padding: 30px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.char-empty-icon { opacity: 0.25; }
.char-empty-hint { font-size: 11px; opacity: 0.7; }

.char-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 0;
  font-size: 11px;
  color: var(--color-text-muted);
}

.spinning { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }

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
  display: flex;
  align-items: center;
  gap: 4px;
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
