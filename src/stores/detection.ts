import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../api/files'
import { useSettingsStore } from './settings'
import { useUsageStore } from './usage'
import { streamChat } from '../composables/useAiStream'
import {
  CONTEXT_BUDGETS,
  listChapterFiles,
  listDirDocs,
  readChapterSlices,
  readDirDocs,
  resolveSettingDir,
} from '../composables/projectDocs'
import { replaceFirst } from '../core/text'

/** AI 推断的角色性格变化（待用户确认） */
export interface CharacterChange {
  name: string
  tag: string
  oldTrait: string
  newTrait: string
  pending: boolean
}

/** AI 提出的大纲调整建议 */
export interface OutlineSuggestion {
  title: string
  note: string
  newTitle: string
  status: 'suggest' | 'planned' | 'done'
}

const PERSIST_FILE = '.stats/consistency.json'

const SYSTEM_PROMPT = `你是小说一致性检查器。根据提供的【角色设定】【大纲】与【最近章节】，检测两类问题：
1. 角色变化：最新章节中角色表现出与既有设定不一致的新性格特质或关系变化；
2. 大纲冲突：剧情发展与大纲计划不符，或大纲条目已因剧情推进而过时。

只输出一个 JSON 对象（不要 Markdown 代码块、不要多余解释）：
{"characters":[{"name":"角色名（必须与角色设定中一致）","tag":"一句话人设标签","oldTrait":"旧设定原文摘录","newTrait":"新推断的特质"}],"outlines":[{"title":"大纲条目原标题（必须与大纲中一致）","note":"冲突或过时的说明","newTitle":"建议的新标题（无建议则为空字符串）"}]}
没有变化时对应数组为空。宁可漏报，不要编造。`

interface CheckInput {
  chars: { name: string; content: string }[]
  outlines: { content: string }[]
  recentRaw: string
}

