import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCharacterExtract } from '../useCharacterExtract'

function makeDeps(overrides: Partial<Parameters<typeof useCharacterExtract>[0]> = {}) {
  return {
    getLiveContent: () => '正文内容'.repeat(100), // 400 字
    existingNames: () => ['张三'],
    stream: vi.fn(async () => ({ text: '["张三","李四"]', usage: { input: 10, output: 5 } })),
    recordUsage: vi.fn(),
    hasApiKey: () => true,
    ...overrides,
  }
}

describe('useCharacterExtract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('成功抽取并过滤已存在角色名', async () => {
    const deps = makeDeps()
    const { runExtract, extractCandidates, extractNote } = useCharacterExtract(deps)
    const ok = await runExtract()
    expect(ok).toBe(true)
    expect(extractCandidates.value).toEqual(['李四']) // 「张三」已存在被过滤
    expect(extractNote.value).toBe('')
    expect(deps.recordUsage).toHaveBeenCalledWith({ input: 10, output: 5 })
  })

  it('无 API Key 时提示且不调用 stream', async () => {
    const deps = makeDeps({ hasApiKey: () => false })
    const { runExtract, extractNote } = useCharacterExtract(deps)
    const ok = await runExtract()
    expect(ok).toBe(false)
    expect(extractNote.value).toBe('需先在设置中配置 API Key')
    expect(deps.stream).not.toHaveBeenCalled()
  })

  it('未发现新名字时提示', async () => {
    const deps = makeDeps({ stream: vi.fn(async () => ({ text: '["张三"]', usage: null })) })
    const { runExtract, extractCandidates, extractNote } = useCharacterExtract(deps)
    const ok = await runExtract()
    expect(ok).toBe(false)
    expect(extractCandidates.value).toEqual([])
    expect(extractNote.value).toBe('未发现新角色名')
  })

  it('正文不足 200 字时不调用 stream', async () => {
    const deps = makeDeps({ getLiveContent: () => '短' })
    const { runExtract } = useCharacterExtract(deps)
    const ok = await runExtract()
    expect(ok).toBe(false)
    expect(deps.stream).not.toHaveBeenCalled()
  })

  it('stream 抛错时提示抽取失败', async () => {
    const deps = makeDeps({ stream: vi.fn(async () => { throw new Error('boom') }) })
    const { runExtract, extractNote } = useCharacterExtract(deps)
    const ok = await runExtract()
    expect(ok).toBe(false)
    expect(extractNote.value).toBe('抽取失败，请重试')
  })

  it('clearNote 4 秒后清空提示', () => {
    const deps = makeDeps()
    const { extractNote, clearNote } = useCharacterExtract(deps)
    extractNote.value = '临时提示'
    clearNote()
    expect(extractNote.value).toBe('临时提示')
    vi.advanceTimersByTime(4000)
    expect(extractNote.value).toBe('')
  })
})
