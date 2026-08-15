import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/files'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 原始文件内容（快捷操作时保存，用于 DiffView 对比） */
  originalContent?: string
  /** 实际发给模型的请求文本（快捷操作时与展示文本不同，用于「重新生成」） */
  requestText?: string
  /** 该请求是否带 DiffView 对比（重新生成时沿用） */
  diffable?: boolean
}

export interface ChatConversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  fileContext?: string // 发起对话时的文件路径
  /** messages 是否已从磁盘加载（懒加载标记） */
  loaded?: boolean
}

const CHAT_DIR = '.chatlog'
const INDEX_FILE = 'index.json'

function chatDir(projectRoot: string) { return `${projectRoot}/${CHAT_DIR}` }
function convPath(projectRoot: string, id: string) { return `${chatDir(projectRoot)}/${id}.json` }
function indexPath(projectRoot: string) { return `${chatDir(projectRoot)}/${INDEX_FILE}` }

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<ChatConversation[]>([])
  const activeId = ref<string | null>(null)
  const projectRoot = ref('')
  const loading = ref(false)
  const streaming = ref(false)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  // 待落盘的会话 id 集合：防抖到期时保存所有变脏的会话，
  // 避免单一 timer「最后一次调度才生效」导致快速切换对话时丢消息
  const dirtyConvIds = new Set<string>()
  let abortController: AbortController | null = null

  const activeConversation = () => conversations.value.find(c => c.id === activeId.value) ?? null

  function createAbortController() {
    abortController = new AbortController()
    return abortController
  }

  function abortStreaming() {
    abortController?.abort()
    abortController = null
    streaming.value = false
  }

  /** 当前活动控制器是否就是它（防止旧请求的收尾误清新请求的状态） */
  function isCurrentController(c: AbortController) {
    return abortController === c
  }

  /** 仅当该控制器仍是当前活动时才复位 streaming */
  function finishStream(c: AbortController) {
    if (abortController === c) {
      abortController = null
      streaming.value = false
    }
  }

  // ── 持久化 ──

  async function ensureChatDir() {
    try { await api.createDir(chatDir(projectRoot.value)) } catch { /* exists */ }
  }

  async function saveIndex() {
    if (!projectRoot.value) return
    const idx = conversations.value.map(c => ({
      id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, fileContext: c.fileContext,
    }))
    try {
      await ensureChatDir()
      await api.writeFile(indexPath(projectRoot.value), JSON.stringify(idx))
    } catch { /* 保存失败不阻塞 */ }
  }

  async function saveConversation(id: string) {
    if (!projectRoot.value) return
    const conv = conversations.value.find(c => c.id === id)
    if (!conv || !conv.loaded) return
    try {
      await ensureChatDir()
      await api.writeFile(convPath(projectRoot.value, id), JSON.stringify(conv))
    } catch { /* 保存失败不阻塞 */ }
  }

  /** 立即落盘所有变脏会话与索引（应用关闭前调用，跳过防抖） */
  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    await flushDirty()
    await saveIndex()
  }

  /** 到点落盘所有变脏会话；期间被删除的会话自动跳过 */
  async function flushDirty() {
    const ids = [...dirtyConvIds]
    dirtyConvIds.clear()
    for (const id of ids) {
      const conv = conversations.value.find((c) => c.id === id)
      if (conv && conv.loaded) await saveConversation(id)
    }
  }

  function scheduleSave(id: string) {
    dirtyConvIds.add(id)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { flushDirty(); saveIndex() }, 1000)
  }

  // 自动保存：由 addMessage / updateLastMessage / patchMessage 显式调度，
  // 不用 deep watch —— 流式输出时每个 token 都会触发全量深遍历，开销随会话数增长

  // ── 对话管理 ──

  async function loadConversations(root: string) {
    projectRoot.value = root
    conversations.value = []
    const previousActive = activeId.value
    activeId.value = null
    if (!root) return
    try {
      const raw = await api.readFile(indexPath(root))
      const idx = JSON.parse(raw)
      if (!Array.isArray(idx)) return
      // 只加载标题元信息，messages 按需懒加载
      conversations.value = idx.map((item: any) => ({
        id: item.id,
        title: item.title || '对话',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        fileContext: item.fileContext,
        messages: [],
        loaded: false,
      }))
      if (conversations.value.length > 0) {
        // 重载时保留当前会话选择（面板↔全屏切换会重新加载）；
        // 已不存在的会话回落到第一条
        const stillExists =
          previousActive != null && conversations.value.some((c) => c.id === previousActive)
        activeId.value = stillExists ? previousActive : conversations.value[0].id
        await ensureLoaded(activeId.value)
      }
      // 后台清理超量会话（不阻塞界面）
      pruneOldConversations().catch(() => { /* 清理失败忽略 */ })
    } catch { /* 没有历史对话 */ }
  }

  /**
   * 会话清理：只保留最近 200 个会话（防 .chatlog 无限膨胀）。
   * 不再按时间静默删除旧会话——那是用户的数据，删除权应交给用户。
   */
  async function pruneOldConversations() {
    if (!projectRoot.value) return
    if (conversations.value.length > 200) {
      const sorted = [...conversations.value].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      for (const c of sorted.slice(200)) {
        await deleteConversation(c.id)
      }
    }
  }

  /** 懒加载：按需从磁盘读取指定对话的 messages */
  async function ensureLoaded(id: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (!conv || conv.loaded) return
    try {
      const raw = await api.readFile(convPath(projectRoot.value, id))
      const data = JSON.parse(raw) as ChatConversation
      conv.messages = Array.isArray(data.messages) ? data.messages : []
    } catch {
      conv.messages = []
    }
    conv.loaded = true
  }

  function createConversation(title?: string, fileContext?: string) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const conv: ChatConversation = {
      id,
      title: title || '新对话',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileContext,
      loaded: true,
    }
    conversations.value = [conv, ...conversations.value]
    activeId.value = id
    scheduleSave(id)
    saveIndex()
    return conv
  }

  async function deleteConversation(id: string) {
    const conv = conversations.value.find(c => c.id === id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeId.value === id) {
      activeId.value = conversations.value[0]?.id ?? null
      if (activeId.value) ensureLoaded(activeId.value)
    }
    await saveIndex()
    // 同步删除磁盘上的会话文件，避免 .chatlog 残留
    if (conv && projectRoot.value) {
      try {
        await api.deleteFile(convPath(projectRoot.value, id))
      } catch { /* 删除失败不影响 UI */ }
    }
  }

  function switchConversation(id: string) {
    activeId.value = id
    ensureLoaded(id)
  }

  function addMessage(convId: string, msg: ChatMessage) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    conv.messages.push(msg)
    conv.updatedAt = new Date().toISOString()
    // 首条用户消息作为标题
    if (conv.title === '新对话' && msg.role === 'user') {
      conv.title = msg.content.slice(0, 30) + (msg.content.length > 30 ? '…' : '')
    }
    scheduleSave(convId)
  }

  function updateLastMessage(convId: string, content: string) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv || conv.messages.length === 0) return
    conv.messages[conv.messages.length - 1].content = content
    scheduleSave(convId)
  }

  /** 局部修改某条消息（如收起 diff 对比），并安排落盘 */
  function patchMessage(convId: string, index: number, patch: Partial<ChatMessage>) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const msg = conv.messages[index]
    if (!msg) return
    Object.assign(msg, patch)
    conv.updatedAt = new Date().toISOString()
    scheduleSave(convId)
  }

  /** 删除最后一条消息（重新生成前撤掉旧回复） */
  function removeLastMessage(convId: string) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv || conv.messages.length === 0) return
    conv.messages.pop()
    conv.updatedAt = new Date().toISOString()
    scheduleSave(convId)
  }

  return {
    conversations,
    activeId,
    projectRoot,
    loading,
    streaming,
    abortStreaming,
    createAbortController,
    isCurrentController,
    finishStream,
    activeConversation,
    loadConversations,
    ensureLoaded,
    createConversation,
    deleteConversation,
    switchConversation,
    addMessage,
    updateLastMessage,
    patchMessage,
    removeLastMessage,
    saveConversation,
    flushSave,
  }
})

// 开发模式 HMR：store 改动时热替换定义，避免新旧实例混用导致运行时崩溃
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot))
}
