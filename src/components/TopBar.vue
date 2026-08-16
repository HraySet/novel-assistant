<template>
  <div class="topbar h-9 flex items-center px-3 gap-2 shrink-0 border-b bg-bg-surface"
    style="border-color: var(--color-border)">

    <!-- 项目名 → 回项目库 -->
    <button class="topbar-project" @click="$emit('goLibrary')">
      <FolderOpen :size="14" class="flex-shrink-0" />
      <span class="topbar-project-name">{{ projectName }}</span>
      <span v-if="isDirty" class="dirty-dot" title="有未保存修改" />
    </button>

    <div class="topbar-divider" />

    <!-- 章节导航：上一章 / 当前章节 / 下一章 -->
    <div class="flex-1 flex items-center justify-center min-w-0">
      <template v-if="fileName">
        <button class="topbar-btn" title="上一章" :disabled="!prevPath" @click="prevPath && $emit('navigate', prevPath)">
          <ChevronLeft :size="15" />
        </button>
        <div class="flex flex-col items-center min-w-0">
          <span class="chapter-name" :title="fileName">{{ fileName }}</span>
          <span v-if="chapterIndex !== undefined && chapterTotal !== undefined && chapterTotal > 0" class="chapter-progress">
            {{ chapterIndex }} / {{ chapterTotal }}
          </span>
        </div>
        <button class="topbar-btn" title="下一章" :disabled="!nextPath" @click="nextPath && $emit('navigate', nextPath)">
          <ChevronRight :size="15" />
        </button>
      </template>
      <span v-else class="text-xs text-text-muted">未打开章节</span>
    </div>

    <div class="topbar-divider" />

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1">
      <button class="topbar-search" title="搜索文件 (Ctrl+P)" @click="$emit('openSearch')">
        <Search :size="13" />
        <kbd class="kbd">Ctrl P</kbd>
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
  /** 当前章节在项目章节序列中的位置（1 起始） */
  chapterIndex?: number
  /** 项目章节总数 */
  chapterTotal?: number
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

/* 纯色竖线改为上下渐隐，更柔和 */
.topbar-divider {
  width: 1px;
  height: 16px;
  background: linear-gradient(to bottom, transparent, var(--color-border) 30%, var(--color-border) 70%, transparent);
  flex-shrink: 0;
}

.chapter-name {
  font-size: 12px;
  color: var(--color-text-primary);
  font-weight: 500;
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
  transition: background 0.1s ease, color 0.1s ease, transform 0.1s ease;
}

.topbar-btn:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.topbar-btn:disabled {
  opacity: 0.25;
  cursor: default;
}

.topbar-btn--active {
  color: var(--color-accent);
  background: var(--color-accent-bg);
}
/* 未保存呼吸点 */
.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  margin-left: 2px;
  flex-shrink: 0;
  animation: dirty-pulse 2s ease-in-out infinite;
}
@keyframes dirty-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 章节进度提示 */
.chapter-progress {
  font-size: 9px;
  color: var(--color-text-muted);
  line-height: 1;
  margin-top: 1px;
  font-variant-numeric: tabular-nums;
}

/* 搜索条样式（露出快捷键） */
.topbar-search {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: var(--color-bg-surface-hover);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  transition: background 0.1s ease, color 0.1s ease;
}
.topbar-search:hover {
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}
</style>
