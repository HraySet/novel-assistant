<template>
  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="context-menu"
      :style="menuStyle"
    >
      <!-- 空白区域右键 -->
      <template v-if="contextMenu.nodeType === 'blank'">
        <button class="context-menu-item" @click="handleNewFile">
          <FilePlus :size="14" />
          <span>新建文件</span>
        </button>
        <button class="context-menu-item" @click="handleNewDir">
          <FolderPlus :size="14" />
          <span>新建文件夹</span>
        </button>
      </template>

      <!-- 目录右键 -->
      <template v-if="contextMenu.nodeType === 'dir'">
        <button class="context-menu-item" @click="handleNewFile">
          <FilePlus :size="14" />
          <span>新建文件</span>
        </button>
        <button class="context-menu-item" @click="handleNewDir">
          <FolderPlus :size="14" />
          <span>新建文件夹</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="handleRename">
          <Pencil :size="14" />
          <span>重命名</span>
        </button>
        <button class="context-menu-item" @click="handleCopyPath">
          <Copy :size="14" />
          <span>复制路径</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="handleToggleFavorite">
          <Star :size="14" />
          <span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          删除
        </button>
      </template>

      <!-- 文件右键 -->
      <template v-if="contextMenu.nodeType === 'file'">
        <button class="context-menu-item" @click="handleRename">
          <Pencil :size="14" />
          <span>重命名</span>
        </button>
        <button class="context-menu-item" @click="handleCopyPath">
          <Copy :size="14" />
          <span>复制路径</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="handleToggleFavorite">
          <Star :size="14" />
          <span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          删除
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { FilePlus, FolderPlus, Pencil, Copy, Star } from 'lucide-vue-next'
import { useFileStore } from '../stores/file'
import { storeToRefs } from 'pinia'

const fileStore = useFileStore()
const { contextMenu } = storeToRefs(fileStore)

const menuRef = ref<HTMLElement>()

const menuStyle = computed(() => ({
  left: contextMenu.value.x + 'px',
  top: contextMenu.value.y + 'px',
}))

// Edge overflow correction
watch(
  () => contextMenu.value.visible,
  (visible) => {
    if (!visible) return
    requestAnimationFrame(() => {
      const menu = menuRef.value
      if (!menu) return
      const maxX = window.innerWidth - menu.offsetWidth - 8
      const maxY = window.innerHeight - menu.offsetHeight - 8
      menu.style.left = `${Math.min(contextMenu.value.x, maxX)}px`
      menu.style.top = `${Math.min(contextMenu.value.y, maxY)}px`
    })
  }
)

onClickOutside(menuRef, () => {
  fileStore.closeContextMenu()
})

function handleNewFile() {
  const parentPath = contextMenu.value.nodeType === 'blank'
    ? fileStore.projectRoot
    : contextMenu.value.nodePath
  // For dir nodes, expand before creating a draft inside
  if (contextMenu.value.nodeType === 'dir') {
    fileStore.expandPath(contextMenu.value.nodePath)
  }
  fileStore.closeContextMenu()
  fileStore.startDraft('file', parentPath)
}

function handleNewDir() {
  const parentPath = contextMenu.value.nodeType === 'blank'
    ? fileStore.projectRoot
    : contextMenu.value.nodePath
  if (contextMenu.value.nodeType === 'dir') {
    fileStore.expandPath(contextMenu.value.nodePath)
  }
  fileStore.closeContextMenu()
  fileStore.startDraft('dir', parentPath)
}

function handleRename() {
  const path = contextMenu.value.nodePath
  fileStore.closeContextMenu()
  fileStore.startRename(path)
}

async function handleCopyPath() {
  const path = contextMenu.value.nodePath
  fileStore.closeContextMenu()
  try {
    await navigator.clipboard.writeText(path)
  } catch (e) {
    console.error('复制路径失败:', e)
  }
}

function handleDelete() {
  const path = contextMenu.value.nodePath
  fileStore.closeContextMenu()
  if (!confirm('确定要删除吗？（会移到 .trash）')) return
  fileStore.deletePath(path)
}

const isCurrentFavorite = computed(() => {
  const path = contextMenu.value.nodePath
  return path ? fileStore.isFavorite(path) : false
})

function handleToggleFavorite() {
  const path = contextMenu.value.nodePath
  if (!path) return
  fileStore.closeContextMenu()
  fileStore.toggleFavorite(path)
}
</script>

<style scoped>
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
