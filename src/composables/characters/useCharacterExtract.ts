/**
 * AI 抽取角色名：从当前打开的章节正文提取人物名（一次小调用，只输出名字 JSON，不重写内容）。
 *
 * 从 CharacterCards.vue 下沉。抽取流程编排在此，真正的名字解析（parseNameList）
 * 在 parseCharacter.ts 纯函数层。依赖通过回调注入：
 *  - `stream`：发起流式调用（组件用 streamChat 实现，测试用 mock）
 *  - `recordUsage`：记录 token 用量（组件用 useUsageStore().record，测试用 mock）
 *  - `getLiveContent`：取当前章节最新正文（组件用 props.getCurrentContent，测试用固定文本）
 */
import { ref } from 'vue'
import type { AiUsage } from '../../core/usage'
import { parseNameList } from './parseCharacter'

export interface CharacterExtractDeps {
  /** 取当前章节的完整正文（已处理「首尾各取一段」的截断策略） */
  getLiveContent: () => string
  /** 已存在的角色名列表（用于过滤已抽取的名字） */
  existingNames: () => string[]
  /** 发起流式 AI 调用，返回 { text, usage } */
  stream: (args: {
    system: string
    temperature: number
    content: string
  }) => Promise<{ text: string; usage: AiUsage | null }>
  /** 记录 token 用量 */
  recordUsage: (usage: AiUsage | null) => void
  /** 是否需要 API Key（未配置时直接提示） */
  hasApiKey: () => boolean
}

const EXTRACT_SYSTEM =
  '你是小说人物名提取器。阅读给定正文，提取其中出现的人物名（人名，含明显指向人物的昵称）。只输出一个 JSON 字符串数组，例如 ["张三","李四"]。不要输出任何其他内容；没有人物则输出 []。'

export function useCharacterExtract(deps: CharacterExtractDeps) {
  const extracting = ref(false)
  const extractCandidates = ref<string[]>([])
  const extractNote = ref('')

  let noteTimer: ReturnType<typeof setTimeout> | null = null
  function clearNote() {
    if (noteTimer) clearTimeout(noteTimer)
    noteTimer = setTimeout(() => {
      extractNote.value = ''
    }, 4000)
  }

  /**
   * 截断策略：首尾各取一段，首段覆盖开场，尾段覆盖本章结尾引入的新角色，
   * 避免「后半章才出场的人物」被前 8000 字截掉。
   */
  function sliceForExtract(full: string): string {
    if (full.length <= 8000) return full
    return `${full.slice(0, 5200)}\n……（中间省略）……\n${full.slice(-2600)}`
  }

  /**
   * 执行抽取。成功且发现新角色名 → 填入 extractCandidates 并返回 true；
   * 未发现新名 / 无 Key / 失败 → 写入 extractNote 并返回 false。
   * 调用方拿到 true 后负责弹确认框与批量建卡。
   */
  async function runExtract(): Promise<boolean> {
    if (extracting.value) return false
    if (!deps.hasApiKey()) {
      extractNote.value = '需先在设置中配置 API Key'
      clearNote()
      return false
    }
    extracting.value = true
    extractNote.value = ''
    try {
      const full = deps.getLiveContent().trim()
      if (full.length < 200) {
        extractNote.value = '先打开一章正文（至少 200 字）'
        clearNote()
        return false
      }
      const { text, usage } = await deps.stream({
        system: EXTRACT_SYSTEM,
        temperature: 0.2,
        content: sliceForExtract(full),
      })
      deps.recordUsage(usage)
      const existing = new Set(deps.existingNames())
      const fresh = parseNameList(text).filter((n) => !existing.has(n))
      if (fresh.length === 0) {
        extractNote.value = '未发现新角色名'
        clearNote()
        return false
      }
      extractCandidates.value = fresh
      return true
    } catch (e) {
      console.error('抽取失败:', e)
      extractNote.value = '抽取失败，请重试'
      clearNote()
      return false
    } finally {
      extracting.value = false
    }
  }

  function clearCandidates() {
    extractCandidates.value = []
  }

  return {
    extracting,
    extractCandidates,
    extractNote,
    runExtract,
    clearCandidates,
    clearNote,
  }
}
