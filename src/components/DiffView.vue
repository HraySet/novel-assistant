<template>
  <div class="diff-view" :class="{ 'diff-view--compact': compact, 'diff-view--line': granularity === 'line', 'diff-view--readonly': !editable }">
    <!-- 头栏 -->
    <div class="diff-header">
      <span v-if="title" class="diff-title">{{ title }}</span>
      <span v-else class="diff-title" />
      <span class="diff-stats">
        <span class="diff-stat diff-stat--count">{{ hunkCount }} 处修改</span>
        <span v-if="addedChars" class="diff-stat diff-stat--add">+{{ addedChars }}</span>
        <span v-if="removedChars" class="diff-stat diff-stat--remove">−{{ removedChars }}</span>
      </span>
    </div>

    <!-- Diff 内容 -->
    <div v-if="hunkCount === 0" class="diff-empty">
      <CircleCheck :size="20" class="diff-empty-icon" />
      AI 未做出任何修改
    </div>
    <div v-else class="diff-body">
      <template v-for="item in viewItems" :key="item.key">
        <!-- 未改动区域折叠 -->
        <div v-if="item.kind === 'fold'" class="diff-fold" @click="expandFold(item.from)">
          <span class="diff-fold-dots">⋯</span>
          <span>展开 {{ item.count }} 行未改动内容</span>
        </div>

        <!-- 正文行 -->
        <div
          v-else
          class="diff-line"
          :class="[
            'diff-line--' + lineKind(item.row),
            {
              'diff-line--hunk': item.row.hunkId >= 0,
              'diff-line--hunk-start': item.row.hunkStart,
              'diff-line--off': item.row.hunkId >= 0 && isHunkOff(item.row.hunkId),
            },
          ]"
        >
          <!-- 只读场景（历史版本对比）不渲染勾选槽，省下 20px 宽度 -->
          <template v-if="editable">
            <span
              v-if="item.row.changed"
              class="diff-toggle"
              :title="isHunkOff(item.row.hunkId) ? '恢复这一处修改' : '不要这一处修改'"
              @click.stop="toggleHunk(item.row.hunkId)"
            >
              <!-- 只在块的首行画勾选框，后续行画连接线：一处修改只有一个勾选框 -->
              <Check
                v-if="item.row.hunkStart"
                :size="12"
                class="diff-toggle-check"
                :class="{ 'diff-toggle-check--off': isHunkOff(item.row.hunkId) }"
              />
              <span v-else class="diff-toggle-link" />
            </span>
            <span v-else class="diff-toggle" />
          </template>

          <template v-if="granularity === 'line'">
            <span class="diff-gutter diff-gutter--old">{{ item.row.oldLine ?? '' }}</span>
            <span class="diff-gutter diff-gutter--new">{{ item.row.newLine ?? '' }}</span>
            <span class="diff-marker">{{ marker(item.row.segs[0]?.type ?? 'equal') }}</span>
          </template>

          <!-- 行内片段：散文连续阅读，变化处才上色 -->
          <span class="diff-content">
            <span
              v-for="(seg, si) in item.row.segs"
              :key="si"
              class="diff-seg"
              :class="[
                'diff-seg--' + seg.type,
                { 'diff-seg--off': seg.type !== 'equal' && isSegOff(seg.index) },
              ]"
            >{{ seg.content }}</span>
          </span>
        </div>
      </template>
    </div>

    <!-- 操作栏：只读场景（历史版本对比）不渲染，由宿主提供自己的按钮 -->
    <div v-if="editable" class="diff-footer">
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
import { X, Check, CircleCheck } from 'lucide-vue-next'
import {
  computeDiff,
  mergeDiffLines,
  detectEol,
  groupHunks,
  toRows,
  buildDisplayItems,
  type DiffLine,
  type DiffRow,
} from '../composables/useDiff'

const props = defineProps<{
  oldText: string
  newText: string
  title?: string
  editable?: boolean
  /** 紧凑模式：隐藏行号槽、缩小字号（用于窄的侧边面板） */
  compact?: boolean
  /** diff 粒度：'word' 按词/字（散文推荐），'line' 按行（代码） */
  granularity?: 'line' | 'word'
  /** 未改动区域保留的上下文行数（超出即折叠） */
  contextLines?: number
}>()

const emit = defineEmits<{
  accept: [finalText: string]
  reject: []
}>()

const granularity = computed(() => props.granularity ?? 'word')
// diff 只计算一次（文本变化时重算），统计与视图全部从这一份结果派生，
// 避免模板里多个 computed 各自重跑一遍 O(m×n) 的 LCS
const diffLines = ref<DiffLine[]>([])

