<template>
  <div class="topbar h-9 flex items-center px-3 gap-2 shrink-0 border-b bg-bg-surface"
    style="border-color: var(--color-border)">

    <!-- 项目名 → 回项目库 -->
    <button class="topbar-project" @click="$emit('goLibrary')">
      <FolderOpen :size="14" class="flex-shrink-0" />
      <span class="topbar-project-name">{{ projectName }}</span>
      <span v-if="isDirty" class="text-warning text-[10px] ml-0.5" title="有未保存修改">●</span>
    </button>

    <div class="topbar-divider" />

    <!-- 章节导航：上一章 / 当前章节 / 下一章 -->
    <div class="flex-1 flex items-center justify-center min-w-0">
      <template v-if="fileName">
        <button class="topbar-btn" title="上一章" :disabled="!prevPath" @click="prevPath && $emit('navigate', prevPath)">
          <ChevronLeft :size="15" />
        </button>
        <span class="chapter-name" :title="fileName">{{ fileName }}</span>
        <button class="topbar-btn" title="下一章" :disabled="!nextPath" @click="nextPath && $emit('navigate', nextPath)">
          <ChevronRight :size="15" />
        </button>
      </template>
      <span v-else class="text-xs text-text-muted">未打开章节</span>
    </div>

    <div class="topbar-divider" />

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1">
      <button class="topbar-btn" title="搜索文件 (Ctrl+P)" @click="$emit('openSearch')">
        <Search :size="14" />
      </button>
      <button
        class="topbar-btn"
        :class="{ 'topbar-btn--active': focusMode }"
        :title="focusMode ? '退出专注模式 (Esc)' : '专注模式 (Ctrl+Shift+F)'"
        @click="$emit('toggleFocus')"
      >
        <Maximize2 :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderOpen, ChevronLeft, ChevronRight, Search, Maximize2 } from 'lucide-vue-next'

defineProps<{
  projectName: string
  fileName?: string
  isDirty?: boolean
  /** 上一章路径（章节顺序导航，替代原来的打开历史后退） */
  prevPath?: string
  /** 下一章路径 */
  nextPath?: string
  /** 专注模式开关状态（按钮高亮显示） */
  focusMode?: boolean
}>()

defineEmits<{
  goLibrary: []
  navigate: [path: string]
  openSearch: []
  toggleFocus: []
}>()

</script>

<style scoped>
.topbar-project {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  max-width: 200px;
  transition: background 0.1s ease, color 0.1s ease;
}

.topbar-project:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-project-name {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-divider {
  width: 1px;
  height: 16px;
  background: var(--color-border);
  flex-shrink: 0;
}

.chapter-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.1s ease, color 0.1s ease;
}

.chapter-name:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-btn {
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
  flex-shrink: 0;
  transition: background 0.1s ease, color 0.1s ease;
}

.topbar-btn:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-btn:disabled {
  opacity: 0.25;
  cursor: default;
}

.topbar-btn--active {
  color: var(--color-accent);
  background: var(--color-accent-bg);
}
</style>
