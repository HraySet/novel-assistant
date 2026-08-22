<template>
  <Teleport to="body">
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="context-menu"
      :style="menuStyle"
    >
      <!-- 空白区域右键 -->
      <template v-if="contextMenu.nodeType === 'blank' && !moveMode">
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
      <template v-if="contextMenu.nodeType === 'dir' && !moveMode">
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
        <button class="context-menu-item" @click="startMove">
          <FolderInput :size="14" />
          <span>移动到…</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="handleToggleFavorite">
          <Star :size="14"
            :fill="isCurrentFavorite ? 'var(--color-star)' : 'none'"
            :style="{ color: isCurrentFavorite ? 'var(--color-star)' : undefined }" />
          <span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}</span>
        </button>
        <div class="context-divider context-divider--danger" />
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          <Trash2 :size="14" />
          <span>删除</span>
        </button>
      </template>

      <!-- 文件右键 -->
      <template v-if="contextMenu.nodeType === 'file' && !moveMode">
        <button class="context-menu-item" @click="handleRename">
          <Pencil :size="14" />
          <span>重命名</span>
        </button>
        <button class="context-menu-item" @click="handleCopyPath">
          <Copy :size="14" />
          <span>复制路径</span>
        </button>
        <button class="context-menu-item" @click="startMove">
          <FolderInput :size="14" />
          <span>移动到…</span>
        </button>
        <button class="context-menu-item" @click="handleHistory">
          <History :size="14" />
          <span>历史版本</span>
        </button>
        <div class="context-divider" />
        <button class="context-menu-item" @click="handleToggleFavorite">
          <Star :size="14"
            :fill="isCurrentFavorite ? 'var(--color-star)' : 'none'"
            :style="{ color: isCurrentFavorite ? 'var(--color-star)' : undefined }" />
          <span>{{ isCurrentFavorite ? '取消收藏' : '收藏' }}</span>
        </button>
        <div class="context-divider context-divider--danger" />
        <button class="context-menu-item context-menu-item--danger" @click="handleDelete">
          <Trash2 :size="14" />
          <span>删除</span>
        </button>
      </template>

      <!-- 移动到…：列出项目内所有文件夹（拖拽不可用时的替代入口） -->
      <template v-if="moveMode">
        <button class="context-menu-item" @click="moveMode = false">
          <ArrowLeft :size="14" />
          <span>选择目标文件夹</span>
        </button>
        <div class="context-divider" />
        <div class="move-list">
          <button
            v-for="d in directories"
            :key="d.path"
            class="context-menu-item move-item"
            :class="{ 'move-item--disabled': isSameTarget(d.path) }"
            :style="{ paddingLeft: 10 + d.depth * 14 + 'px' }"
            :disabled="isSameTarget(d.path)"
            :title="isSameTarget(d.path) ? '不能移动到当前位置或自身内部' : d.path"
            @click="moveTo(d.path)"
          >
            <Folder :size="14" class="move-item-icon" />
            <span class="move-item-name">{{ d.name }}</span>
          </button>
          <div v-if="directories.length === 0" class="move-empty">项目内暂无文件夹，可先新建文件夹</div>
        </div>
      </template>
    </div>

    <!-- 删除确认（ConfirmDialog 自带 Teleport，位置无影响） -->
    <ConfirmDialog
      :show="pendingDelete !== null"
      title="删除"
      message="删除后文件会进入回收站，可随时恢复。确定删除吗？"
      ok-label="删除"
      danger
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { FilePlus, FolderPlus, Pencil, Copy, Star, Trash2, FolderInput, ArrowLeft, Folder, History } from 'lucide-vue-next'
import { useFileStore } from '../stores/file'
import { useToastStore } from '../stores/toast'
import type { FileNode } from '../types/file'
import { storeToRefs } from 'pinia'
import ConfirmDialog from './ConfirmDialog.vue'
const fileStore = useFileStore()
const { contextMenu } = storeToRefs(fileStore)

