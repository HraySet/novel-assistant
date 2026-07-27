<template>
  <div class="file-tree-node">
    <!-- Directory node -->
    <div v-if="node.isDir" class="node-row" :class="{
      'node-row--expanded': isExpanded,
      'node-row--drop-target': dragOver,
      'node-row--active': fileStore.selectedPath === node.path,
    }" :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="fileStore.handleDirectoryClick(node.path)"
      @dblclick.stop="fileStore.startRename(node.path)"
      @contextmenu.prevent="openMenu($event, 'dir')" draggable="true" @dragstart="handleDragStart($event, node.path)"
      @dragend="handleDragEnd" @dragenter.prevent="handleDragEnter($event)" @dragover.prevent="handleDragOver($event)" @dragleave="handleDragLeave"
      @drop.prevent="handleDrop($event, node.path)">
      <span class="node-arrow">{{ isExpanded ? '▾' : '▸' }}</span>
      <Folder :size="14" class="text-text-muted shrink-0" />
      <span v-if="fileStore.renamingPath !== node.path" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="handleConfirm" @keydown.escape="handleCancel" @blur="handleConfirm" />
      <span v-if="fileStore.renamingPath !== node.path && node.children?.length" class="node-count">
        {{ node.children.length }}
      </span>
    </div>

    <!-- File node -->
    <div v-else class="node-row" :class="{ 'node-row--active': fileStore.selectedPath === node.path }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="fileStore.handleFileSelect(node.path)"
      @dblclick.stop="fileStore.startRename(node.path)"
      @contextmenu.prevent="openMenu($event, 'file')" draggable="true" @dragstart="handleDragStart($event, node.path)"
      @dragend="handleDragEnd">
      <span class="node-arrow invisible">▸</span>
      <FileText :size="14" class="text-text-muted shrink-0" />
      <span v-if="fileStore.renamingPath !== node.path" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="handleConfirm" @keydown.escape="handleCancel" @blur="handleConfirm" />
    </div>

    <!-- Expanded children -->
    <template v-if="isExpanded && node.children">
      <!-- Draft row at this level -->
      <DraftRow v-if="draftState && draftState.parentPath === node.path" :type="draftState.type"
        :default-name="draftState.defaultName" :depth="depth + 1" @confirm="fileStore.confirmDraft($event)"
        @cancel="fileStore.cancelDraft()" />
      <FileTreeNode v-for="child in node.children" :key="child.path" :node="child" :depth="depth + 1" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Folder } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import type { FileNode } from '../types/file'
import { useFileStore } from '../stores/file'
import { useRename } from '../composables/useRename'
import { useFileTreeDrag } from '../composables/useFileTreeDrag'
import DraftRow from './DraftRow.vue'

const props = defineProps<{
  node: FileNode
  depth: number
}>()

const fileStore = useFileStore()
const { draft: draftState } = storeToRefs(fileStore)

const isExpanded = computed(() => fileStore.isExpanded(props.node.path))

const { renameValue, renameInputRef, handleConfirm, handleCancel } = useRename(
  props.node.path,
  props.node.name,
  props.node.isDir
)

const { dragOver, handleDragStart, handleDragEnter, handleDragOver, handleDragLeave, handleDragEnd, handleDrop } = useFileTreeDrag()

function openMenu(e: MouseEvent, type: 'file' | 'dir') {
  fileStore.openContextMenu(e.clientX, e.clientY, props.node.path, type)
}
</script>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding-right: 8px;
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

.node-row--drop-target {
  background: var(--color-accent-bg);
  outline: 1.5px dashed var(--color-accent-border);
  outline-offset: -1px;
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

.rename-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-accent-border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  outline: none;
}
</style>
