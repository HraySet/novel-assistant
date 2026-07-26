<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="search-overlay" @click.self="$emit('close')">
        <div class="search-modal">
          <div class="search-header">
            <Search :size="16" class="text-text-muted" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索文件..."
              @keydown.escape="$emit('close')"
              @keydown.enter="handleEnter"
              @keydown.up.prevent="searchIndex = Math.max(0, searchIndex - 1)"
              @keydown.down.prevent="searchIndex = Math.min(searchResults.length - 1, searchIndex + 1)"
            />
            <span class="search-kbd">ESC</span>
          </div>
          <div class="search-results">
            <div
              v-for="(item, i) in searchResults"
              :key="item.path"
              class="search-item"
              :class="{ 'search-item--active': searchIndex === i }"
              @click="selectResult(item)"
              @mouseenter="searchIndex = i"
            >
              <span class="text-text-muted mr-2">{{ item.isDir ? '📁' : '📄' }}</span>
              <span class="text-sm text-text-primary">{{ item.name }}</span>
              <span class="ml-auto text-[10px] text-text-muted">{{ item.parent }}</span>
            </div>
            <div v-if="searchQuery && searchResults.length === 0" class="search-empty">
              没有找到匹配的文件
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search } from 'lucide-vue-next'
import type { FileNode } from '../stores/file'

interface SearchResult {
  name: string
  path: string
  isDir: boolean
  parent: string
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
const searchInput = ref<HTMLInputElement>()

const searchResults = computed(() => {
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
          parent: parentPath || '/',
        })
      }
      if (node.children) walk(node.children, node.name)
    }
  }
  walk(props.files, '')
  return results.slice(0, 20)
})

watch(searchQuery, () => { searchIndex.value = 0 })

watch(() => props.show, (v) => {
  if (v) {
    searchQuery.value = ''
    nextTick(() => searchInput.value?.focus())
  }
})

function handleEnter() {
  const item = searchResults.value[searchIndex.value]
  if (item && !item.isDir) selectResult(item)
}

function selectResult(item: SearchResult) {
  emit('close')
  if (!item.isDir) emit('select-file', item.path)
}
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
  width: 420px;
  max-height: 360px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
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

.search-kbd {
  font-size: 10px;
  color: var(--color-text-muted);
}

.search-results {
  max-height: 256px;
  overflow-y: auto;
  padding: 4px;
}

.search-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  margin: 2px 4px;
  transition: background 0.1s ease;
}

.search-item:hover,
.search-item--active {
  background: var(--color-accent-bg);
}

.search-empty {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 16px 0;
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
