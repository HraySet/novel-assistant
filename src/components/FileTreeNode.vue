<template>
  <div class="file-tree-node">
    <div v-if="node.isDir" class="node-row"
      :class="{ 'node-row--expanded': expanded, 'node-row--drop-target': dragOver }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="handleToggleExpand"
      @contextmenu.prevent="openMenu($event, 'dir')" draggable="true" @dragstart="handleDragStart($event, node.path)"
      @dragover.prevent="handleDragOver($event)" @dragleave="handleDragLeave"
      @drop.prevent="handleDrop($event, node.path)">
      <span class="node-arrow">{{ expanded ? '▾' : '▸' }}</span>
      <Folder :size="14" class="text-text-muted shrink-0" />
      <span v-if="!renaming" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="confirmRename(node.name, (newName) => emit('rename', node.path, newName))"
        @keydown.escape="cancelRename"
        @blur="confirmRename(node.name, (newName) => emit('rename', node.path, newName))" />
      <span class="node-count" v-if="!renaming && node.children?.length">{{ node.children.length }}</span>
    </div>

    <div v-else class="node-row" :class="{ 'node-row--active': activeFile === node.path }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="handleFileClick"
      @contextmenu.prevent="openMenu($event, 'file')" draggable="true" @dragstart="handleDragStart($event, node.path)">
      <span class="node-arrow invisible">▸</span>
      <FileText :size="14" class="text-text-muted shrink-0" />
      <span v-if="!renaming" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="confirmRename(node.name, (newName) => emit('rename', node.path, newName))"
        @keydown.escape="cancelRename"
        @blur="confirmRename(node.name, (newName) => emit('rename', node.path, newName))" />
    </div>

    <template v-if="expanded && node.children">
      <DraftRow v-if="draft && draft.parentPath === node.path" :type="draft.type" :default-name="draftDefaultName ?? ''"
        :depth="depth + 1" @confirm="(name: string) => $emit('confirmDraft', name)" @cancel="$emit('cancelDraft')" />
      <FileTreeNode v-for="child in node.children" :key="child.path" :node="child" :active-file="activeFile"
        :depth="depth + 1" :draft="draft" :draft-default-name="draftDefaultName"
        @select-file="(path: string) => $emit('selectFile', path)"
        @start-create="(type: 'file' | 'dir', path: string) => $emit('startCreate', type, path)"
        @confirm-draft="(name: string) => $emit('confirmDraft', name)" @cancel-draft="$emit('cancelDraft')"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
        @move="(source: string, destDir: string) => $emit('move', source, destDir)" />
    </template>

    <TreeContextMenu v-model="menuVisible" :x="menuX" :y="menuY">
      <button v-if="menuType === 'dir'" class="context-menu-item" @click="startCreateHere('file')">
        <FilePlus :size="14" />
        <span>新建文件</span>
      </button>
      <button v-if="menuType === 'dir'" class="context-menu-item" @click="startCreateHere('dir')">
        <FolderPlus :size="14" />
        <span>新建文件夹</span>
      </button>
      <div v-if="menuType === 'dir'" class="context-divider" />
      <button class="context-menu-item" @click="closeMenu(); startRename(node.name, node.isDir)">
        <Pencil :size="14" />
        <span>重命名</span>
      </button>
      <button class="context-menu-item" @click="handleCopyPath">
        <Copy :size="14" />
        <span>复制路径</span>
      </button>
      <div class="context-divider" />
      <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
        删除
      </button>
    </TreeContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileText, Folder, FilePlus, FolderPlus, Pencil, Copy } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import type { FileNode } from '../stores/file'
import { useFileStore } from '../stores/file'
import DraftRow from './DraftRow.vue'
import TreeContextMenu from './TreeContextMenu.vue'
import { useFileTreeNodeInteractions } from '../composables/useFileTreeNodeInteractions'

const props = defineProps<{
  node: FileNode
  activeFile?: string
  depth: number
  draft?: { type: 'file' | 'dir'; parentPath: string } | null
  draftDefaultName?: string
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  startCreate: [type: 'file' | 'dir', parentPath: string]
  confirmDraft: [name: string]
  cancelDraft: []
  delete: [path: string]
  rename: [path: string, newName: string]
  copyPath: [path: string]
  move: [source: string, destDir: string]
}>()

const fileStore = useFileStore()
const { expandedPaths, selectedPath } = storeToRefs(fileStore)

const expanded = computed({
  get: () => fileStore.isExpanded(props.node.path),
  set: (value: boolean) => {
    if (value) fileStore.expandPath(props.node.path)
    else fileStore.toggleExpanded(props.node.path)
  },
})

const {
  renaming,
  renameValue,
  renameInputRef,
  dragOver,
  startRename,
  confirmRename,
  cancelRename,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop: handleDropInteraction,
} = useFileTreeNodeInteractions()

function handleFileClick() {
  if (renaming.value) return
  if (props.activeFile === props.node.path) {
    startRename(props.node.name, props.node.isDir)
    return
  }
  emit('selectFile', props.node.path)
  fileStore.setSelectedPath(props.node.path)
}

function handleToggleExpand() {
  if (!props.node.isDir) return
  if (expanded.value) {
    fileStore.toggleExpanded(props.node.path)
  } else {
    fileStore.expandPath(props.node.path)
  }
}

async function handleCopyPath() {
  closeMenu()
  try {
    await navigator.clipboard.writeText(props.node.path)
    emit('copyPath', props.node.path)
  } catch (e) {
    console.error('复制路径失败:', e)
  }
}

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuType = ref<'dir' | 'file' | null>(null)

function openMenu(e: MouseEvent, type: 'dir' | 'file') {
  menuType.value = type
  menuVisible.value = true
  menuX.value = e.clientX
  menuY.value = e.clientY
}

function closeMenu() {
  menuVisible.value = false
}

function startCreateHere(type: 'file' | 'dir') {
  closeMenu()
  if (!expanded.value) {
    fileStore.expandPath(props.node.path)
  }
  emit('startCreate', type, props.node.path)
}

function handleDelete() {
  closeMenu()
  emit('delete', props.node.path)
}

function handleDrop(event: DragEvent, nodePath: string) {
  handleDropInteraction(event, nodePath, (sourcePath, destDir) => {
    if (!expanded.value) {
      fileStore.expandPath(props.node.path)
    }
    emit('move', sourcePath, destDir)
  })
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

.context-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-primary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.context-menu-item:hover {
  background: var(--color-bg-surface-hover);
}

.context-menu-item--danger {
  color: var(--color-danger);
}

.context-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}
</style>