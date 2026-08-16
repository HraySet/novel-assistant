/**
 * AI 对话共享逻辑：全屏对话（AiChatView）与紧凑面板（AiPanel）共用。
 * 两个面板此前各自维护一份 handleApplyDiff / saveAsSummary / messageHtml /
 * 发送编排等 ~150 行重复代码，此处统一收敛。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import DOMPurify from 'dompurify'
import { useSettingsStore } from '../stores/settings'
import { useChatStore, type ChatMessage } from '../stores/chat'
import { useStatsStore } from '../stores/stats'
import { useFileStore } from '../stores/file'
import { countWords } from '../utils/countWords'
import { streamChat, AiRequestError } from './useAiStream'
import { renderMarkdown, escapeHtml } from './useMarkdown'
import { useAiContext } from './useAiContext'
import * as api from '../api/files'

export interface AiChatTarget {
  /** 当前项目根目录 */
  projectRoot: () => string | undefined
  /** 当前打开的文件（插入/摘要/对比的目标） */
  activeFile: () => { path: string; name: string } | null | undefined
  /** 把文本插入编辑器（由宿主组件转发到 MdEditor） */
  insert: (text: string) => void
  /** 流式更新/发送完成后滚动到底部（可选） */
  scrollToBottom?: () => void
  /** 把 AI 结果替换进编辑器划词选区（返回是否成功；失败则放弃应用） */
  applyToSelection?: (target: { path: string; from: number; to: number; original?: string }, text: string) => Promise<boolean> | boolean
}

