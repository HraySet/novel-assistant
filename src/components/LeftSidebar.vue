<template>
  <aside class="sidebar w-sidebar shrink-0 border-r flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">
    <!-- 标题栏 -->
    <div class="px-3 pt-3 pb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-text-secondary uppercase tracking-wide">文件</span>
      <div class="flex gap-1">
        <button class="header-action-btn" title="新建文件" @click="handleCreate('file')">
          <FilePlus :size="16" />
        </button>
        <button class="header-action-btn" title="新建文件夹" @click="handleCreate('dir')">
          <FolderPlus :size="16" />
        </button>
        <button class="header-action-btn" title="折叠全部" @click="fileStore.collapseAll()">
          <FoldVertical :size="16" />
        </button>
      </div>
    </div>

    <!-- 树形区域 + 空白区右键 + 根级拖放 -->
    <div
      class="flex-1 overflow-y-auto px-3 pb-3"
      :class="{ 'drop-root': dragOverRoot }"
      @contextmenu.self.prevent="fileStore.openContextMenu($event.clientX, $event.clientY, '', 'blank')"
      @dragenter.self.prevent="handleRootDragEnter($event)"
      @dragover.self.prevent="handleRootDragOver($event)"
      @dragleave.self="handleRootDragLeave"
      @drop.self.prevent="handleRootDrop($event)"
    >
      <!-- 收藏分组：星标文件快捷入口 -->
      <div v-if="favoriteNodes.length > 0" class="fav-section">
        <div class="fav-header" @click="showFavorites = !showFavorites">
          <Star :size="11" class="fav-star-icon" />
          <span class="fav-title">收藏</span>
          <span class="fav-count">{{ favoriteNodes.length }}</span>
          <ChevronRight :size="12" class="fav-chevron" :class="{ 'fav-chevron--open': showFavorites }" />
        </div>
        <Transition name="fav-list">
        <div v-if="showFavorites" class="fav-list">
          <button
            v-for="f in favoriteNodes"
            :key="f.path"
            class="fav-row"
            :class="{ 'fav-row--active': fileStore.selectedPath === f.path }"
            :title="f.path"
            @click="fileStore.handleFileSelect(f.path)"
          >
            <FileText :size="12" class="shrink-0 text-text-muted" />
            <span class="fav-name">{{ f.name }}</span>
          </button>
        </div>
        </Transition>
      </div>
      <DraftRow
        v-if="draftState && draftState.parentPath === fileStore.projectRoot"
        :type="draftState.type"
        :default-name="draftState.defaultName"
        @confirm="fileStore.confirmDraft($event)"
        @cancel="fileStore.cancelDraft()"
      />

      <FileTreeNode
        v-for="node in treeNodes"
        :key="node.path"
        :node="node"
        :depth="0"
      />

      <div
        class="flex-1 min-h-[80px]"
        @contextmenu.self.prevent="fileStore.openContextMenu($event.clientX, $event.clientY, '', 'blank')"
        @dragenter.prevent.stop="handleRootDragEnter"
        @dragover.prevent.stop="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent.stop="handleRootDrop"
      />
    </div>

  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FilePlus, FolderPlus, FoldVertical, Star, FileText, ChevronRight } from 'lucide-vue-next'
import type { FileNode } from '../types/file'
import { useFileStore } from '../stores/file'
import FileTreeNode from './FileTreeNode.vue'
import DraftRow from './DraftRow.vue'
import { importDroppedFilesInto } from '../composables/useExternalFileImport'

const fileStore = useFileStore()
const { tree: treeNodes, draft: draftState } = storeToRefs(fileStore)

/** 展平文件树中所有被收藏的文件（保持树顺序） */
const favoriteNodes = computed(() => {
  const out: FileNode[] = []
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) walk(n.children)
      } else if (fileStore.isFavorite(n.path)) {
        out.push(n)
      }
    }
  }
  walk(treeNodes.value)
  return out
})

// 收藏分组折叠状态（跨会话记忆）
const showFavorites = ref(localStorage.getItem('file-fav-section-open') !== '0')
watch(showFavorites, (v) => localStorage.setItem('file-fav-section-open', v ? '1' : '0'))
function handleCreate(type: 'file' | 'dir') {
  const selectedNode = fileStore.selectedPath ? fileStore.findNode(fileStore.selectedPath) : null
  const parentPath = selectedNode?.isDir ? selectedNode.path : fileStore.projectRoot
  fileStore.expandPath(parentPath)
  fileStore.startDraft(type, parentPath)
}

const dragOverRoot = ref(false)

function handleRootDragEnter(e: DragEvent) {
  const types = e.dataTransfer ? Array.from(e.dataTransfer.types) : []
  if (types.includes('text/plain') || types.includes('Files')) dragOverRoot.value = true
}
function handleRootDragOver(e: DragEvent) {
  const dt = e.dataTransfer
  if (!dt) return
  const types = Array.from(dt.types)
  // 源只允许 COPY，根级落点同样请求 copy 保证协商成功
  if (types.includes('text/plain') || types.includes('Files')) dt.dropEffect = 'copy'
}
function handleRootDragLeave() { dragOverRoot.value = false }
async function handleRootDrop(e: DragEvent) {
  dragOverRoot.value = false
  const dt = e.dataTransfer
  if (!dt) return
  // 1) 内部移动优先：应用内拖拽同时携带 text/plain 与 Files
  const sourcePath = dt.getData('text/plain')
  if (sourcePath && fileStore.findNode(sourcePath)) {
    fileStore.handleDrop(sourcePath, fileStore.projectRoot)
    return
  }
  // 2) 外部文件拖入 → 复制进项目根目录
  if (dt.files.length > 0) {
    await importDroppedFilesInto(dt, fileStore.projectRoot)
  }
}
</script>

<style scoped>
.sidebar { font-size: 13px; }

.header-action-btn {
  width: 28px; height: 28px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-secondary); background: none; border: none; cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}
.header-action-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-accent); }

.drop-root { outline: 2px dashed var(--color-accent-border); outline-offset: -4px; background: var(--color-accent-bg); }

.fav-section {
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}

.fav-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  color: var(--color-text-secondary);
}
.fav-header:hover { background: var(--color-bg-surface-hover); }

.fav-star-icon { color: var(--color-warning); }

.fav-title { font-size: 11px; font-weight: 600; }

.fav-count {
  font-size: 10px;
  color: var(--color-text-muted);
  background: var(--color-bg-surface-hover);
  border-radius: 999px;
  padding: 0 6px;
  line-height: 14px;
}

/* 展开指示：lucide chevron + 旋转过渡 */
.fav-chevron {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.15s ease;
}
.fav-chevron--open { transform: rotate(90deg); }

/* 收藏列表展开/收起淡入淡出 */
.fav-list-enter-active,
.fav-list-leave-active {
  transition: opacity 0.12s ease;
}
.fav-list-enter-from,
.fav-list-leave-to {
  opacity: 0;
}

.fav-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0;
}

.fav-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.fav-row:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.fav-row--active { background: var(--color-accent-bg); color: var(--color-accent); }

.fav-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
