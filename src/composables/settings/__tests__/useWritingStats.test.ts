import { describe, it, expect } from 'vitest'
import {
  computeTotalWords,
  computeTodaySpeed,
  computeActiveDays,
  computeAvgDaily,
  computeLast7,
  barHeight,
  last7Max,
} from '../useWritingStats'
import type { DailyRecord } from '../../../stores/stats'
import type { FileNode } from '../../../types/file'

function dir(name: string, children: FileNode[]): FileNode {
  return { name, isDir: true, children } as FileNode
}
function file(name: string, wordCount?: number): FileNode {
  return { name, isDir: false, wordCount } as FileNode
}

describe('computeTotalWords', () => {
  it('递归求和文件字数，跳过目录与无 wordCount 的文件', () => {
    const tree = [
      dir('卷1', [file('第1章.md', 1000), file('第2章.md', 500)]),
      file('楔子.md', 300),
      file('无统计.md'), // wordCount undefined
    ]
    expect(computeTotalWords(tree)).toBe(1800)
  })

  it('空树返回 0', () => {
    expect(computeTotalWords([])).toBe(0)
  })
})

describe('computeTodaySpeed', () => {
  it('字/小时 = words / (ms/3600000)', () => {
    // 1 小时写 1000 字 → 1000 字/时
    expect(computeTodaySpeed(1000, 3600000)).toBe(1000)
  })
  it('零字数或零会话时长返回 0', () => {
    expect(computeTodaySpeed(0, 3600000)).toBe(0)
    expect(computeTodaySpeed(1000, 0)).toBe(0)
  })
})

describe('computeActiveDays / computeAvgDaily', () => {
  const records: DailyRecord[] = [
    { date: '2026-11-01', wordCount: 1000, chaptersEdited: [] },
    { date: '2026-11-02', wordCount: 0, chaptersEdited: [] },
    { date: '2026-11-03', wordCount: 2000, chaptersEdited: [] },
  ]
  it('累计天数只数 wordCount>0 的记录', () => {
    expect(computeActiveDays(records)).toBe(2)
  })
  it('日均字数取有字记录平均', () => {
    expect(computeAvgDaily(records)).toBe(1500)
  })
  it('无记录返回 0', () => {
    expect(computeActiveDays([])).toBe(0)
    expect(computeAvgDaily([])).toBe(0)
  })
})

describe('computeLast7', () => {
  const now = new Date(2026, 10, 3) // 2026-11-03（本地）
  it('倒序填充近 7 天，对齐 date 键', () => {
    const records: DailyRecord[] = [
      { date: '2026-11-01', wordCount: 500, chaptersEdited: [] },
    ]
    const out = computeLast7(records, now)
    expect(out).toHaveLength(7)
    expect(out[0].date).toBe('2026-10-28') // 最旧
    expect(out[6].date).toBe('2026-11-03') // 今天
    expect(out[4].count).toBe(500) // 11-01 命中
    expect(out[6].count).toBe(0) // 今天无记录
  })
})

describe('barHeight / last7Max', () => {
  it('零字数返回固定 2px', () => {
    expect(barHeight(0, 100)).toBe('2px')
  })
  it('按最大值比例换算，下限 8px', () => {
    expect(barHeight(50, 100)).toBe('32px') // 50/100*64=32
    expect(barHeight(1, 10000)).toBe('8px') // 比例极小，压到下限
  })
  it('last7Max 下限 100', () => {
    expect(last7Max([{ date: '', label: '', count: 5 }])).toBe(100)
    expect(last7Max([{ date: '', label: '', count: 500 }])).toBe(500)
  })
})
