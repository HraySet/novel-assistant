import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/files', () => ({
  readFile: vi.fn(async () => {
    throw new Error('no stats file')
  }),
  writeFile: vi.fn(async () => undefined),
}))

import { useStatsStore } from './stats'

const PROJECT = '/p'
const CH = `${PROJECT}/第1章.md`

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('recordChapterEdit：增量口径', () => {
  it('首次记录只建立快照，不产生当日字数', async () => {
    const store = useStatsStore()
    await store.init(PROJECT)

    store.recordChapterEdit(CH, 1000)
    expect(store.todayWords).toBe(0)
  })

  it('之后只把新增字数计入当日（删改不减计数）', async () => {
    const store = useStatsStore()
    await store.init(PROJECT)

    store.recordChapterEdit(CH, 1000)
    store.recordChapterEdit(CH, 1200)
    expect(store.todayWords).toBe(200)

    // 删掉 500 字：计数不回退，但快照更新
    store.recordChapterEdit(CH, 700)
    expect(store.todayWords).toBe(200)

    // 再写 100 字：基于 700 的快照，只计 100
    store.recordChapterEdit(CH, 800)
    expect(store.todayWords).toBe(300)
  })
})

describe('跨天滚动', () => {
  it('跨过午夜后「今日时长」归零，新字数记到新的一天', async () => {
    const store = useStatsStore()
    await store.init(PROJECT)
    store.recordChapterEdit(CH, 1000)

    // 写一小时
    store.startSession()
    vi.advanceTimersByTime(3600_000)
    store.pauseSession()
    expect(store.todaySessionMs).toBe(3600_000)

    // 跨天后再保存
    vi.setSystemTime(new Date('2026-11-03T00:10:00'))
    store.recordChapterEdit(CH, 1100)

    expect(store.todaySessionMs).toBe(0)
    expect(store.todayWords).toBe(100)
    // 11-02 只建立了快照（无新增字数），不会产生当日记录
    expect(store.dailyRecords.some((r) => r.date === '2026-11-02')).toBe(false)
    expect(store.dailyRecords.some((r) => r.date === '2026-11-03' && r.wordCount === 100)).toBe(true)
  })
})

describe('连续天数', () => {
  it('以最后一条记录为准，中间断档即中断', async () => {
    const store = useStatsStore()
    await store.init(PROJECT)
    store.recordChapterEdit(CH, 100)

    // 连续两天都有产出
    vi.setSystemTime(new Date('2026-11-03T09:00:00'))
    store.recordChapterEdit(CH, 200)
    vi.setSystemTime(new Date('2026-11-04T09:00:00'))
    store.recordChapterEdit(CH, 300)

    // 11-03、11-04 连续两天有产出 → 连续 2 天（11-02 无记录，链条在此断开）
    expect(store.streakDays).toBe(2)

    // 补上 11-02 的记录后应连续 3 天
    store.dailyRecords.push({ date: '2026-11-02', wordCount: 100, chaptersEdited: [CH] })
    expect(store.streakDays).toBe(3)
  })
})
