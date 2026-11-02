import { describe, expect, it } from 'vitest'
import {
  describeDailyUsage,
  emptyDaily,
  formatTokens,
  mergeDailyUsage,
  todayKey,
  type DailyUsage,
} from '../usage'

const D = (date: string, calls = 0, input = 0, output = 0, missing = 0): DailyUsage => ({
  date, calls, input, output, missing,
})

describe('todayKey', () => {
  it('本地日期 YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 10, 2, 8, 0))).toBe('2026-11-02')
    expect(todayKey(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09')
  })
})

describe('mergeDailyUsage', () => {
  it('正常累加', () => {
    let d: DailyUsage | null = null
    d = mergeDailyUsage(d, { input: 100, output: 50 }, '2026-11-02')
    d = mergeDailyUsage(d, { input: 30, output: 20 }, '2026-11-02')
    expect(d).toEqual(D('2026-11-02', 2, 130, 70, 0))
  })

  it('跨天先归零再累加', () => {
    let d = D('2026-11-01', 5, 1000, 500, 0)
    d = mergeDailyUsage(d, { input: 10, output: 5 }, '2026-11-02')
    expect(d).toEqual(D('2026-11-02', 1, 10, 5, 0))
  })

  it('服务商未返回 usage：照记次数，不编造 token', () => {
    let d = mergeDailyUsage(null, null, '2026-11-02')
    d = mergeDailyUsage(d, { input: 0, output: 0 }, '2026-11-02') // 全零 usage 同样视为未返回
    expect(d).toEqual(D('2026-11-02', 2, 0, 0, 2))
  })

  it('部分调用有 usage 时 missing 单独计数', () => {
    let d = mergeDailyUsage(null, { input: 100, output: 50 }, '2026-11-02')
    d = mergeDailyUsage(d, null, '2026-11-02')
    expect(d).toEqual(D('2026-11-02', 2, 100, 50, 1))
  })
})

describe('formatTokens', () => {
  it('0 / 百位 / 千位 / 百万位', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(800)).toBe('800')
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(18000)).toBe('18k')
    expect(formatTokens(1234567)).toBe('1.2M')
  })
})

describe('describeDailyUsage', () => {
  it('无调用', () => {
    expect(describeDailyUsage(emptyDaily('2026-11-02'))).toBe('今天还没有调用 AI')
  })

  it('全部未返回用量时如实说明', () => {
    expect(describeDailyUsage(D('2026-11-02', 3, 0, 0, 3))).toBe('今天 3 次调用 · 服务商未返回用量')
  })

  it('正常描述，部分缺失时附注', () => {
    expect(describeDailyUsage(D('2026-11-02', 2, 1000, 500))).toBe(
      '今天 2 次调用 · 共 1.5k tokens（输入 1.0k / 输出 500）',
    )
    expect(describeDailyUsage(D('2026-11-02', 2, 1000, 500, 1))).toBe(
      '今天 2 次调用 · 共 1.5k tokens（输入 1.0k / 输出 500）（1 次未返回用量）',
    )
  })
})
