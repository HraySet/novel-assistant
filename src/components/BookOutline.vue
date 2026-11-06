<template>
  <aside class="book-outline w-outline shrink-0 border-r flex flex-col bg-bg-surface"
    style="border-color: var(--color-border)">
    <!-- 标题栏 -->
    <div class="px-3 pt-3 pb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-text-secondary uppercase tracking-wide">全书结构</span>
      <span class="text-[10px] text-text-muted">{{ chapters.length }} 章 · {{ totalWordCount }} 字</span>
    </div>

    <!-- 章节树 -->
    <div class="flex-1 overflow-y-auto px-3 pb-3">
      <div v-if="chapters.length === 0" class="outline-empty">
        还没有正文章节<br />
        <span class="text-text-muted">在左侧文件树新建 .md 文件即可开始</span>
      </div>

      <div v-else class="outline-tree">
        <template v-for="(ch, i) in chapters" :key="ch.path">
          <!-- 目录分隔：当前章与上一章的父目录不同时，插入目录标题 -->
          <div
            v-if="showDirLabel(i)"
            class="outline-dir-label"
            :style="{ paddingLeft: (dirDepth(ch) * 14 + 4) + 'px' }"
          >
            {{ dirLabel(ch) }}
          </div>
          <button
            class="outline-chapter"
            :class="{ 'outline-chapter--active': fileStore.selectedPath === ch.path }"
            :style="{ paddingLeft: (ch.depth * 14 + 22) + 'px' }"
            :title="ch.path"
            @click="open(ch.path)"
          >
            <span class="outline-chapter-name">{{ ch.name }}</span>
            <span v-if="ch.wordCount != null" class="outline-chapter-words">{{ formatWords(ch.wordCount) }}</span>
          </button>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '../stores/file'
import { walkFiles, TREE_POLICIES } from '../core/tree'

const fileStore = useFileStore()
const { tree } = storeToRefs(fileStore)

/**
 * 全书章节（扁平，按树顺序）：走 chapters 策略，排除 角色/大纲 与 `_`/`.` 前缀。
 * 每个条目带 relPath（`卷/章.md`）、parentRelPath（父目录）、depth、wordCount。
 */
const chapters = computed(() => walkFiles(tree.value, TREE_POLICIES.chapters))

const totalWordCount = computed(() => chapters.value.reduce((sum, c) => sum + (c.wordCount ?? 0), 0))

/** 章节展示名：去掉 .md/.txt 扩展名 */
function displayName(name: string): string {
  return name.replace(/\.(md|txt)$/i, '')
}

function open(path: string) {
  void fileStore.handleFileSelect(path)
}

/** 上一章与当前章的父目录不同时，插入目录标题 */
function showDirLabel(i: number): boolean {
  if (i === 0) return true
  return chapters.value[i].parentRelPath !== chapters.value[i - 1].parentRelPath
}

/** 目录标题文字：父目录的相对路径最后一段（根目录为空显示「正文」） */
function dirLabel(ch: { parentRelPath: string }): string {
  const p = ch.parentRelPath
  if (!p) return '正文'
  return p.split('/').pop() || p
}

/** 目录标题的缩进深度 = 父目录的层级 */
function dirDepth(ch: { parentRelPath: string }): number {
  return ch.parentRelPath ? ch.parentRelPath.split('/').length - 1 : 0
}

function formatWords(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}
</script>

<style scoped>
.book-outline { font-size: 13px; width: 240px; }

.outline-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.8;
}

.outline-tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.outline-dir-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 10px 4px 4px;
  user-select: none;
}

.outline-chapter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: inherit;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.outline-chapter:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.outline-chapter--active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
}

.outline-chapter-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-chapter-words {
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