/**
 * 勾选状态仍以**片段**为键（合并回写按片段判断），
 * 但 UI 只以「修改块」为单位操作——块内片段同进同退。
 */
const toggledOff = ref(new Set<number>())
const expandedFolds = ref(new Set<number>())

const rows = computed(() => toRows(diffLines.value, granularity.value))

const hunks = computed(() =>
  groupHunks(diffLines.value, {
    // 词粒度容忍一个短词/标点的间隔：整句润色应是一处修改，而不是十几处
    mergeGap: granularity.value === 'word' ? 6 : 0,
  }),
)

const hunkCount = computed(() => hunks.value.length)

const hunkOfIndex = computed(() => {
  const map = new Map<number, number>()
  hunks.value.forEach((h, hi) => {
    for (const i of h.removeIdx) map.set(i, hi)
    for (const i of h.addIdx) map.set(i, hi)
  })
  return map
})

const contextLines = computed(() => props.contextLines ?? (props.compact ? 1 : 2))

interface ViewRow extends DiffRow {
  /** 所属修改块；-1 表示未改动行 */
  hunkId: number
  /** 是否为所属修改块的首行（用于块间视觉分隔） */
  hunkStart: boolean
}

type ViewItem =
  | { kind: 'row'; key: string; row: ViewRow }
  | { kind: 'fold'; key: string; from: number; count: number }

function toViewRow(row: DiffRow, seenHunkStart: Set<number>): ViewRow {
  let hunkId = -1
  for (const s of row.segs) {
    const h = hunkOfIndex.value.get(s.index)
    if (h !== undefined) {
      hunkId = h
      break
    }
  }
  let hunkStart = false
  if (hunkId >= 0 && !seenHunkStart.has(hunkId)) {
    seenHunkStart.add(hunkId)
    hunkStart = true
  }
  return { ...row, hunkId, hunkStart }
}

const viewItems = computed<ViewItem[]>(() => {
  const out: ViewItem[] = []
  const seenHunkStart = new Set<number>()
  const pushRow = (rowIndex: number) => {
    out.push({ kind: 'row', key: 'r' + rowIndex, row: toViewRow(rows.value[rowIndex], seenHunkStart) })
  }
  for (const item of buildDisplayItems(rows.value, contextLines.value)) {
    if (item.kind === 'row') {
      pushRow(item.rowIndex)
      continue
    }
    if (expandedFolds.value.has(item.from)) {
      for (let k = item.from; k < item.from + item.count; k++) pushRow(k)
    } else {
      out.push({ kind: 'fold', key: 'f' + item.from, from: item.from, count: item.count })
    }
  }
  return out
})

function expandFold(from: number) {
  const next = new Set(expandedFolds.value)
  next.add(from)
  expandedFolds.value = next
}

// oldText / newText 变化时重算 diff，并重置勾选与折叠状态
watch(
  () => [props.oldText, props.newText],
  () => {
    diffLines.value = computeDiff(props.oldText, props.newText, granularity.value)
    toggledOff.value = new Set()
    expandedFolds.value = new Set()
  },
  { immediate: true },
)

// ── 勾选（以修改块为单位）──

function isSegOff(index: number): boolean {
  return toggledOff.value.has(index)
}

/** 整块是否被取消（块内片段全部关闭）。预先算成一次遍历，避免模板里逐行重复建数组 */
const offHunks = computed(() => {
  const set = new Set<number>()
  hunks.value.forEach((h, hi) => {
    const idxs = [...h.removeIdx, ...h.addIdx]
    if (idxs.length > 0 && idxs.every((i) => toggledOff.value.has(i))) set.add(hi)
  })
  return set
})

function isHunkOff(hunkId: number): boolean {
  return offHunks.value.has(hunkId)
}

/** 整块切换：块内所有片段同进同退，杜绝「只取消替换的一半」写出病句 */
function toggleHunk(hunkId: number) {
  const h = hunks.value[hunkId]
  if (!h) return
  const turnOff = !isHunkOff(hunkId)
  const next = new Set(toggledOff.value)
  for (const i of [...h.removeIdx, ...h.addIdx]) {
    if (turnOff) next.add(i)
    else next.delete(i)
  }
  toggledOff.value = next
}

const allToggledOff = computed(() =>
  hunks.value.length > 0 && offHunks.value.size === hunks.value.length,
)

// ── 统计（字符数比片段数更有意义）──

function countChars(type: DiffLine['type']): number {
  let n = 0
  for (const l of diffLines.value) {
    if (l.type === type) n += l.content.replace(/\n/g, '').length
  }
  return n
}
const addedChars = computed(() => countChars('add'))
const removedChars = computed(() => countChars('remove'))

