<template>
  <aside class="sidebar w-sidebar shrink-0 border-r overflow-y-auto bg-bg-surface"
    style="border-color: var(--color-border)">
    <div class="p-3">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-medium text-text-secondary uppercase tracking-wide">文件</span>
        <div class="flex gap-1">
          <button class="sidebar-action-btn" title="新建文件" @click="$emit('createFile', rootPath)">+</button>
          <button class="sidebar-action-btn" title="新建文件夹" @click="$emit('createDir', rootPath)">📁</button>
        </div>
      </div>

      <FileTreeNode
        v-for="node in files"
        :key="node.path"
        :node="node"
        :active-file="activeFile"
        :depth="0"
        @select-file="(path: string) => $emit('selectFile', path)"
        @create-file="(path: string) => $emit('createFile', path)"
        @create-dir="(path: string) => $emit('createDir', path)"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import FileTreeNode from './FileTreeNode.vue'
import type { FileNode } from '../stores/file'

defineProps<{
  rootPath: string
  files: FileNode[]
  activeFile?: string
}>()

defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string]
  createDir: [parentPath: string]
  delete: [path: string]
  rename: [path: string, newName: string]
}>()
</script>

<style scoped>
.sidebar {
  font-size: 13px;
}

.sidebar-action-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.sidebar-action-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}
</style>
