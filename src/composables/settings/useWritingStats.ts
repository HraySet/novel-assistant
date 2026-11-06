/**
 * 写作分析指标：全书总字数、今日速度、日均字数、累计天数、近 7 天柱状图。
 *
 * 从 SettingsContent.vue 下沉。核心是底层的纯函数（computeTotalWords /
 * computeTodaySpeed / computeActiveDays / computeAvgDaily / computeLast7 /
 * barHeight / last7Max），可直接独立测试；`useWritingStats` 只是把它们包成
 * computed 供组件模板消费。
 */
import { computed, type Ref } from 'vue'
import type { DailyRecord } from '../../stores/stats'
import type { FileNode } from '../../types/file'

/** 全书总字数：遍历文件树求和（不含目录） */
export function computeTotalWords(tree: FileNode[]): number {
  let sum = 0
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) walk(n.children)
      } else {
        sum += n.wordCount ?? 0
      }
    }
  }
  walk(tree)
  return sum
}

/** 今日速度（字/小时）：无会话或零字数返回 0 */
export function computeTodaySpeed(todayWords: number, todaySessionMs: number): number {
  const hours = todaySessionMs / 3600000
  if (hours <= 0 || todayWords === 0) return 0
  return Math.round(todayWords / hours)
}

/** 累计写作天数：wordCount > 0 的记录条数 */
export function computeActiveDays(records: DailyRecord[]): number {
  return records.filter((r) => r.wordCount > 0).length
}

/** 日均字数：有字记录的平均，无记录返回 0 */
export function computeAvgDaily(records: DailyRecord[]): number {
  const rs = records.filter((r) => r.wordCount > 0)
  return rs.length ? Math.round(rs.reduce((s, r) => s + r.wordCount, 0) / rs.length) : 0
}

export interface Last7Day {
  date: string
  label: string
  count: number
}

/** 近 7 天（含今天，倒序）：`now` 可注入以便测试确定日期 */
export function computeLast7(records: DailyRecord[], now: Date = new Date()): Last7Day[] {
  const out: Last7Day[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const rec = records.find((r) => r.date === ds)
    out.push({ date: ds, label: `${d.getMonth() + 1}/${d.getDate()}`, count: rec?.wordCount ?? 0 })
  }
  return out
}

/** 近 7 天最大值（下限 100，避免柱子全部贴地） */
export function last7Max(last7: Last7Day[]): number {
  return Math.max(100, ...last7.map((d) => d.count))
}

/** 柱状图高度：0 → 2px，其余按占最大值的比例（下限 8px，封顶 64px） */
export function barHeight(count: number, max: number): string {
  if (count <= 0) return '2px'
  return `${Math.max(8, Math.round((count / max) * 64))}px`
}

/** 数据源：stats store 与 file store 的响应式字段 */
export interface WritingStatsSource {
  dailyRecords: Ref<DailyRecord[]>
  todaySessionMs: Ref<number>
  todayWords: Ref<number>
  tree: Ref<FileNode[]>
}

/** 把纯函数包成 computed，供模板消费 */
export function useWritingStats(source: WritingStatsSource) {
  const totalWords = computed(() => computeTotalWords(source.tree.value))
  const todaySpeed = computed(() =>
    computeTodaySpeed(source.todayWords.value, source.todaySessionMs.value),
  )
  const activeDays = computed(() => computeActiveDays(source.dailyRecords.value))
  const avgDaily = computed(() => computeAvgDaily(source.dailyRecords.value))
  const last7 = computed(() => computeLast7(source.dailyRecords.value))
  const last7MaxValue = computed(() => last7Max(last7.value))
  /** 绑定近 7 天最大值的单参版本，供模板 `barHeight(d.count)` 直接调用 */
  const barHeightForCount = (count: number) => barHeight(count, last7MaxValue.value)

  return {
    totalWords,
    todaySpeed,
    activeDays,
    avgDaily,
    last7,
    last7MaxValue,
    barHeight: barHeightForCount,
  }
}