// ── 合并与应用 ──

function computeMerged(): string {
  return mergeDiffLines(diffLines.value, (i) => toggledOff.value.has(i), {
    granularity: granularity.value,
    eol: detectEol(props.oldText),
  })
}

function handleAccept() {
  // 全部取消勾选 = 与原文一致：直接收起，不写盘、不记统计
  if (allToggledOff.value) {
    emit('reject')
    return
  }
  emit('accept', computeMerged())
}

function lineKind(row: DiffRow): DiffLine['type'] {
  for (const s of row.segs) if (s.type !== 'equal') return s.type
  return 'equal'
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
.diff-stat--count { color: var(--color-text-secondary); font-family: var(--font-sans); font-weight: 500; }
.diff-stat--add { color: var(--color-success, #22c55e); }
.diff-stat--remove { color: var(--color-danger, #ef4444); }

.diff-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.diff-empty-icon { color: var(--color-success); opacity: 0.5; }

.diff-line {
  display: flex;
  /* 顶对齐：一个片段可能长到自动换行成多行，勾选框要贴住第一行而不是浮在中间 */
  align-items: flex-start;
  min-height: 22px;
  padding: 0 4px;
  transition: background 0.15s ease;
}

/* 同一处修改的连续行用左侧色条连成一体，块与块之间留出间隙 */
.diff-line--hunk { box-shadow: inset 2px 0 0 var(--color-accent-border); }
.diff-line--hunk-start { margin-top: 5px; }

.diff-line--off { background: transparent; }

.diff-toggle {
  width: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  align-self: stretch;
  padding-top: 3px;
  cursor: pointer; flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.6;
  transition: opacity 0.1s;
}
.diff-toggle:hover { opacity: 1; }
.diff-line--hunk:hover .diff-toggle {
  opacity: 1; background: var(--color-bg-surface-hover); border-radius: 3px;
}

/* 勾选图标淡出（v-if 硬消失 → 透明度过渡） */
.diff-toggle-check { flex-shrink: 0; transition: opacity 0.1s ease; }
.diff-toggle-check--off { opacity: 0; }
/* 同一修改块内的续行：画一条细连接线，表示它们共用一个勾选框 */
.diff-toggle-link {
  width: 1px;
  flex: 1;
  min-height: 12px;
  background: var(--color-accent-border);
  opacity: 0.55;
}

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
  word-break: break-word;
  color: var(--color-text-primary);
}

/* 只读场景没有勾选槽，补回左内边距，否则文字贴着色条 */
.diff-view--readonly .diff-line { padding-left: 12px; }

/* ── 行内片段（词粒度）：只在变化处上色，正文连续可读 ── */
.diff-seg--add {
  background: var(--color-success-bg);
  border-radius: 2px;
}
.diff-seg--remove {
  background: var(--color-danger-bg);
  text-decoration: line-through;
  border-radius: 2px;
  opacity: 0.85;
}
/* 取消采用的片段：整段淡出，不再强调删除线（这一处的修改不生效） */
.diff-seg--off {
  background: transparent;
  text-decoration: none;
  opacity: 0.35;
}

/* ── 行粒度：一行一个片段，铺满整行底色 ── */
.diff-view--line .diff-seg { display: block; }
.diff-view--line .diff-line--add { background: var(--color-success-bg); }
.diff-view--line .diff-line--remove { background: var(--color-danger-bg); }
.diff-view--line .diff-line--add .diff-seg--add,
.diff-view--line .diff-line--remove .diff-seg--remove { background: transparent; }

/* ── 折叠未改动区域 ── */
.diff-fold {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 26px;
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--color-text-muted);
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  user-select: none;
}
.diff-fold:hover { color: var(--color-text-secondary); background: var(--color-bg-surface-hover); }
.diff-fold-dots { letter-spacing: 2px; }

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
  color: var(--color-text-on-accent);
}
.diff-btn--reject:hover {
  background: var(--color-danger, #ef4444);
  color: var(--color-text-on-accent);
  border-color: var(--color-danger, #ef4444);
}
/* 紧凑模式：窄面板里去掉行号槽、收紧间距 */
.diff-view--compact { font-size: 11px; }
.diff-view--compact .diff-line { min-height: 20px; padding: 0 2px; }
.diff-view--compact .diff-toggle { width: 16px; }
.diff-view--compact .diff-footer { padding: 4px 8px; }
.diff-view--compact .diff-fold { padding: 2px 6px 2px 20px; }
</style>
