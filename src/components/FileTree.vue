<template>
  <aside class="sidebar w-sidebar shrink-0 border-r overflow-y-auto bg-bg-surface"
    style="border-color: var(--color-border)">
    <div class="p-3">
      <div class="flex items-center justify-between mb-3 relative">
        <span class="text-xs font-medium text-text-secondary uppercase tracking-wide">文件</span>

        <button ref="triggerRef" class="sidebar-action-btn" title="新建" @click="showMenu = !showMenu">
          <Plus :size="14" />
        </button>

        <Transition name="menu-pop">
          <div v-if="showMenu" ref="menuRef" class="new-menu">
            <button class="new-menu-item" @click="handleCreateFile">
              <FilePlus :size="14" />
              <span>新建文件</span>
            </button>
            <button class="new-menu-item" @click="handleCreateDir">
              <FolderPlus :size="14" />
              <span>新建文件夹</span>
            </button>
          </div>
        </Transition>
      </div>

      <FileTreeNode v-for="node in files" :key="node.path" :node="node" :active-file="activeFile" :depth="0"
        @select-file="(path: string) => $emit('selectFile', path)"
        @create-file="(path: string) => $emit('createFile', path)"
        @create-dir="(path: string) => $emit('createDir', path)" @delete="(path: string) => $emit('delete', path)"
        @rename="(path: string, name: string) => $emit('rename', path, name)" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Plus, FilePlus, FolderPlus } from 'lucide-vue-next'
import FileTreeNode from './FileTreeNode.vue'
import type { FileNode } from '../stores/file'

const props = defineProps<{
  rootPath: string
  files: FileNode[]
  activeFile?: string
}>()

const emit = defineEmits<{
  selectFile: [path: string]
  createFile: [parentPath: string]
  createDir: [parentPath: string]
  delete: [path: string]
  rename: [path: string, newName: string]
}>()

const showMenu = ref(false)
const menuRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()

onClickOutside(menuRef, () => { showMenu.value = false }, { ignore: [triggerRef] })

function handleCreateFile() {
  showMenu.value = false
  emit('createFile', props.rootPath)
}

function handleCreateDir() {
  showMenu.value = false
  emit('createDir', props.rootPath)
}
</script>

<style scoped>
.sidebar {
  font-size: 13px;
}

.sidebar-action-btn {
  width: 22px;
  height: 22px;
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

.sidebar-action-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

/* ── 新建菜单 ── */

.new-menu {
  position: absolute;
  top: 26px;
  right: 0;
  z-index: 20;
  min-width: 132px;
  padding: 4px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
}

.new-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-primary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.new-menu-item:hover {
  background: var(--color-bg-surface-hover);
}

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}

.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>