const menuRef = ref<HTMLElement>()
const pendingDelete = ref<string | null>(null)
/** 移动到子菜单模式：为拖拽不可用/键盘用户提供移动章节的替代入口 */
const moveMode = ref(false)

interface DirEntry { path: string; name: string; depth: number }
const directories = computed<DirEntry[]>(() => {
  const out: DirEntry[] = []
  const walk = (nodes: FileNode[], depth: number) => {
    for (const n of nodes) {
      if (n.isDir) {
        out.push({ path: n.path, name: n.name, depth })
        if (n.children) walk(n.children, depth + 1)
      }
    }
  }
  walk(fileStore.tree, 0)
  return out
})

const norm = (p: string) => p.replace(/\\/g, '/')
/** 目标是否不可达：当前所在目录 / 源自身 / 源内部 */
function isSameTarget(dirPath: string): boolean {
  const src = contextMenu.value.nodePath
  if (!src) return true
  const srcNorm = norm(src)
  const srcDir = srcNorm.slice(0, srcNorm.lastIndexOf('/'))
  const target = norm(dirPath)
  return target === srcDir || target === srcNorm || target.startsWith(srcNorm + '/')
}

function startMove() {
  moveMode.value = true
}

async function moveTo(dirPath: string) {
  const src = contextMenu.value.nodePath
  if (!src || isSameTarget(dirPath)) return
  const name = src.split(/[\\/]/).pop() || src
  fileStore.closeContextMenu()
  moveMode.value = false
  try {
    await fileStore.handleDrop(src, dirPath)
    useToastStore().push('success', '已移动', name)
  } catch (e) {
    console.error('移动失败:', e)
    useToastStore().push('error', '移动失败', e instanceof Error ? e.message : String(e), 4000)
  }
}

// 关闭菜单时重置移动到状态
watch(
  () => contextMenu.value.visible,
  (v) => { if (!v) moveMode.value = false },
)

const menuStyle = computed(() => ({
  left: contextMenu.value.x + 'px',
  top: contextMenu.value.y + 'px',
}))

// Edge overflow correction
// 边缘溢出修正 + 入场动画：先隐藏（visibility:hidden），
// 计算完修正位置后再从动画起点切到终点，避免“先闪一帧再跳”
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
      menu.style.opacity = '0'
      menu.style.transform = 'scale(0.96) translateY(-4px)'
      menu.style.visibility = 'visible'
      requestAnimationFrame(() => {
        menu.style.opacity = '1'
        menu.style.transform = 'scale(1) translateY(0)'
      })
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

/** 历史版本：把请求写进 file store，由 App 层打开全局 HistoryModal */
function handleHistory() {
  const path = contextMenu.value.nodePath
  fileStore.closeContextMenu()
  if (path) fileStore.requestHistory(path)
}

function handleDelete() {
  const path = contextMenu.value.nodePath
  fileStore.closeContextMenu()
  pendingDelete.value = path
}

function confirmDelete() {
  const path = pendingDelete.value
  pendingDelete.value = null
  if (path) {
    fileStore.deletePath(path).catch((e) => {
      console.error('删除失败:', e)
      useToastStore().push('error', '删除失败', e instanceof Error ? e.message : String(e), 4000)
    })
  }
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
  /* 先隐藏，边缘修正计算完再显示（配合 rAF 入场动画） */
  visibility: hidden;
  transition: transform 0.1s ease, opacity 0.1s ease;
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
/* ── 移动到…子菜单 ── */
.move-list {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.move-item-icon { color: var(--color-text-muted); flex-shrink: 0; }
.move-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.move-item--disabled {
  opacity: 0.4;
  cursor: default;
}
.move-item--disabled:hover { background: none; }
.move-empty {
  padding: 10px 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
}
.context-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}

/* 删除前的那条分隔线加深，预告“接下来是危险操作” */
.context-divider--danger {
  background: var(--color-danger-border, var(--color-border));
}
</style>
