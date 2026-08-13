import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as api from '../api/files'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 原始文件内容（快捷操作时保存，用于 DiffView 对比） */
  originalContent?: string
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

  function scheduleSave(id: string) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveConversation(id); saveIndex() }, 1000)
  }

  // 自动保存
  watch(conversations, () => {
    if (activeId.value) scheduleSave(activeId.value)
  }, { deep: true })

  // ── 对话管理 ──

  async function loadConversations(root: string) {
    projectRoot.value = root
    conversations.value = []
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
        activeId.value = conversations.value[0].id
        await ensureLoaded(activeId.value)
      }
    } catch { /* 没有历史对话 */ }
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

  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeId.value === id) {
      activeId.value = conversations.value[0]?.id ?? null
      if (activeId.value) ensureLoaded(activeId.value)
    }
    saveIndex()
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
  }

  function updateLastMessage(convId: string, content: string) {
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv || conv.messages.length === 0) return
    conv.messages[conv.messages.length - 1].content = content
  }

  return {
    conversations,
    activeId,
    projectRoot,
    loading,
    streaming,
    abortStreaming,
    createAbortController,
    activeConversation,
    loadConversations,
    ensureLoaded,
    createConversation,
    deleteConversation,
    switchConversation,
    addMessage,
    updateLastMessage,
    saveConversation,
  }
})
