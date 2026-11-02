import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUsageStore } from './usage'
import { readJson, writeJson } from '../core/storage'

vi.mock('../core/storage', () => ({
  readJson: vi.fn(() => null),
  writeJson: vi.fn(),
}))

// 同一测试文件内反复建实例，storage mock 需要可编程
const readJsonMock = vi.mocked(readJson)
const writeJsonMock = vi.mocked(writeJson)

beforeEach(() => {
  vi.clearAllMocks()
  readJsonMock.mockReturnValue(null)
})

describe('usage store：当日账本', () => {
  it('record 累计调用与 token', () => {
    setActivePinia(createPinia())
    const store = useUsageStore()

    store.record({ input: 100, output: 50 })
    store.record({ input: 30, output: 20 })

    expect(store.daily.calls).toBe(2)
    expect(store.daily.input).toBe(130)
    expect(store.daily.output).toBe(70)
    expect(writeJson).toHaveBeenCalledTimes(2)
  })

  it('usage 为 null 时只记次数与 missing，不编造 token', () => {
    setActivePinia(createPinia())
    const store = useUsageStore()

    store.record(null)

    expect(store.daily).toEqual({ date: store.daily.date, calls: 1, input: 0, output: 0, missing: 1 })
  })

  it('重启后同一天恢复（从 localStorage 读回）', () => {
    // 第一次会话：写了两笔
    readJsonMock.mockReturnValue(null)
    setActivePinia(createPinia())
    const first = useUsageStore()
    first.record({ input: 100, output: 50 })
    // writeJson(key, value)：最后一个入参的第 2 位才是落盘内容
    const saved = writeJsonMock.mock.calls.at(-1)?.[1]

    // 第二次会话（模拟重启）：localStorage 里是同一天的数据
    readJsonMock.mockReturnValue(saved)
    setActivePinia(createPinia())
    const second = useUsageStore()

    expect(second.daily.calls).toBe(1)
    expect(second.daily.input).toBe(100)
  })

  it('重启后已是第二天：旧数据作废，从零开始', () => {
    readJsonMock.mockReturnValue({ date: '2020-01-01', calls: 99, input: 999, output: 999, missing: 0 })
    setActivePinia(createPinia())
    const store = useUsageStore()

    expect(store.daily.calls).toBe(0)
    expect(store.daily.input).toBe(0)
  })

  it('summary 文案与 daily 一致', () => {
    setActivePinia(createPinia())
    const store = useUsageStore()
    store.record({ input: 1000, output: 500 })

    expect(store.summary).toContain('1 次调用')
    expect(store.summary).toContain('1.5k')
  })
})
