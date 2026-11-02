import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/files', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  listDir: vi.fn(async () => []),
  createDir: vi.fn(async () => undefined),
}))

vi.mock('../composables/useAiStream', () => ({
  streamChat: vi.fn(),
  AiRequestError: class AiRequestError extends Error {},
}))

import { streamChat } from '../composables/useAiStream'
import { useDetectionStore } from './detection'
import { useSettingsStore } from './settings'

function seed() {
  setActivePinia(createPinia())
  return useDetectionStore()
}

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * 这组用例锁的是产品承诺而不是实现细节：
 * README 写「日常写作零 token」，所以**写作过程中任何计数都不能触发 AI 请求**。
 * 此前按字数阈值自动检测，用户以为在本地写，后台在出网。
 */
describe('一致性检测：只计数，不自动出网', () => {
  it('累计多少字都不会自行发起请求', async () => {
    const store = seed()
    await store.setProjectRoot('/p')

    store.noteWordsAdded(5000)
    store.noteWordsAdded(5000)
    store.noteWordsAdded(5000)

    // 等过旧的 1500ms 防抖窗口，确认没有任何延迟触发
    await new Promise((r) => setTimeout(r, 60))

    expect(store.wordsSinceCheck).toBe(15000)
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('计数只在有项目时累加', () => {
    const store = seed()
    store.noteWordsAdded(500)
    expect(store.wordsSinceCheck).toBe(0)
  })

  it('负增量被忽略（删改不减少计数）', async () => {
    const store = seed()
    await store.setProjectRoot('/p')
    store.noteWordsAdded(1000)
    store.noteWordsAdded(-300)
    expect(store.wordsSinceCheck).toBe(1000)
  })

  it('检查过一轮后计数归零（本地判断无变化也算检查过）', async () => {
    const store = seed()
    // settings store 创建时会异步加载已保存的配置，加载完成前写入的 Key 会被覆盖
    const settings = useSettingsStore()
    // settings 创建时会异步加载已保存的配置，加载完成前写入的 Key 会被覆盖
    await new Promise((r) => setTimeout(r, 10))
    settings.aiApiKey = 'sk-test'
    await store.setProjectRoot('/p')
    store.noteWordsAdded(800)
    expect(store.wordsSinceCheck).toBe(800)

    await store.runCheck()

    expect(store.wordsSinceCheck).toBe(0)
    // 项目里没有任何章节/角色/大纲，本地闸门直接拦下，不产生调用
    expect(streamChat).not.toHaveBeenCalled()
  })

})

describe('一致性检测：旧的自动开关已移除', () => {
  it('store 上不再暴露 autoEnabled / threshold / setAuto', () => {
    const store = seed() as unknown as Record<string, unknown>
    expect(store.autoEnabled).toBeUndefined()
    expect(store.threshold).toBeUndefined()
    expect(store.setAuto).toBeUndefined()
    expect(store.setThreshold).toBeUndefined()
  })
})
