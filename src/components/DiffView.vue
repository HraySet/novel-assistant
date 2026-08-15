<template>
  <div class="diff-view" :class="{ 'diff-view--compact': compact }">
    <!-- 头栏 -->
    <div class="diff-header">
      <span v-if="title" class="diff-title">{{ title }}</span>
      <span v-else class="diff-title" />
      <span class="diff-stats">
        <span class="diff-stat diff-stat--add">+{{ addCount }}</span>
        <span class="diff-stat diff-stat--remove">−{{ removeCount }}</span>
        <span v-if="modifyCount > 0" class="diff-stat diff-stat--modify">≈{{ modifyCount }} 修改</span>
      </span>
    </div>
    <div v-if="editable && hasMutable" class="diff-hint">点击行首图标可单独撤销该行修改</div>

    <!-- Diff 内容 -->
    <div v-if="addCount === 0 && removeCount === 0" class="diff-empty">
      AI 未做出任何修改
    </div>
    <div v-else class="diff-body">
      <div
        v-for="(line, i) in diffLines"
        :key="i"
        class="diff-line"
        :class="'diff-line--' + line.type"
      >
        <span v-if="editable && line.type !== 'equal'" class="diff-toggle" :title="isOn(i) ? '点击取消这一行的修改' : '点击恢复这一行的修改'" @click.stop="toggle(i)">
          <Check v-if="!toggledOff.has(i)" :size="12" />
        </span>
        <span v-else class="diff-toggle" />
        <span v-if="!compact" class="diff-gutter diff-gutter--old">{{ line.oldLine ?? '' }}</span>
        <span v-if="!compact" class="diff-gutter diff-gutter--new">{{ line.newLine ?? '' }}</span>
        <span class="diff-marker">{{ marker(line.type) }}</span>
        <span class="diff-content" :class="{ 'diff-content--off': toggledOff.has(i) }">{{ line.content }}</span>
      </div>
    </div>

    <!-- 操作栏 -->
    <div class="diff-footer">
      <button class="diff-btn diff-btn--reject" @click="$emit('reject')">
        <X :size="14" /> 放弃
      </button>
      <button class="diff-btn diff-btn--accept" @click="handleAccept">
        <Check :size="14" /> {{ allToggledOff ? '应用（无改动）' : '应用修改' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import { computeDiff, type DiffLine } from '../composables/useDiff'

const props = defineProps<{
  oldText: string
  newText: string
  title?: string
  editable?: boolean
  /** 紧凑模式：隐藏行号槽、缩小字号（用于窄的侧边面板） */
  compact?: boolean
  /** diff 粒度：'word' 按词/字（散文推荐），'line' 按行（代码） */
  granularity?: 'line' | 'word'
}>()

const emit = defineEmits<{
  accept: [finalText: string]
  reject: []
}>()

// diff 只计算一次（文本变化时重算），计数全部从这一份结果派生，
// 避免模板里 4 个 computed 各自重跑一遍 O(m×n) 的 LCS
const diffLines = ref<DiffLine[]>([])

function countBy(lines: DiffLine[], type: DiffLine['type']): number {
  let c = 0
  for (const l of lines) if (l.type === type) c++
  return c
}

const addCount = computed(() => countBy(diffLines.value, 'add'))
const removeCount = computed(() => countBy(diffLines.value, 'remove'))
// 相邻的"删除块 + 新增块"视为修改
const modifyCount = computed(() => {
  let count = 0
  const lines = diffLines.value
  let i = 0
  while (i < lines.length) {
    if (lines[i].type === 'remove') {
      let j = i
      let r = 0
      let a = 0
      while (j < lines.length && lines[j].type === 'remove') { r++; j++ }
      while (j < lines.length && lines[j].type === 'add') { a++; j++ }
      count += Math.min(r, a)
      i = j
    } else {
      i++
    }
  }
  return count
})

// 是否存在可切换的行（增/删）
const hasMutable = computed(() => addCount.value + removeCount.value > 0)
// 所有可切换的行都被关闭时，应用结果等同原文——文案明确提示
const allToggledOff = computed(() => {
  let mutable = 0
  let off = 0
  for (let i = 0; i < diffLines.value.length; i++) {
    if (diffLines.value[i].type === 'equal') continue
    mutable++
    if (toggledOff.value.has(i)) off++
  }
  return mutable > 0 && off === mutable
})

// ── 局部接受：toggle 状态 ──

const toggledOff = ref(new Set<number>())

// oldText / newText 变化时重算 diff 并重置所有 toggle 为开
watch(
  () => [props.oldText, props.newText],
  () => {
    diffLines.value = computeDiff(props.oldText, props.newText, props.granularity ?? 'word')
    toggledOff.value = new Set()
  },
  { immediate: true },
)

function toggle(i: number) {
  const next = new Set(toggledOff.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  toggledOff.value = next
}

function isOn(i: number) { return !toggledOff.value.has(i) }

// 根据 toggle 状态合并最终文本
function computeMerged(): string {
  const lines: string[] = []
  const state = diffLines.value
  for (let i = 0; i < state.length; i++) {
    const line = state[i]
    if (line.type === 'equal') {
      lines.push(line.content)
    } else if (line.type === 'add') {
      if (isOn(i)) lines.push(line.content)
    } else if (line.type === 'remove') {
      if (isOn(i)) {
        // 真的删了：不推入
      } else {
        // 撤销删除：保留原行
        lines.push(line.content)
      }
    }
  }
  return lines.join('\n')
}

function handleAccept() {
  emit('accept', computeMerged())
}

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
.diff-stat--modify { color: var(--color-warning, #eab308); font-family: var(--font-sans); }
.diff-stat--remove { color: var(--color-danger, #ef4444); }


.diff-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: var(--font-sans);
}

.diff-line {
  display: flex;
  min-height: 22px;
  padding: 0 4px;
}

.diff-line--add { background: var(--color-success-bg); }
.diff-line--remove { background: var(--color-danger-bg); }
.diff-line--equal { background: transparent; }

.diff-toggle {
  width: 20px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.6;
  transition: opacity 0.1s;
}
.diff-toggle:hover { opacity: 1; }
.diff-line--add:hover .diff-toggle,
.diff-line--remove:hover .diff-toggle { opacity: 1; background: var(--color-bg-surface-hover); border-radius: 3px; }

.diff-content--off { opacity: 0.3; text-decoration: line-through; }

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
  color: var(--color-text-primary);
}

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
  background: var(--color-success-bg);
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
/* 紧凑模式：窄面板里去掉行号槽、收紧间距 */
.diff-view--compact { font-size: 11px; }
.diff-view--compact .diff-line { min-height: 20px; padding: 0 2px; }
.diff-view--compact .diff-toggle { width: 16px; }
.diff-view--compact .diff-footer { padding: 4px 8px; }
.diff-hint {
  padding: 4px 12px;
  font-size: 10px;
  color: var(--color-text-muted);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}
</style>
