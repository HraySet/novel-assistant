<template>
  <aside class="sidebar w-sidebar shrink-0 border-r flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">
    <div class="px-3 pt-3 pb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-text-secondary uppercase tracking-wide">文件</span>
      <div class="flex gap-1">
        <button class="header-action-btn" title="新建文件" @click="startCreate('file', rootPath)">
          <FilePlus :size="16" />
        </button>
        <button class="header-action-btn" title="新建文件夹" @click="startCreate('dir', rootPath)">
          <FolderPlus :size="16" />
        </button>
      </div>
    </div>

    <!-- 树形区域 + 空白区右键 -->
    <div class="flex-1 overflow-y-auto px-3 pb-3" @contextmenu.self.prevent="openBlankMenu($event)">
      <!-- 根目录下正在创建的草稿行 -->
      <DraftRow v-if="draft && draft.parentPath === rootPath" :type="draft.type" :default-name="draftDefaultName"
        @confirm="confirmDraft" @cancel="cancelDraft" />

      <FileTreeNode v-for="node in files" :key="node.path" :node="node" :active-file="activeFile" :depth="0"
        :draft="draft" :draft-default-name="draftDefaultName" @select-file="(path: string) => $emit('selectFile', path)"
        @start-create="startCreate" @confirm-draft="confirmDraft" @cancel-draft="cancelDraft"
        @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)"
        @move="(source: string, destDir: string) => $emit('move', source, destDir)" />

      <!-- 撑满剩余高度，保证列表短时也有可右键的空白区 -->
      <div class="flex-1 min-h-[80px]" @contextmenu.self.prevent="openBlankMenu($event)" />
    </div>

    <!-- 空白区右键菜单 -->
    <Teleport to="body">
      <div v-if="blankMenu.show" ref="blankMenuRef" class="context-menu"
        :style="{ left: blankMenu.x + 'px', top: blankMenu.y + 'px' }">
        <button class="context-menu-item" @click="startCreate('file', rootPath); closeBlankMenu()">
          <FilePlus :size="14" />
          <span>新建文件</span>
        </button>
        <button class="context-menu-item" @click="startCreate('dir', rootPath); closeBlankMenu()">
          <FolderPlus :size="14" />
          <span>新建文件夹</span>
        </button>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { FilePlus, FolderPlus } from 'lucide-vue-next'
import FileTreeNode from './FileTreeNode.vue'
import DraftRow from './DraftRow.vue'
import type { FileNode } from '../stores/file'

const props = defineProps<{
  rootPath: string
  files: FileNode[]
  activeFile?: string
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string, name: string]
  createDir: [parentPath: string, name: string]
  delete: [path: string]
  rename: [path: string, newName: string]
  move: [source: string, destDir: string]
}>()

// ── 草稿创建态（新建后立刻内联编辑，不弹输入框） ──

interface Draft {
  type: 'file' | 'dir'
  parentPath: string
}

const draft = ref<Draft | null>(null)

// 根据同级已有名字，避免"未命名"重复
function uniqueName(type: 'file' | 'dir', siblings: FileNode[]): string {
  const ext = type === 'file' ? '.md' : ''
  const base = type === 'file' ? '未命名' : '未命名文件夹'
  const existing = new Set(siblings.map(n => n.name))
  if (!existing.has(base + ext)) return base + ext
  let i = 2
  while (existing.has(`${base} ${i}${ext}`)) i++
  return `${base} ${i}${ext}`
}

const draftDefaultName = computed(() => {
  if (!draft.value) return ''
  // 根级草稿用 props.files 查重；嵌套目录下的查重交给 FileTreeNode 内部处理
  const siblings = draft.value.parentPath === props.rootPath ? props.files : []
  return uniqueName(draft.value.type, siblings)
})

function startCreate(type: 'file' | 'dir', parentPath: string) {
  draft.value = { type, parentPath }
}

function confirmDraft(name: string) {
  if (!draft.value) return
  const finalName = name.trim() || draftDefaultName.value
  if (draft.value.type === 'file') {
    emit('createFile', draft.value.parentPath, finalName)
  } else {
    emit('createDir', draft.value.parentPath, finalName)
  }
  draft.value = null
}

function cancelDraft() {
  draft.value = null
}

// ── 空白区右键菜单 ──

const blankMenu = reactive({ show: false, x: 0, y: 0 })
const blankMenuRef = ref<HTMLElement>()

function openBlankMenu(e: MouseEvent) {
  blankMenu.show = true
  blankMenu.x = e.clientX
  blankMenu.y = e.clientY
}

function closeBlankMenu() {
  blankMenu.show = false
}

onClickOutside(blankMenuRef, closeBlankMenu)
</script>

<style scoped>
.sidebar {
  font-size: 13px;
}

/* 头部按钮明显更大，方便快速点击 */
.header-action-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.header-action-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-accent);
}

/* ── 空白区右键菜单 ── */

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
</style>