<template>
  <div v-if="openFiles.length > 0" class="tabs-bar">
    <div class="tabs-scroll" ref="scrollRef">
      <div
        v-for="file in openFiles"
        :key="file.path"
        class="tab-item"
        :class="{ 'tab-item--active': openFile?.path === file.path }"
        :title="file.path"
        role="button"
        tabindex="0"
        @click="switchTab(file.path)"
        @auxclick.middle.prevent="closeTab(file.path)"
        @keydown.enter="switchTab(file.path)"
      >
        <span v-if="file.isDirty" class="tab-dirty" />
        <span class="tab-name">{{ file.name }}</span>
        <button
          class="tab-close"
          @click.stop="closeTab(file.path)"
          title="关闭"
        >&times;</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '../stores/file'

const fileStore = useFileStore()
const { openFiles, openFile } = storeToRefs(fileStore)
const scrollRef = ref<HTMLElement>()

function switchTab(path: string) {
  if (path === fileStore.openFile?.path) return
  fileStore.handleFileSelect(path)
}

async function closeTab(path: string) {
  // 脏文件先保存再关；保存失败（含写盘期间仍有新键入）时中止关闭，避免丢内容
  const target = openFiles.value.find(f => f.path === path)
  if (target?.isDirty) {
    const saved = await fileStore.saveFile(path)
    if (!saved) return
  }
  fileStore.closeFile(path)
}

// 切换标签时自动滚动到 active tab
watch(() => openFile.value?.path, () => {
  nextTick(() => {
    const el = scrollRef.value?.querySelector('.tab-item--active')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})
</script>

<style scoped>
.tabs-bar {
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-scroll::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px 0 10px;
  border-right: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-muted);
  background: transparent;
  border-top: none;
  border-bottom: 2px solid transparent;
  border-left: none;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 150px;
  transition: background 0.1s, color 0.1s;
}
.tab-item:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}
.tab-item--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
  background: var(--color-bg-page);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dirty {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
}

.tab-close {
  width: 16px; height: 16px;
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; line-height: 1;
  color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s, background 0.1s, color 0.1s;
}
.tab-item:hover .tab-close,
.tab-item--active .tab-close { opacity: 1; }
.tab-close:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-danger);
}
</style>
