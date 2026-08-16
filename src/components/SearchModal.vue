<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="search-overlay" @click.self="$emit('close')">
        <Transition name="search-modal" appear>
          <div class="search-modal">
          <div class="search-header">
            <Search :size="16" class="text-text-muted shrink-0" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索文件名或内容…"
              @keydown.escape="$emit('close')"
              @keydown.enter="handleEnter"
              @keydown.up.prevent="moveUp"
              @keydown.down.prevent="moveDown"
            />
            <button v-if="searchQuery && !searching" class="search-clear" title="清空" @click="clearQuery">
              <X :size="12" />
            </button>
            <span v-if="searching" class="search-spinner" />
            <span v-else class="search-kbd">ESC</span>
          </div>

          <div class="search-results" ref="resultsEl">
            <!-- 近期文件（无搜索词时） -->
            <template v-if="!searchQuery && recentFiles.length">
              <div class="results-label">最近打开</div>
              <div
                v-for="(f, i) in recentFiles"
                :key="f.path"
                class="search-item"
                :class="{ 'search-item--active': searchIndex === i }"
                @click="selectFile(f.path)"
                @mouseenter="searchIndex = i"
              >
                <FileText :size="14" class="text-text-muted shrink-0" />
                <span class="search-name">{{ f.name }}</span>
                <span class="search-path">{{ f.relPath }}</span>
              </div>
            </template>

            <!-- 文件名匹配 -->
            <template v-if="nameResults.length">
              <div v-if="searchQuery" class="results-label">文件名 ({{ nameResults.length }})</div>
              <div
                v-for="(item, i) in nameResults"
                :key="'name-' + item.path"
                class="search-item"
                :class="{ 'search-item--active': searchIndex === i + offsetForName }"
                @click="selectFile(item.path)"
                @mouseenter="searchIndex = i + offsetForName"
              >
                <FileText v-if="!item.isDir" :size="14" class="text-text-muted shrink-0" />
                <Folder v-else :size="14" class="text-text-muted shrink-0" />
                <span class="search-name" v-html="highlight(item.name)" />
                <span class="search-path">{{ item.relPath }}</span>
              </div>
            </template>

            <!-- 内容匹配 -->
            <template v-if="contentMatches.length">
              <div class="results-label">文件内容 ({{ contentMatches.length }})<span class="results-label-note">仅搜索 .md/.txt 文本</span></div>
              <div
                v-for="(item, i) in contentMatches"
                :key="'content-' + item.path"
                class="search-item search-item--content"
                :class="{ 'search-item--active': searchIndex === i + offsetForContent }"
                @click="selectFile(item.path)"
                @mouseenter="searchIndex = i + offsetForContent"
              >
                <FileText :size="14" class="text-text-muted shrink-0" />
                <div class="search-content-body">
                  <span class="search-name" v-html="highlight(item.name)" />
                  <span class="search-snippet" v-html="item.snippet" />
                </div>
                <span class="search-path">{{ item.relPath }}</span>
              </div>
            </template>

            <!-- 空态 -->
            <div v-if="searchQuery && allResults.length === 0 && !searching" class="search-empty">
              <SearchX :size="24" class="search-empty-icon" />
              <div>没有找到匹配的文件</div>
            </div>
          </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, SearchX, FileText, Folder, X } from 'lucide-vue-next'
import type { FileNode } from '../types/file'
import * as api from '../api/files'

interface SearchResult {
  name: string
  path: string
  isDir: boolean
  relPath: string
  snippet?: string
}

const props = defineProps<{
  show: boolean
  files: FileNode[]
}>()

const emit = defineEmits<{
  close: []
  'select-file': [path: string]
}>()

const searchQuery = ref('')
const searchIndex = ref(0)
const searching = ref(false)
const searchInput = ref<HTMLInputElement>()
const resultsEl = ref<HTMLElement>()
const contentMatches = ref<SearchResult[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null
// 查询序号：每次查询变化 +1，异步结果回来时序号不匹配则丢弃，防止旧结果覆盖新结果
let searchSeq = 0

// ── 收集所有文件路径（排除目录） ──
function collectFiles(nodes: FileNode[], basePath = ''): { path: string; name: string; relPath: string }[] {
  const result: { path: string; name: string; relPath: string }[] = []
  for (const n of nodes) {
    if (!n.isDir) {
      result.push({ path: n.path, name: n.name, relPath: basePath || '/' })
    }
    if (n.children) {
      const childBase = basePath ? `${basePath}/${n.name}` : n.name
      result.push(...collectFiles(n.children, childBase))
    }
  }
  return result
}

// ── 文件名搜索（即时） ──
const nameResults = computed(() => {
  if (!searchQuery.value) return []
  const q = searchQuery.value.toLowerCase()
  const results: SearchResult[] = []

  function walk(nodes: FileNode[], parentPath: string) {
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(q)) {
        results.push({
          name: node.name,
          path: node.path,
          isDir: node.isDir,
          relPath: parentPath || '/',
        })
      }
      if (node.children) {
        const childPath = parentPath ? `${parentPath}/${node.name}` : node.name
        walk(node.children, childPath)
      }
    }
  }
  walk(props.files, '')
  return results.slice(0, 15)
})

// ── 近期文件 ──
const recentFiles = computed(() => {
  if (searchQuery.value) return []
  const allFiles = collectFiles(props.files)
  return allFiles.slice(0, 8).map(f => ({
    ...f,
    isDir: false as const,
  }))
})

