import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import * as api from '../api/files'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatConversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  fileContext?: string // 发起对话时的文件路径
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
    if (!conv) return
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
      // 加载每个对话的详细数据
      const loaded: ChatConversation[] = []
      for (const item of idx) {
        try {
          const rawConv = await api.readFile(convPath(root, item.id))
          loaded.push(JSON.parse(rawConv))
        } catch { loaded.push({ ...item, messages: [] }) }
      }
      conversations.value = loaded
      if (loaded.length > 0) activeId.value = loaded[0].id
    } catch { /* 没有历史对话 */ }
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
    }
    saveIndex()
  }

  function switchConversation(id: string) {
    activeId.value = id
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
    createConversation,
    deleteConversation,
    switchConversation,
    addMessage,
    updateLastMessage,
    saveConversation,
  }
})
