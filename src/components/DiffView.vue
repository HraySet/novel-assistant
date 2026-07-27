<template>
  <div class="diff-view">
    <!-- 头栏 -->
    <div v-if="title" class="diff-header">
      <span class="diff-title">{{ title }}</span>
      <span class="diff-stats">
        <span class="diff-stat diff-stat--add">+{{ addCount }}</span>
        <span class="diff-stat diff-stat--remove">−{{ removeCount }}</span>
      </span>
    </div>

    <!-- Diff 内容 -->
    <div class="diff-body">
      <div
        v-for="(line, i) in diffLines"
        :key="i"
        class="diff-line"
        :class="'diff-line--' + line.type"
      >
        <span class="diff-gutter diff-gutter--old">{{ line.oldLine ?? '' }}</span>
        <span class="diff-gutter diff-gutter--new">{{ line.newLine ?? '' }}</span>
        <span class="diff-marker">{{ marker(line.type) }}</span>
        <span v-if="line.chars" class="diff-content">
          <span
            v-for="(c, ci) in line.chars"
            :key="ci"
            :class="'char-' + c.type"
          >{{ c.text }}</span>
        </span>
        <span v-else class="diff-content">{{ line.content }}</span>
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="diff-footer">
      <button class="diff-btn diff-btn--reject" @click="$emit('reject')">
        <X :size="14" /> 放弃
      </button>
      <button class="diff-btn diff-btn--accept" @click="$emit('accept')">
        <Check :size="14" /> 应用修改
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X, Check } from 'lucide-vue-next'
import { computeDiff, type DiffLine } from '../composables/useDiff'

const props = defineProps<{
  oldText: string
  newText: string
  title?: string
}>()

defineEmits<{
  accept: []
  reject: []
}>()

const diffLines = computed(() => computeDiff(props.oldText, props.newText))

const addCount = computed(() => diffLines.value.filter(l => l.type === 'add').length)
const removeCount = computed(() => diffLines.value.filter(l => l.type === 'remove').length)

function marker(type: DiffLine['type']): string {
  return type === 'add' ? '+' : type === 'remove' ? '−' : ' '
}
</script>

<style scoped>
.diff-view {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.diff-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}
.diff-title { font-size: 11px; color: var(--color-text-secondary); font-family: var(--font-sans); }
.diff-stats { display: flex; gap: 8px; }
.diff-stat { font-size: 11px; font-weight: 600; font-family: var(--font-mono); }
.diff-stat--add { color: var(--color-success, #22c55e); }
.diff-stat--remove { color: var(--color-danger, #ef4444); }

.diff-body { overflow-x: auto; }

.diff-line {
  display: flex;
  min-height: 22px;
  padding: 0 4px;
}

.diff-line--add { background: rgba(34, 197, 94, 0.08); }
.diff-line--remove { background: rgba(239, 68, 68, 0.08); }
.diff-line--equal { background: transparent; }

.diff-gutter {
  width: 36px;
  text-align: right;
  padding-right: 8px;
  color: var(--color-text-muted);
  user-select: none;
  flex-shrink: 0;
  opacity: 0.5;
}

.diff-marker {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
}
.diff-line--add .diff-marker { color: var(--color-success, #22c55e); }
.diff-line--remove .diff-marker { color: var(--color-danger, #ef4444); }
.diff-line--equal .diff-marker { color: var(--color-text-muted); }

.diff-content {
  flex: 1;
  white-space: pre-wrap;
  overflow-x: auto;
  color: var(--color-text-primary);
}

/* 字级高亮 */
.char-add {
  background: rgba(34, 197, 94, 0.2);
  color: var(--color-success, #16a34a);
}
.char-remove {
  background: rgba(239, 68, 68, 0.2);
  color: var(--color-danger, #dc2626);
  text-decoration: line-through;
}
.char-normal { color: var(--color-text-primary); }

.diff-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 6px 12px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
}
.diff-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 12px; border-radius: var(--radius-sm);
  font-size: 12px; font-family: var(--font-sans); cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
}
.diff-btn--accept {
  border-color: var(--color-success, #22c55e);
  color: var(--color-success, #16a34a);
  background: rgba(34, 197, 94, 0.08);
}
.diff-btn--accept:hover {
  background: var(--color-success, #22c55e);
  color: #fff;
}
.diff-btn--reject:hover {
  background: var(--color-danger, #ef4444);
  color: #fff;
  border-color: var(--color-danger, #ef4444);
}
</style>