export function useAiChat(target: AiChatTarget) {
  const settings = useSettingsStore()
  const chatStore = useChatStore()
  const fileStore = useFileStore()
  const statsStore = useStatsStore()
  const activeConversation = computed(() => chatStore.activeConversation())

  const loading = ref(false)
  const showKeyHint = ref(false)

  // ── 动作反馈标记（"✓ 已插入 / 已存入前情 / 已应用"） ──
  const appliedIndex = ref<number | null>(null)
  let appliedTimer: ReturnType<typeof setTimeout> | null = null
  const savedIndex = ref<number | null>(null)
  let savedTimer: ReturnType<typeof setTimeout> | null = null
  const insertedIndex = ref<number | null>(null)
  let insertedTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (appliedTimer) clearTimeout(appliedTimer)
    if (savedTimer) clearTimeout(savedTimer)
    if (insertedTimer) clearTimeout(insertedTimer)
    appliedTimer = savedTimer = insertedTimer = null
  }

  // ── 消息渲染 ──

  function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html)
  }

  /**
   * 消息 HTML：
   * - 正在流式输出的最后一条消息按纯文本渲染（每个 token 只做一次转义，
   *   避免整段 Markdown 解析 + DOMPurify 的重复开销），并附加闪烁光标；
   * - 其余消息渲染 Markdown。
   */
  function messageHtml(msg: ChatMessage, i: number): string {
    const lastIndex = (activeConversation.value?.messages.length ?? 0) - 1
    const isStreamingLast = chatStore.streaming && msg.role === 'assistant' && i === lastIndex
    if (isStreamingLast) {
      return escapeHtml(msg.content) + '<span class="cursor-blink">|</span>'
    }
    return sanitizeHtml(renderMarkdown(msg.content))
  }

  // ── Diff 应用 / 放弃 ──

  async function handleApplyDiff(merged: string, index: number) {
    const path = target.activeFile()?.path
    const convId = activeConversation.value?.id
    const msg = activeConversation.value?.messages[index]
    if (!path) return
    try {
      if (msg?.targetRange) {
        // 划词操作：只替换选区，绝不把选区结果当全文写盘
        if (!target.applyToSelection) return
        const ok = await target.applyToSelection(
          { path: msg.targetRange.path, from: msg.targetRange.from, to: msg.targetRange.to, original: msg.originalContent },
          merged,
        )
        if (!ok) return
      } else {
        await api.writeFile(path, merged)
        fileStore.updateActiveFile({ content: merged, isDirty: false })
      }
      // 应用修改后累计今日字数（与手动保存同一口径）
      statsStore.recordChapterEdit(path, countWords(merged))
      // 收起 diff：消息变为纯文本（应用后的最终内容），并短暂提示已应用
      if (convId) chatStore.patchMessage(convId, index, { content: merged, originalContent: undefined, targetRange: undefined })
      appliedIndex.value = index
      if (appliedTimer) clearTimeout(appliedTimer)
      appliedTimer = setTimeout(() => { appliedIndex.value = null }, 1800)
    } catch (e) {
      console.error('应用修改失败:', e)
    }
  }

  /** 放弃对比：收起 diff，保留 AI 输出原文（仍可插入/存为摘要） */
  function handleRejectDiff(index: number) {
    const convId = activeConversation.value?.id
    if (convId) chatStore.patchMessage(convId, index, { originalContent: undefined })
  }

  function handleInsertClick(text: string, index: number) {
    target.insert(text)
    insertedIndex.value = index
    if (insertedTimer) clearTimeout(insertedTimer)
    insertedTimer = setTimeout(() => { insertedIndex.value = null }, 1200)
  }

  /** 把 AI 生成的摘要存入 .summaries/<章名>.md，下次前情提要自动优先使用 */
  async function saveAsSummary(text: string, index: number) {
    const file = target.activeFile()
    const root = target.projectRoot()
    if (!file || !root) return
    const stem = file.name.replace(/\.(md|txt)$/i, '')
    const dir = `${root.replace(/\\/g, '/')}/.summaries`
    try {
      await api.createDir(dir)
      await api.writeFile(`${dir}/${stem}.md`, text.trim())
      savedIndex.value = index
      if (savedTimer) clearTimeout(savedTimer)
      savedTimer = setTimeout(() => { savedIndex.value = null }, 2000)
    } catch (e) {
      console.error('保存摘要失败:', e)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  // ── 统一上下文 ──

  const { build: buildContext, contextLabel, contextCounts } = useAiContext(
    () => target.projectRoot(),
    () => target.activeFile()?.path,
    () => {
      const p = target.activeFile()?.path
      return p ? fileStore.getLatestContent(p) : undefined
    },
    () => target.activeFile()?.name,
  )

  // 首次打开或项目切换时加载对话
  onMounted(() => {
    const root = target.projectRoot()
    if (root) chatStore.loadConversations(root)
  })
  watch(
    () => target.projectRoot(),
    (root) => {
      if (root) chatStore.loadConversations(root)
    },
  )

  // 切换文件时停止进行中的生成，避免上下文与结果错位
  watch(
    () => target.activeFile()?.path,
    () => {
      if (chatStore.streaming) chatStore.abortStreaming()
    },
  )

  onUnmounted(clearTimers)

  // ── 通用发送 ──

  /**
   * 发送一次请求：
   * - text: 实际发给模型的内容（快捷操作为完整 prompt，普通对话为用户输入）
   * - display: 用户侧展示文本（快捷操作显示 [续写] 之类标签）
   * - withOriginal: 是否保留原始文件供 DiffView 对比（润色/扩写）
   * 返回 false 表示未发起（缺 API Key 等），由调用方决定是否保留输入框内容。
   */
  async function send(opts: {
    text: string
    display: string
    withOriginal?: boolean
    /** 划词目标：存在时润色/扩写只针对选区，应用 Diff 时替换选区而非全文 */
    selection?: { path: string; from: number; to: number; text: string }
  }): Promise<boolean> {
    if (!settings.aiApiKey) {
      chatStore.streaming = false
      loading.value = false
      showKeyHint.value = true
      return false
    }
    showKeyHint.value = false

    let conv = activeConversation.value
    if (!conv) conv = chatStore.createConversation(undefined, target.activeFile()?.path)
    const convId = conv.id
    chatStore.streaming = true
    loading.value = true
    // 懒加载会话补读 messages，避免“切过去立即发”丢历史
    if (!conv.loaded) await chatStore.ensureLoaded(conv.id)

    const priorHistory = conv.messages
      .filter((m) => m.content !== '')
      .map((m) => ({ role: m.role, content: m.content }))

    let contextPrompt = ''
    try {
      ;({ prompt: contextPrompt } = await buildContext())
    } catch {
      /* 读上下文失败不阻塞 */
    }

    const file = target.activeFile()
    const originalContent =
      opts.selection
        ? opts.selection.text
        : opts.withOriginal && file ? fileStore.getLatestContent(file.path) : undefined

    chatStore.addMessage(convId, { role: 'user', content: opts.display, requestText: opts.text, diffable: opts.withOriginal })
    chatStore.addMessage(convId, { role: 'assistant', content: '', originalContent })
    chatStore.addMessage(convId, {
      role: 'assistant',
      content: '',
      originalContent,
      ...(opts.selection ? { targetRange: { path: opts.selection.path, from: opts.selection.from, to: opts.selection.to } } : {}),
    })
    const ctrl = chatStore.createAbortController()
    try {
      const { text: result, aborted } = await streamChat({
        provider: settings.aiProvider,
        endpoint: settings.aiEndpoint,
        apiKey: settings.aiApiKey,
        model: settings.aiModel,
        system: contextPrompt || undefined,
        temperature: settings.aiTemperature,
        messages: [...priorHistory, { role: 'user', content: opts.text }],
        signal: ctrl.signal,
        onToken: (full) => chatStore.updateLastMessage(convId, full),
      })
      if (aborted) {
        chatStore.updateLastMessage(convId, result ? `${result}\n\n_（已停止生成）_` : '（已停止）')
      }
    } catch (e) {
      const message = e instanceof AiRequestError ? e.message : '网络请求失败'
      chatStore.updateLastMessage(convId, `⚠️ ${message}`)
    } finally {
      chatStore.finishStream(ctrl)
      loading.value = false
      target.scrollToBottom?.()
    }
    return true
  }

  /**
   * 重新生成：撤掉最后一条 AI 回复，用最后一条用户消息的原文重新请求
   * （快捷操作也能正确沿用其原始 prompt 与 DiffView 对比标记）
   */
  async function regenerate(): Promise<boolean> {
    const conv = activeConversation.value
    if (!conv || chatStore.streaming || conv.messages.length === 0) return false
    const last = conv.messages[conv.messages.length - 1]
    if (last.role !== 'assistant') return false
    // 找最后一条用户消息
    let userIdx = -1
    for (let i = conv.messages.length - 2; i >= 0; i--) {
      if (conv.messages[i].role === 'user') { userIdx = i; break }
    }
    if (userIdx < 0) return false
    const userMsg = conv.messages[userIdx]
    const text = userMsg.requestText ?? userMsg.content.replace(/^\[[^\]]+\]\s*/, '')
    const lastRange = last.targetRange
    const lastOriginal = last.originalContent
    chatStore.removeLastMessage(conv.id)
    return send({
      text,
      display: userMsg.content,
      withOriginal: !!userMsg.diffable,
      selection: lastRange
        ? { path: lastRange.path, from: lastRange.from, to: lastRange.to, text: lastOriginal ?? '' }
        : undefined,
    })
  }

  /** 复制消息内容到剪贴板 */
  async function copyMessage(content: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch (e) {
      console.error('复制失败:', e)
      return false
    }
  }

  return {
    chatStore,
    activeConversation,
    loading,
    showKeyHint,
    contextLabel,
    contextCounts,
    appliedIndex,
    savedIndex,
    insertedIndex,
    messageHtml,
    handleApplyDiff,
    handleRejectDiff,
    handleInsertClick,
    saveAsSummary,
    formatDate,
    send,
    regenerate,
    copyMessage,
  }
}
