<template>
  <div class="left-sidebar-wrapper">
    <!-- 图标轨 -->
    <div class="icon-bar icon-bar--left">
      <button
        class="icon-bar-btn"
        :class="{ active: showFileTree }"
        title="文件树"
        @click="$emit('toggle-file-tree')"
      >
        <FolderOpen :size="16" />
      </button>
      <button class="icon-bar-btn" title="搜索文件" @click="$emit('open-search')">
        <Search :size="16" />
      </button>
    </div>

    <!-- 推挤面板：文件树 -->
    <Transition name="slide-left">
      <FileTree
        v-if="showFileTree"
        :root-path="projectPath"
        :active-file="activeFilePath"
        :files="files"
        @select-file="(path: string) => $emit('select-file', path)"
        @create-file="(parentPath: string, name: string) => $emit('create-file', parentPath, name)"
        @create-dir="(parentPath: string, name: string) => $emit('create-dir', parentPath, name)"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen, Search } from 'lucide-vue-next'
import FileTree from './FileTree.vue'
import type { FileNode } from '../stores/file'

defineProps<{
  projectPath: string
  activeFilePath?: string
  files: FileNode[]
  showFileTree: boolean
}>()

defineEmits<{
  'select-file': [path: string]
  'create-file': [parentPath: string, name: string]
  'create-dir': [parentPath: string, name: string]
  'delete': [path: string]
  'rename': [path: string, newName: string]
  'open-search': []
  'toggle-file-tree': []
}>()
</script>

<style scoped>
.left-sidebar-wrapper {
  display: flex;
  flex-shrink: 0;
}

/* ── Icon Bar ── */

.icon-bar {
  width: 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
  gap: 14px;
  flex-shrink: 0;
  background: var(--color-bg-surface);
}

.icon-bar--left {
  border-right: 1px solid var(--color-border);
}

.icon-bar-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.icon-bar-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.icon-bar-btn.active {
  color: var(--color-accent);
  background: var(--color-accent-bg);
}

/* ── Slide Transition ── */

.slide-left-enter-active,
.slide-left-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
