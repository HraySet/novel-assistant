import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/files', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  listDir: vi.fn(async () => []),
  createDir: vi.fn(async () => undefined),
  deleteFile: vi.fn(async () => undefined),
  writeFileTail: vi.fn(async () => undefined),
  readFileTail: vi.fn(async () => ''),
  getProjectIndex: vi.fn(async () => []),
  saveProjectIndex: vi.fn(async () => undefined),
  getAiConfig: vi.fn(async () => null),
  saveAiConfig: vi.fn(async () => undefined),
  getApiKey: vi.fn(async () => null),
  setApiKey: vi.fn(async () => undefined),
}))

vi.mock('./useAiStream', () => ({
  streamChat: vi.fn(),
  AiRequestError: class AiRequestError extends Error {},
}))

import { streamChat } from './useAiStream'
import { useAiChat } from './useAiChat'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { useFileStore } from '../stores/file'

const ROOT = '/p'
const FILE = `${ROOT}/第1章.md`

function setup() {
  setActivePinia(createPinia())
  const settings = useSettingsStore()
  settings.aiApiKey = 'sk-test' // 绕过「未配置 Key」的提前返回
  const chat = useChatStore()
  chat.loadConversations(ROOT)
  chat.streaming = false
  const file = useFileStore()
  file.setProjectRoot(ROOT)
  file.setOpenFile({ path: FILE, name: '第1章.md', content: '他把长剑插回鞘中。', isDirty: false })

  const ai = useAiChat({
    projectRoot: () => ROOT,
    activeFile: () => ({ path: FILE, name: '第1章.md' }),
    insert: () => true,
  })
  return { chat, ai }
}

function lastAssistant(chat: ReturnType<typeof useChatStore>) {
  const conv = chat.activeConversation()
  const msgs = conv?.messages ?? []
  return msgs[msgs.length - 1]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('send：失败与中止不能留下可「应用」的 Diff', () => {
  it('请求失败时清掉原文对比（否则「应用修改」会用错误提示覆盖正文）', async () => {
    vi.mocked(streamChat).mockRejectedValueOnce(new Error('boom'))
    const { chat, ai } = setup()

    await ai.send({ text: '润色一下', display: '[润色]', withOriginal: true })

    const last = lastAssistant(chat)
    expect(last.content).toContain('⚠️')
    // 关键：没有 originalContent，ChatMessage 就不会渲染 DiffView，
    // 用户也就没有「应用修改」的入口
    expect(last.originalContent).toBeUndefined()
    expect(last.targetRange).toBeUndefined()
  })

  it('错误信息与原文同时存在时，不会把错误当成 AI 的改写', async () => {
    vi.mocked(streamChat).mockRejectedValueOnce(new Error('boom'))
    const { chat, ai } = setup()

    await ai.send({
      text: '润色选中',
      display: '[润色·选中 9 字]',
      withOriginal: true,
      selection: { path: FILE, from: 0, to: 9, text: '他把长剑插回鞘中。' },
    })

    const last = lastAssistant(chat)
    expect(last.content).toContain('⚠️')
    expect(last.originalContent).toBeUndefined()
    expect(last.targetRange).toBeUndefined()
  })

  it('一个字都没收到就中止：同样不保留对比', async () => {
    vi.mocked(streamChat).mockResolvedValueOnce({ text: '', aborted: true, usage: null })
    const { chat, ai } = setup()

    await ai.send({ text: '润色一下', display: '[润色]', withOriginal: true })

    const last = lastAssistant(chat)
    expect(last.content).toContain('已停止')
    expect(last.originalContent).toBeUndefined()
  })

  it('中途停止但已有内容：保留对比（部分结果仍可采纳）', async () => {
    vi.mocked(streamChat).mockResolvedValueOnce({ text: '他缓缓将长剑收入鞘中。', aborted: true, usage: null })
    const { chat, ai } = setup()

    await ai.send({ text: '润色一下', display: '[润色]', withOriginal: true })

    const last = lastAssistant(chat)
    expect(last.content).toContain('他缓缓将长剑收入鞘中。')
    expect(last.originalContent).toBe('他把长剑插回鞘中。')
  })
})
