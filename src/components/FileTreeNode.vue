<template>
  <div class="file-tree-node">
    <!-- 文件夹 -->
    <div
      v-if="node.isDir"
      class="node-row"
      :class="{ 'node-row--expanded': expanded }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }"
      @click="expanded = !expanded"
      @contextmenu.prevent="openDirMenu($event)"
    >
      <span class="node-arrow">{{ expanded ? '▾' : '▸' }}</span>
      <Folder :size="14" class="text-text-muted shrink-0" />
      <span class="node-name">{{ node.name }}</span>
      <span class="node-count" v-if="node.children">{{ node.children.length }}</span>
    </div>

    <!-- 文件 -->
    <div
      v-else
      class="node-row"
      :class="{ 'node-row--active': activeFile === node.path }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }"
      @click="$emit('selectFile', node.path)"
      @contextmenu.prevent="openFileMenu($event)"
    >
      <span class="node-arrow invisible">▸</span>
      <FileText :size="14" class="text-text-muted shrink-0" />
      <span class="node-name">{{ node.name }}</span>
    </div>

    <!-- 子节点区域 -->
    <template v-if="expanded && node.children">
      <!-- 草稿行（在此目录下新建时显示） -->
      <DraftRow
        v-if="draft && draft.parentPath === node.path"
        :type="draft.type"
        :default-name="draftDefaultName"
        :depth="depth + 1"
        @confirm="(name: string) => $emit('confirmDraft', name)"
        @cancel="$emit('cancelDraft')"
      />
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :active-file="activeFile"
        :depth="depth + 1"
        :draft="draft"
        :draft-default-name="draftDefaultName"
        @select-file="(path: string) => $emit('selectFile', path)"
        @start-create="(type: string, path: string) => $emit('startCreate', type, path)"
        @confirm-draft="(name: string) => $emit('confirmDraft', name)"
        @cancel-draft="$emit('cancelDraft')"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
      />
    </template>

    <!-- 目录右键菜单 -->
    <Teleport to="body">
      <div
        v-if="dirMenu.show"
        ref="dirMenuRef"
        class="context-menu"
        :style="{ left: dirMenu.x + 'px', top: dirMenu.y + 'px' }"
      >
        <button class="context-menu-item" @click="startCreateHere('file')">
          <FilePlus :size="14" />
          <span>新建文件</span>
        </button>
        <button class="context-menu-item" @click="startCreateHere('dir')">
          <FolderPlus :size="14" />
          <span>新建文件夹</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          删除
        </button>
      </div>
    </Teleport>

    <!-- 文件右键菜单 -->
    <Teleport to="body">
      <div
        v-if="fileMenu.show"
        ref="fileMenuRef"
        class="context-menu"
        :style="{ left: fileMenu.x + 'px', top: fileMenu.y + 'px' }"
      >
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { FileText, Folder, FilePlus, FolderPlus } from 'lucide-vue-next'
import type { FileNode } from '../stores/file'
import DraftRow from './DraftRow.vue'

const props = defineProps<{
  node: FileNode
  activeFile?: string
  depth: number
  draft?: { type: 'file' | 'dir'; parentPath: string } | null
  draftDefaultName?: string
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  startCreate: [type: string, parentPath: string]
  confirmDraft: [name: string]
  cancelDraft: []
  delete: [path: string]
  rename: [path: string, newName: string]
}>()

const expanded = ref(false)

// ── 目录右键菜单 ──

const dirMenu = reactive({ show: false, x: 0, y: 0 })
const dirMenuRef = ref<HTMLElement>()

function openDirMenu(e: MouseEvent) {
  dirMenu.show = true
  dirMenu.x = e.clientX
  dirMenu.y = e.clientY
}

function closeDirMenu() { dirMenu.show = false }

onClickOutside(dirMenuRef, closeDirMenu)

function startCreateHere(type: 'file' | 'dir') {
  closeDirMenu()
  if (!expanded.value) expanded.value = true
  emit('startCreate', type, props.node.path)
}

// ── 文件右键菜单 ──

const fileMenu = reactive({ show: false, x: 0, y: 0 })
const fileMenuRef = ref<HTMLElement>()

function openFileMenu(e: MouseEvent) {
  fileMenu.show = true
  fileMenu.x = e.clientX
  fileMenu.y = e.clientY
}

function closeFileMenu() { fileMenu.show = false }

onClickOutside(fileMenuRef, closeFileMenu)

// ── 删除 ──

function handleDelete() {
  closeDirMenu()
  closeFileMenu()
  emit('delete', props.node.path)
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

/* ── 右键菜单 ── */

.context-menu {
  position: fixed;
  z-index: 300;
  min-width: 140px;
  padding: 4px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
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
