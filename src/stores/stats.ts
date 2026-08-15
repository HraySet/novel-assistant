import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed, watch } from 'vue'
import * as api from '../api/files'
import { useDetectionStore } from './detection'

export interface DailyRecord {
  date: string
  wordCount: number
  chaptersEdited: string[]
}

export interface WritingSession {
  startTime: number
  elapsedMs: number
  isRunning: boolean
}

interface StatsData {
  records: DailyRecord[]
  snapshots: Record<string, number>
  goal: number
  todaySessionMs: number
  sessionDate: string
}

const STATS_DIR = '.stats'
const STATS_FILE = 'stats.json'

function todayString(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const useStatsStore = defineStore('stats', () => {
  const dailyRecords = ref<DailyRecord[]>([])
  const chapterSnapshots = ref<Record<string, number>>({})
  const dailyGoal = ref(4000)
  const projectRoot = ref('')
  const loaded = ref(false)
  const todaySessionMs = ref(0)
  const sessionDate = ref(todayString())

  const session = ref<WritingSession>({ startTime: 0, elapsedMs: 0, isRunning: false })
  let sessionTimer: ReturnType<typeof setInterval> | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  // 仅驱动 sessionElapsed 每秒刷新，避免重建 session 对象触发大范围重渲染
  const _tick = ref(0)

  // ── 路径 ──
  function statsPath(): string {
    const sep = projectRoot.value.includes('\\') ? '\\' : '/'
    return `${projectRoot.value}${sep}${STATS_DIR}${sep}${STATS_FILE}`
  }

  // ── 持久化 ──
  async function persist() {
    if (!projectRoot.value) return
    const data: StatsData = {
      records: dailyRecords.value,
      snapshots: chapterSnapshots.value,
      goal: dailyGoal.value,
      todaySessionMs: todaySessionMs.value,
      sessionDate: sessionDate.value,
    }
    try {
      await api.writeFile(statsPath(), JSON.stringify(data, null, 2))
    } catch (e) {
      console.error('保存写作统计失败:', e)
    }
  }

  function schedulePersist() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; persist() }, 1000)
  }

  function flushPersist() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist() }
  }

  watch([dailyRecords, chapterSnapshots, dailyGoal], () => {
    if (loaded.value) schedulePersist()
  }, { deep: true })

  // ── 加载 ──
  function resetLocal() {
    dailyRecords.value = []
    chapterSnapshots.value = {}
    dailyGoal.value = 4000
    todaySessionMs.value = 0
    sessionDate.value = todayString()
    loaded.value = false
  }

  async function load() {
    if (!projectRoot.value) { resetLocal(); return }
    try {
      const raw = await api.readFile(statsPath())
      const data = JSON.parse(raw) as Partial<StatsData>
      dailyRecords.value = Array.isArray(data.records) ? data.records : []
      chapterSnapshots.value = data.snapshots && typeof data.snapshots === 'object' ? data.snapshots : {}
      dailyGoal.value = typeof data.goal === 'number' ? data.goal : 4000
      // 今日写作时长：跨天归零
      if (data.sessionDate === todayString()) {
        todaySessionMs.value = typeof data.todaySessionMs === 'number' ? data.todaySessionMs : 0
      } else {
        todaySessionMs.value = 0
        sessionDate.value = todayString()
      }
    } catch {
      resetLocal()
    }
    loaded.value = true
  }

  /** 打开/切换项目时调用：先落盘旧项目数据，再加载新项目 */
  async function init(root: string) {
    if (!root) { resetSession(); flushPersist(); resetLocal(); return }
    if (root === projectRoot.value && loaded.value) return
    resetSession()
    flushPersist()
    projectRoot.value = root
    await load()
  }

  // ── 计算属性 ──
  const todayRecord = computed(() => {
    const today = todayString()
    return dailyRecords.value.find(r => r.date === today) ?? null
  })

  const todayWords = computed(() => todayRecord.value?.wordCount ?? 0)

  const todayGoalPercent = computed(() => {
    if (dailyGoal.value <= 0) return 0
    return Math.min(Math.round((todayWords.value / dailyGoal.value) * 100), 100)
  })

  const todayGoalMet = computed(() => todayWords.value >= dailyGoal.value)

  const streakDays = computed(() => {
    let streak = 0
    const sorted = [...dailyRecords.value].sort((a, b) => b.date.localeCompare(a.date))
    for (let i = 0; i < sorted.length; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const es = `${d.getFullYear()}-${m}-${day}`
      if (sorted[i].date === es && sorted[i].wordCount > 0) streak++
      else break
    }
    return streak
  })

  const calendarData = computed(() => {
    const days: { date: string; count: number; dayOfWeek: number }[] = []
    const now = new Date()
    for (let i = 83; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const ds = `${d.getFullYear()}-${m}-${day}`
      const record = dailyRecords.value.find(r => r.date === ds)
      days.push({ date: ds, count: record?.wordCount ?? 0, dayOfWeek: d.getDay() })
    }
    return days
  })

  const sessionElapsed = computed(() => {
    void _tick.value
    if (!session.value.isRunning) return session.value.elapsedMs
    return session.value.elapsedMs + (Date.now() - session.value.startTime)
  })

  const sessionFormatted = computed(() => {
    void _tick.value
    let ms = todaySessionMs.value
    if (session.value.isRunning) ms += Date.now() - session.value.startTime
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) return `${hours}小时${minutes}分`
    return `${minutes}分钟`
  })

  const totalWordsAllTime = computed(() =>
    dailyRecords.value.reduce((sum, r) => sum + r.wordCount, 0)
  )

  // ── 字数记录 ──
  /** 打开文件时记录起始快照（不产生增量），后续保存据此计算差值 */
  function syncChapterSnapshot(chapterId: string, wordCount: number) {
    if (!(chapterId in chapterSnapshots.value)) chapterSnapshots.value[chapterId] = wordCount
  }

  /** 保存文件时调用：对比快照，只把「新增」字数计入当日（删改不减计数） */
  function recordChapterEdit(chapterId: string, newWordCount: number) {
    if (!(chapterId in chapterSnapshots.value)) {
      chapterSnapshots.value[chapterId] = newWordCount
      return
    }
    const prev = chapterSnapshots.value[chapterId]
    const delta = newWordCount - prev
    chapterSnapshots.value[chapterId] = newWordCount
    if (delta > 0) {
      const today = todayString()
      const existing = dailyRecords.value.find(r => r.date === today)
      if (existing) {
        existing.wordCount += delta
        if (!existing.chaptersEdited.includes(chapterId)) existing.chaptersEdited.push(chapterId)
      } else {
        dailyRecords.value.push({ date: today, wordCount: delta, chaptersEdited: [chapterId] })
      }
      // 一致性检测钩子：累计新增字数，达到阈值后自动触发一次 AI 检测
      useDetectionStore().onWordsAdded(delta)
    }
  }

  /** 重命名/移动章节后迁移快照 key，避免旧路径孤儿数据累积 */
  function remapChapterSnapshots(mapper: (p: string) => string) {
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(chapterSnapshots.value)) {
      next[mapper(k)] = v
    }
    chapterSnapshots.value = next
    schedulePersist()
  }

  function setDailyGoal(goal: number) { dailyGoal.value = goal }

  // ── 会话计时 ──
  function startSession() {
    if (session.value.isRunning) return
    session.value.startTime = Date.now()
    session.value.isRunning = true
    sessionTimer = setInterval(() => { _tick.value++ }, 1000)
  }

  function pauseSession() {
    if (!session.value.isRunning) return
    const delta = Date.now() - session.value.startTime
    session.value.elapsedMs += delta
    todaySessionMs.value += delta
    session.value.isRunning = false
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null }
    schedulePersist()
  }

  function resetSession() {
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null }
    if (session.value.isRunning) {
      todaySessionMs.value += Date.now() - session.value.startTime
    }
    session.value = { startTime: 0, elapsedMs: 0, isRunning: false }
  }

  function toggleSession() {
    if (session.value.isRunning) pauseSession()
    else startSession()
  }

  return {
    dailyRecords,
    dailyGoal,
    projectRoot,
    loaded,
    todayRecord,
    todayWords,
    todaySessionMs,
    todayGoalPercent,
    todayGoalMet,
    streakDays,
    calendarData,
    session,
    sessionElapsed,
    sessionFormatted,
    totalWordsAllTime,
    init,
    load,
    syncChapterSnapshot,
    remapChapterSnapshots,
    recordChapterEdit,
    setDailyGoal,
    startSession,
    pauseSession,
    resetSession,
    toggleSession,
    flushPersist,
  }
})

// 开发模式 HMR：store 改动时热替换定义，避免新旧实例混用导致运行时崩溃
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useStatsStore, import.meta.hot))
}
