<template>
  <div class="file-tree-node">
    <!-- 文件夹 -->
    <div v-if="node.isDir" class="node-row" :class="{ 'node-row--expanded': expanded, 'node-row--drop-target': dragOver }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="expanded = !expanded"
      @contextmenu.prevent="openDirMenu($event)"
      draggable="true"
      @dragstart="handleDragStart"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop">
      <span class="node-arrow">{{ expanded ? '▾' : '▸' }}</span>
      <Folder :size="14" class="text-text-muted shrink-0" />
      <span v-if="!renaming" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="confirmRename" @keydown.escape="cancelRename" @blur="confirmRename" />
      <span class="node-count" v-if="!renaming && node.children?.length">{{ node.children.length }}</span>
    </div>

    <!-- 文件 -->
    <div v-else class="node-row" :class="{ 'node-row--active': activeFile === node.path }"
      :style="{ paddingLeft: depth * 14 + 4 + 'px' }" @click="handleFileClick"
      @contextmenu.prevent="openFileMenu($event)"
      draggable="true"
      @dragstart="handleDragStart">
      <span class="node-arrow invisible">▸</span>
      <FileText :size="14" class="text-text-muted shrink-0" />
      <span v-if="!renaming" class="node-name">{{ node.name }}</span>
      <input v-else ref="renameInputRef" v-model="renameValue" class="rename-input" spellcheck="false" @click.stop
        @keydown.enter="confirmRename" @keydown.escape="cancelRename" @blur="confirmRename" />
    </div>

    <!-- 子节点区域 -->
    <template v-if="expanded && node.children">
      <!-- 草稿行（在此目录下新建时显示） -->
      <DraftRow v-if="draft && draft.parentPath === node.path" :type="draft.type" :default-name="draftDefaultName"
        :depth="depth + 1" @confirm="(name: string) => $emit('confirmDraft', name)" @cancel="$emit('cancelDraft')" />
      <FileTreeNode v-for="child in node.children" :key="child.path" :node="child" :active-file="activeFile"
        :depth="depth + 1" :draft="draft" :draft-default-name="draftDefaultName"
        @select-file="(path: string) => $emit('selectFile', path)"
        @start-create="(type: 'file' | 'dir', path: string) => $emit('startCreate', type, path)"
        @confirm-draft="(name: string) => $emit('confirmDraft', name)" @cancel-draft="$emit('cancelDraft')"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)" />
    </template>

    <!-- 目录右键菜单 -->
    <Teleport to="body">
      <div v-if="dirMenu.show" ref="dirMenuRef" class="context-menu"
        :style="{ left: dirMenu.x + 'px', top: dirMenu.y + 'px' }">
        <button class="context-menu-item" @click="startCreateHere('file')">
          <FilePlus :size="14" />
          <span>新建文件</span>
        </button>
        <button class="context-menu-item" @click="startCreateHere('dir')">
          <FolderPlus :size="14" />
          <span>新建文件夹</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="closeDirMenu(); startRename()">
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
      </div>
    </Teleport>

    <!-- 文件右键菜单 -->
    <Teleport to="body">
      <div v-if="fileMenu.show" ref="fileMenuRef" class="context-menu"
        :style="{ left: fileMenu.x + 'px', top: fileMenu.y + 'px' }">
        <button class="context-menu-item" @click="closeFileMenu(); startRename()">
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
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { FileText, Folder, FilePlus, FolderPlus, Pencil, Copy } from 'lucide-vue-next'
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
  startCreate: [type: 'file' | 'dir', parentPath: string]
  confirmDraft: [name: string]
  cancelDraft: []
  delete: [path: string]
  rename: [path: string, newName: string]
  copyPath: [path: string]
  move: [source: string, destDir: string]
}>()

const expanded = ref(false)

// ── 文件点击：已激活的文件再点一下 = 进入重命名，否则才是打开 ──

function handleFileClick() {
  if (renaming.value) return
  if (props.activeFile === props.node.path) {
    startRename()
    return
  }
  emit('selectFile', props.node.path)
}

// ── 内联重命名 ──

const renaming = ref(false)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement>()
let renameConfirmed = false

function startRename() {
  renameConfirmed = false
  renameValue.value = props.node.name
  renaming.value = true
  nextTick(() => {
    const el = renameInputRef.value
    if (!el) return
    el.focus()
    if (!props.node.isDir) {
      const dot = props.node.name.lastIndexOf('.')
      el.setSelectionRange(0, dot > 0 ? dot : props.node.name.length)
    } else {
      el.select()
    }
  })
}

function confirmRename() {
  if (renameConfirmed) return
  renameConfirmed = true
  renaming.value = false
  const trimmed = renameValue.value.trim()
  if (trimmed && trimmed !== props.node.name) {
    emit('rename', props.node.path, trimmed)
  }
}

function cancelRename() {
  renameConfirmed = true
  renaming.value = false
}

// ── 复制路径 ──

async function handleCopyPath() {
  closeDirMenu()
  closeFileMenu()
  try {
    await navigator.clipboard.writeText(props.node.path)
    emit('copyPath', props.node.path) // 父组件可以借此弹一个"已复制"的轻提示
  } catch (e) {
    console.error('复制路径失败:', e)
  }
}

// ── 菜单边界检测：避免在屏幕边缘弹出时被截断 ──

function clampMenuPosition(x: number, y: number) {
  const menuW = 150
  const menuH = 160
  const clampedX = Math.min(x, window.innerWidth - menuW - 8)
  const clampedY = Math.min(y, window.innerHeight - menuH - 8)
  return { x: Math.max(8, clampedX), y: Math.max(8, clampedY) }
}

// ── 目录右键菜单 ──

const dirMenu = reactive({ show: false, x: 0, y: 0 })
const dirMenuRef = ref<HTMLElement>()

function openDirMenu(e: MouseEvent) {
  closeFileMenu()
  const { x, y } = clampMenuPosition(e.clientX, e.clientY)
  dirMenu.show = true
  dirMenu.x = x
  dirMenu.y = y
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
  closeDirMenu()
  const { x, y } = clampMenuPosition(e.clientX, e.clientY)
  fileMenu.show = true
  fileMenu.x = x
  fileMenu.y = y
}

function closeFileMenu() { fileMenu.show = false }

onClickOutside(fileMenuRef, closeFileMenu)

// ── 删除 ──
// 注意：建议父组件对应的实现挪动到 .trash/ 目录而不是物理删除，
// 保留一个"最近删除"可恢复的余地，避免手滑丢失稿件内容。

function handleDelete() {
  closeDirMenu()
  closeFileMenu()
  emit('delete', props.node.path)
}

// ── 拖拽 ──

const dragOver = ref(false)

function handleDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.node.path)
}

function handleDragOver(e: DragEvent) {
  if (!e.dataTransfer) return
  // 不能拖到自己里面
  if (e.dataTransfer.types.includes('text/plain')) {
    e.dataTransfer.dropEffect = 'move'
    dragOver.value = true
  }
}

function handleDragLeave() {
  dragOver.value = false
}

function handleDrop(e: DragEvent) {
  dragOver.value = false
  const sourcePath = e.dataTransfer?.getData('text/plain')
  if (!sourcePath || sourcePath === props.node.path) return
  // 不能拖到自己的子目录
  if (sourcePath.startsWith(props.node.path + '/') || sourcePath.startsWith(props.node.path + '\\')) return
  if (!expanded.value) expanded.value = true
  emit('move', sourcePath, props.node.path)
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