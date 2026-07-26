<template>
  <div
    class="file-tree-node"
    :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
  >
    <!-- 文件夹 -->
    <div v-if="node.isDir" class="node-row"
      :class="{ 'node-row--expanded': expanded }"
      @click="expanded = !expanded"
      @contextmenu.prevent="showMenu"
    >
      <span class="node-arrow">{{ expanded ? '▾' : '▸' }}</span>
      <span class="node-name">{{ node.name }}</span>
      <span class="node-count" v-if="node.children">{{ node.children.length }}</span>
    </div>

    <!-- 文件 -->
    <div v-else class="node-row"
      :class="{ 'node-row--active': activeFile === node.path }"
      @click="$emit('selectFile', node.path)"
      @contextmenu.prevent="showMenu"
    >
      <span class="node-arrow invisible">▸</span>
      <span class="node-name">{{ node.name }}</span>
    </div>

    <!-- 子节点 -->
    <template v-if="expanded && node.children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :active-file="activeFile"
        :depth="depth + 1"
        @select-file="(path: string) => $emit('selectFile', path)"
        @create-file="(path: string) => $emit('createFile', path)"
        @create-dir="(path: string) => $emit('createDir', path)"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FileNode } from '../stores/file'

const props = defineProps<{
  node: FileNode
  activeFile?: string
  depth: number
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string]
  createDir: [parentPath: string]
  delete: [path: string]
  rename: [path: string, newName: string]
}>()

const expanded = ref(false)

function showMenu() {
  // TODO: 右键菜单
}
</script>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: background 0.1s ease, color 0.1s ease;
  user-select: none;
}

.node-row:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.node-row--active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.node-arrow {
  width: 14px;
  font-size: 11px;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.node-arrow.invisible {
  visibility: hidden;
}

.node-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.node-count {
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}
</style>
