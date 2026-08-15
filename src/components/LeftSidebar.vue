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
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { FilePlus, FolderPlus, FoldVertical } from 'lucide-vue-next'
import { useFileStore } from '../stores/file'
import FileTreeNode from './FileTreeNode.vue'
import DraftRow from './DraftRow.vue'
import { importDroppedFilesInto } from '../composables/useExternalFileImport'

const fileStore = useFileStore()
const { tree: treeNodes, draft: draftState } = storeToRefs(fileStore)

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

.drop-root { outline: 2px dashed var(--color-accent-border); outline-offset: -4px; }
</style>