export const useDetectionStore = defineStore('detection', () => {
  const characterChanges = ref<CharacterChange[]>([])
  const outlineSuggestions = ref<OutlineSuggestion[]>([])
  /** 上次检查之后新增的字数。**纯计数**，只用于提示「该检查了」，不触发任何请求 */
  const wordsSinceCheck = ref(0)
  const checking = ref(false)
  const lastError = ref('')
  const projectRoot = ref('')

  const pendingCount = computed(() => characterChanges.value.filter((c) => c.pending).length)

  /**
   * 记录新增字数（绝不发请求）。
   *
   * 一致性检测改为**手动触发**：旧的实现按字数阈值自动调用 AI，
   * 用户以为自己在本地写作，后台却在出网——与「日常写作零 token」的定位直接矛盾。
   * 这里只累加计数，面板显示「上次检查后已新增 N 字」，由用户决定何时点检查。
   */
  function noteWordsAdded(n: number) {
    if (n <= 0 || !projectRoot.value) return
    wordsSinceCheck.value += n
  }

  // ── 项目切换：载入该项目的检测结果 ──

  async function setProjectRoot(root: string) {
    if (projectRoot.value === root) return
    projectRoot.value = root
    wordsSinceCheck.value = 0
    characterChanges.value = []
    outlineSuggestions.value = []
    if (!root) return
    try {
      const raw = await api.readFile(`${root.replace(/\\/g, '/')}/${PERSIST_FILE}`)
      const saved = JSON.parse(raw)
      if (Array.isArray(saved.characterChanges)) characterChanges.value = saved.characterChanges
      if (Array.isArray(saved.outlineSuggestions)) outlineSuggestions.value = saved.outlineSuggestions
      if (typeof saved.wordsSinceCheck === 'number') wordsSinceCheck.value = saved.wordsSinceCheck
    } catch { /* 无持久化结果 */ }
  }

  function persist() {
    if (!projectRoot.value) return
    const payload = {
      characterChanges: characterChanges.value,
      outlineSuggestions: outlineSuggestions.value,
      wordsSinceCheck: wordsSinceCheck.value,
    }
    api.writeFile(`${projectRoot.value.replace(/\\/g, '/')}/${PERSIST_FILE}`, JSON.stringify(payload, null, 2))
      .catch(() => { /* 保存失败不阻塞 */ })
  }

  // ── 数据采集（统一走 projectDocs，与 AI 上下文共用一套遍历与预算） ──

  async function collectCheckInput(root: string): Promise<CheckInput> {
    // 设定目录名可能是别名（人物/设定/剧情…），统一解析到实际存在的目录
    const [charDir, outlineDir] = await Promise.all([
      resolveSettingDir(root, '角色'),
      resolveSettingDir(root, '大纲'),
    ])
    const [chapters, chars, outlines] = await Promise.all([
      listChapterFiles(root),
      readDirDocs(root, charDir),
      readDirDocs(root, outlineDir),
    ])
    // 最近 N 章（取整章开头片段，供一致性比对）
    const recent = await readChapterSlices(root, chapters, {
      count: CONTEXT_BUDGETS.detectionChapters,
      perChapterMax: CONTEXT_BUDGETS.detectionChapterChars,
      fromEnd: true,
    })
    return {
      chars,
      outlines,
      recentRaw: recent.map((s) => `## ${s.name}\n${s.content}`).join('\n\n'),
    }
  }

  function parseJson(text: string): { characters: any[]; outlines: any[] } {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return { characters: [], outlines: [] }
    try {
      const obj = JSON.parse(text.slice(start, end + 1))
      return {
        characters: Array.isArray(obj.characters) ? obj.characters : [],
        outlines: Array.isArray(obj.outlines) ? obj.outlines : [],
      }
    } catch {
      return { characters: [], outlines: [] }
    }
  }

  // ── 核心检测：本地先过滤，真正需要时才调用一次 AI ──

  async function runCheck() {
    const root = projectRoot.value
    if (!root || checking.value) return
    const settings = useSettingsStore()
  const usageStore = useUsageStore()
    if (!settings.aiApiKey) return // 未配置 API Key 时静默跳过

    checking.value = true
    lastError.value = ''
    try {
      const { recentRaw, chars, outlines } = await collectCheckInput(root)

      // 本地第一道闸：内容太少，或最近章节没提到任何角色且没有大纲 → 不必调用 AI
      if (recentRaw.trim().length < 200) return
      const mentioned = chars.some((c) => c.name && recentRaw.includes(c.name))
      if (!mentioned && outlines.length === 0) return

      const contextParts: string[] = []
      if (chars.length > 0) contextParts.push(`角色设定:\n${chars.map((c) => `## ${c.name}\n${c.content}`).join('\n\n')}`)
      if (outlines.length > 0) contextParts.push(`大纲:\n${outlines.map((o) => o.content).join('\n\n')}`)
      contextParts.push(`最近章节:\n${recentRaw}`)

      const ctrl = new AbortController()
      const { text, usage } = await streamChat({
        provider: settings.aiProvider,
        endpoint: settings.aiEndpoint,
        apiKey: settings.aiApiKey,
        model: settings.aiModel,
        system: SYSTEM_PROMPT,
        temperature: 0.3,
        messages: [{ role: 'user', content: contextParts.join('\n\n---\n\n') }],
        signal: ctrl.signal,
        onToken: () => {},
      })
      usageStore.record(usage)

      const parsed = parseJson(text)
      const validNames = new Set(chars.map((c) => c.name))
      characterChanges.value = parsed.characters
        .filter((c: any) => c && typeof c.name === 'string' && validNames.has(c.name))
        .map((c: any) => ({
          name: c.name,
          tag: typeof c.tag === 'string' ? c.tag : '',
          oldTrait: typeof c.oldTrait === 'string' ? c.oldTrait : '',
          newTrait: typeof c.newTrait === 'string' ? c.newTrait : '',
          pending: true,
        }))
      outlineSuggestions.value = parsed.outlines
        .filter((o: any) => o && typeof o.title === 'string')
        .map((o: any) => ({
          title: o.title,
          note: typeof o.note === 'string' ? o.note : '',
          newTitle: typeof o.newTitle === 'string' ? o.newTitle : '',
          status: 'suggest' as const,
        }))
      persist()
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : '检测失败'
    } finally {
      checking.value = false
      wordsSinceCheck.value = 0
    }
  }

  // ── 确认 / 忽略 ──

  /**
   * 确认角色变化：把旧设定替换为新设定。
   *
   * 两个安全要点（旧实现都踩了）：
   * 1. 只替换**第一处**匹配——同一句设定常在卡片里出现两次，全量替换会改掉用户没确认的地方；
   * 2. 通过真实文件引用定位，不拼接 `${name}.md`（否则 .txt 卡片会被写成新建 .md）。
   */
  async function acceptCharacter(name: string) {
    const c = characterChanges.value.find((x) => x.name === name)
    if (!c) return
    try {
      const charDir = await resolveSettingDir(projectRoot.value, '角色')
      const files = await listDirDocs(projectRoot.value, charDir)
      const target = files.find((f) => f.name === c.name)
      if (!target) return
      const content = await api.readFile(target.path)
      let next = content
      if (c.oldTrait && content.includes(c.oldTrait)) {
        next = replaceFirst(content, c.oldTrait, c.newTrait)
      } else if (c.newTrait) {
        next = content.trimEnd() + `\n\n- 更新：${c.newTrait}\n`
      }
      if (next !== content) await api.writeFile(target.path, next)
    } catch { /* 写回失败不阻塞确认状态 */ }
    c.pending = false
    persist()
  }

  function rejectCharacter(name: string) {
    const c = characterChanges.value.find((x) => x.name === name)
    if (c) {
      c.pending = false
      persist()
    }
  }

  /**
   * 确认大纲调整：在大纲文件里把原标题换成新标题。
   *
   * ⚠️ 旧实现用 `readDirDocs` 的**截断内容**写回全文——超过 4000 字的大纲会被
   * 砍掉后半段。这里改为读全文、只替换第一处、写回真实路径（保留原扩展名）。
   */
  async function acceptOutline(title: string) {
    const s = outlineSuggestions.value.find((x) => x.title === title)
    if (!s) return
    if (s.newTitle) {
      try {
        const outlineDir = await resolveSettingDir(projectRoot.value, '大纲')
        const files = await listDirDocs(projectRoot.value, outlineDir)
        for (const f of files) {
          const content = await api.readFile(f.path)
          if (!content.includes(s.title)) continue
          await api.writeFile(f.path, replaceFirst(content, s.title, s.newTitle))
          break
        }
      } catch { /* 写回失败不阻塞 */ }
    }
    s.status = 'done'
    persist()
  }

  function rejectOutline(title: string) {
    const s = outlineSuggestions.value.find((x) => x.title === title)
    if (s) {
      s.status = 'planned'
      persist()
    }
  }

  return {
    characterChanges,
    outlineSuggestions,
    wordsSinceCheck,
    checking,
    lastError,
    pendingCount,
    setProjectRoot,
    noteWordsAdded,
    runCheck,
    acceptCharacter,
    rejectCharacter,
    acceptOutline,
    rejectOutline,
  }
})