// ── 合并结果 + 索引起始偏移 ──
const offsetForName = computed(() => recentFiles.value.length)
const offsetForContent = computed(() => offsetForName.value + nameResults.value.length)

const allResults = computed(() => {
  if (!searchQuery.value) return recentFiles.value
  return [...nameResults.value, ...contentMatches.value]
})

// ── 全文搜索（防抖 300ms） ──
watch(searchQuery, (q) => {
  searchIndex.value = 0
  contentMatches.value = []
  const seq = ++searchSeq

  if (!q || q.length < 2) { searching.value = false; return }

  if (searchTimer) clearTimeout(searchTimer)
  searching.value = true

  searchTimer = setTimeout(async () => {
    const term = q.toLowerCase()
    const files = collectFiles(props.files)

    // 并发读取（限 6 路），结果按文件顺序收集；找到 15 条即停
    const out: (SearchResult | null)[] = new Array(files.length).fill(null)
    let matchCount = 0
    let next = 0
    const workers = Array.from({ length: Math.min(6, files.length) }, async () => {
      while (true) {
        if (seq !== searchSeq || matchCount >= 15) return
        const i = next++
        if (i >= files.length) return
        const f = files[i]
        // 只搜可读文本（与导出支持的格式一致），跳过图片等二进制文件
        if (!/\.(md|txt)$/i.test(f.name)) continue
        try {
          const content = await api.readFile(f.path)
          if (seq !== searchSeq || matchCount >= 15) return
          const idx = content.toLowerCase().indexOf(term)
          if (idx >= 0) {
            // 提取匹配片段（前后各 40 字符）
            const start = Math.max(0, idx - 40)
            const end = Math.min(content.length, idx + term.length + 40)
            let snippet = content.slice(start, end)
            if (start > 0) snippet = '…' + snippet
            if (end < content.length) snippet += '…'
            // 高亮匹配词：先整体 HTML 转义（正文可能含 <script> 等片段），
            // 再对命中词包 <mark>，杜绝 v-html 注入
            snippet = highlightWithMark(snippet, term)

            out[i] = {
              name: f.name,
              path: f.path,
              isDir: false,
              relPath: f.relPath,
              snippet,
            }
            matchCount++
          }
        } catch {
          // 跳过读不了的文件
        }
      }
    })
    await Promise.all(workers)
    if (seq !== searchSeq) return
    contentMatches.value = out.filter((r): r is SearchResult => r !== null)
    searching.value = false
  }, 300)
})

// ── 高亮匹配词（HTML 转义 + <mark> 包裹，供 v-html 安全渲染） ──
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 把文本按命中词切分：普通部分转义，命中部分转义后包 <mark> */
function highlightWithMark(text: string, term: string): string {
  if (!term) return escapeHtml(text)
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .split(new RegExp(`(${escaped})`, 'gi'))
    .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
    .join('')
}

function highlight(text: string) {
  return highlightWithMark(text, searchQuery.value)
}

// ── 键盘导航 ──
function moveUp() {
  searchIndex.value = Math.max(0, searchIndex.value - 1)
  scrollToActive()
}

function moveDown() {
  searchIndex.value = Math.min(allResults.value.length - 1, searchIndex.value + 1)
  scrollToActive()
}

function scrollToActive() {
  nextTick(() => {
    const el = resultsEl.value?.querySelector('.search-item--active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function handleEnter() {
  const item = allResults.value[searchIndex.value]
  if (item) selectFile(item.path)
}

function selectFile(path: string) {
  emit('close')
  emit('select-file', path)
}

function clearQuery() {
  searchQuery.value = ''
  nextTick(() => searchInput.value?.focus())
}

watch(() => props.show, (v) => {
  if (v) {
    searchQuery.value = ''
    contentMatches.value = []
    searching.value = false
    nextTick(() => searchInput.value?.focus())
  } else {
    searchSeq++ // 作废进行中的全文搜索
  }
})
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding-top: 120px;
  background: rgba(74, 64, 50, 0.08);
}

.search-modal {
  width: 480px;
  max-height: 420px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--color-text-primary);
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

/* 与设置页 .kbd 同一套快捷键徽标视觉 */
.search-kbd {
  font-size: 10px;
  font-family: var(--font-mono);
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.search-clear {
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  color: var(--color-text-muted); background: none; border: none; cursor: pointer; flex-shrink: 0;
}
.search-clear:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.search-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.results-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
  padding: 8px 16px 4px;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  margin: 1px 4px;
  transition: background 0.1s ease;
}

.search-item:hover,
.search-item--active {
  background: var(--color-accent-bg);
}

.search-item--content {
  align-items: flex-start;
}

/* 内容匹配项：图标与文件名基线对齐，而不是贴多行块顶部 */
.search-item--content > svg {
  margin-top: 1px;
}

.search-name {
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.search-path {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
}

.search-content-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-snippet {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-empty {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.search-empty-icon { opacity: 0.3; }

.results-label-note {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
  opacity: 0.7;
}

/* 匹配高亮 */
:deep(mark) {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-radius: 2px;
  padding: 0 1px;
}

/* 文件名高亮更“实”：是你要找的目标，而不是上下文证据 */
.search-name :deep(mark) {
  font-weight: 600;
}

/* 弹窗：从上方轻轻落下（“召唤”感） */
.search-modal-enter-active,
.search-modal-leave-active {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.search-modal-enter-from,
.search-modal-leave-to {
  transform: translateY(-8px) scale(0.98);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
