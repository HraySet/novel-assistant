/**
 * 项目文档读取层：AI 上下文与一致性检测共用的「按预算读取项目资料」能力。
 *
 * 为什么要有这一层：
 * 重构前 `useAiContext` 与 `detection` 各写了一套读取逻辑——各有一份章节列表、
 * 各有一份目录读取、各有一份预算常量（DIR_TOTAL_MAX = 30000 抄了两份）。
 * 两套实现意味着 AI 对话看到的资料与一致性检测看到的资料可能不一致，
 * 而且改一处必然忘另一处。
 *
 * 分层：本模块负责 IO 与预算截断（依赖 api），不做任何提示词拼接；
 * 提示词怎么排、开关怎么给，仍由各消费方决定。
 */
import * as api from '../api/files'
import { joinPath } from '../core/paths'
import { walkFiles, TREE_POLICIES, SETTING_DIR_ALIASES, type SettingDirKind } from '../core/tree'

/** 上下文相关预算的唯一来源（字符数） */
export const CONTEXT_BUDGETS = {
  /** 当前文件最多注入多少字 */
  currentFile: 8000,
  /** 单个设定文件最多读多少字 */
  dirFile: 4000,
  /** 整个设定目录最多读多少字 */
  dirTotal: 30000,
  /** 单章摘要最多用多少字 */
  summary: 1000,
  /** 无摘要时取章尾多少字 */
  tailChars: 500,
  /** 整份上下文总预算 */
  total: 60000,
  /** 一致性检测取最近几章 */
  detectionChapters: 5,
  /** 一致性检测单章最多读多少字 */
  detectionChapterChars: 4000,
} as const

export interface ChapterRef {
  path: string
  name: string
}

export interface DirDoc {
  name: string
  content: string
}

/** 资料目录里的文件引用（不读内容） */
export interface DirDocRef {
  /** 去扩展名的文件名（角色卡名 / 大纲名） */
  name: string
  path: string
}

export interface ChapterSlice {
  name: string
  content: string
  /** 内容来源：摘要 / 章尾片段 / 整章开头片段 */
  source: 'summary' | 'tail' | 'full'
}

/** 章节文件名去掉扩展名（摘要文件按此命名） */
export function chapterStem(name: string): string {
  return name.replace(/\.(md|txt)$/i, '')
}

/**
 * 解析设定目录的实际名称（规范名优先，别名回退）。
 *
 * 目录名是用户自己起的：可能叫「角色」也可能叫「人物」。这里按规范名先试，
 * 不存在时遍历同义别名，返回第一个真实存在的目录名；都不存在返回规范名
 * （后续 listDir 会得到空结果，语义上等于「还没建设定目录」）。
 */
export async function resolveSettingDir(root: string, kind: SettingDirKind): Promise<string> {
  const canonical = kind
  const candidates = Object.keys(SETTING_DIR_ALIASES).filter((k) => SETTING_DIR_ALIASES[k] === kind)
  // 规范名排最前
  const ordered = [canonical, ...candidates.filter((c) => c !== canonical)]
  for (const name of ordered) {
    if (await api.pathExists(joinPath(root, name))) return name
  }
  return canonical
}

/** 列出正文章节（走 chapters 策略：排除设定目录、`_` 前缀与隐藏项） */
export async function listChapterFiles(root: string): Promise<ChapterRef[]> {
  const entries = await api.listDir(root)
  return walkFiles(entries, TREE_POLICIES.chapters).map((e) => ({ path: e.path, name: e.name }))
}

/** 列出资料目录下的文档引用（只列文件名与路径，不读内容） */
export async function listDirDocs(root: string, dirName: string): Promise<DirDocRef[]> {
  try {
    const entries = await api.listDir(joinPath(root, dirName))
    return walkFiles(entries, TREE_POLICIES.settings).map((e) => ({
      name: chapterStem(e.name),
      path: e.path,
    }))
  } catch {
    return []
  }
}

/**
 * 读取某个资料目录（角色 / 大纲）下的文档。
 * 单文件与目录总量都设上限，避免几十张角色卡把上下文撑爆；失败的文件跳过。
 *
 * ⚠️ 结果可能被截断，**不可用于写回文件**。写回请用 `listDirDocs` + `api.readFile` 读全文。
 */
export async function readDirDocs(
  root: string,
  dirName: string,
  opts: { perFileMax?: number; totalMax?: number; concurrency?: number } = {},
): Promise<DirDoc[]> {
  const perFileMax = opts.perFileMax ?? CONTEXT_BUDGETS.dirFile
  const totalMax = opts.totalMax ?? CONTEXT_BUDGETS.dirTotal
  const concurrency = opts.concurrency ?? 8

  const files = await listDirDocs(root, dirName)
  if (files.length === 0) return []

  const results = new Array<DirDoc | null>(files.length).fill(null)
  let budget = totalMax
  let cursor = 0

  const worker = async () => {
    while (true) {
      const i = cursor++
      if (i >= files.length) return
      if (budget <= 0) return
      const file = files[i]
      try {
        const raw = await api.readFile(file.path)
        const take = Math.min(perFileMax, budget)
        const content = raw.slice(0, take)
        budget -= content.length
        results[i] = { name: file.name, content }
      } catch {
        /* 单个文件读失败不影响其余 */
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return results.filter((d): d is DirDoc => d !== null && d.content.length > 0)
}

/** 读取项目概述（_project.md），不存在或为空时返回空串 */
export async function readOverview(root: string): Promise<string> {
  try {
    return (await api.readFile(joinPath(root, '_project.md'))).trim()
  } catch {
    return ''
  }
}

/** 资料目录里的文件数（仅用于界面上的「角色设定 (3)」计数，不读内容） */
export async function countDirDocs(root: string, dirName: string): Promise<number> {
  try {
    const entries = await api.listDir(joinPath(root, dirName))
    return walkFiles(entries, TREE_POLICIES.settings).length
  } catch {
    return 0
  }
}

/** 完整文档（含路径），供需要写回的场景使用 */
export interface DirDocFile extends DirDoc {
  path: string
}

/**
 * 读取资料目录下的**完整**文档（不截断），用于需要写回的场景（角色卡编辑）。
 *
 * ⚠️ 与 `readDirDocs` 的区别必须分清：
 * - `readDirDocs` 有预算上限，只喂给模型，**绝不能拿来写回**（会截断用户文件）；
 * - 本函数读全文，内存占用随卡片数量线性增长，因此并发受限。
 */
export async function readDirDocsFull(
  root: string,
  dirName: string,
  concurrency = 8,
): Promise<DirDocFile[]> {
  const files = await listDirDocs(root, dirName)
  if (files.length === 0) return []

  const results = new Array<DirDocFile | null>(files.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const i = cursor++
      if (i >= files.length) return
      const file = files[i]
      try {
        results[i] = { name: file.name, path: file.path, content: await api.readFile(file.path) }
      } catch {
        /* 单个读失败跳过 */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return results.filter((d): d is DirDocFile => d !== null)
}

/**
 * 按需读取若干章节的内容切片。
 *
 * @param chapters      章节顺序列表（已按正文顺序）
 * @param count         取几章
 * @param perChapterMax 每章最多多少字
 * @param preferSummary 优先用 `.summaries/<章名>.md` 摘要
 * @param tailFallback  无摘要时退回章尾片段（只读文件末尾字节，不整篇读盘）
 * @param fromEnd       true 取最后 N 章（一致性检测）；false 取列表开头 N 章
 */
export async function readChapterSlices(
  root: string,
  chapters: ChapterRef[],
  opts: {
    count: number
    perChapterMax: number
    preferSummary?: boolean
    tailFallback?: boolean
    fromEnd?: boolean
    concurrency?: number
  },
): Promise<ChapterSlice[]> {
  const { count, perChapterMax, preferSummary = false, tailFallback = false, fromEnd = false } = opts
  const concurrency = opts.concurrency ?? 4
  const picked = fromEnd ? chapters.slice(-count) : chapters.slice(0, count)

  // 并发 worker 读取，结果按索引回填，保证输出顺序与输入一致
  const results = new Array<ChapterSlice | null>(picked.length).fill(null)
  let cursor = 0

  const readOne = async (ch: ChapterRef): Promise<ChapterSlice | null> => {
    let slice: ChapterSlice | null = null

    if (preferSummary) {
      try {
        const summary = await api.readFile(
          joinPath(joinPath(root, '.summaries'), `${chapterStem(ch.name)}.md`),
        )
        if (summary.trim()) {
          slice = { name: ch.name, content: summary.slice(0, perChapterMax), source: 'summary' }
        }
      } catch {
        /* 无摘要文件 */
      }
    }

    if (!slice && tailFallback) {
      try {
        // 只读末尾字节（Rust 侧按 UTF-8 边界对齐），避免整章读盘再切片
        const tail = (await api.readFileTail(ch.path, perChapterMax * 4)).slice(-perChapterMax).trim()
        if (tail) slice = { name: ch.name, content: tail, source: 'tail' }
      } catch {
        /* 读失败则跳过该章 */
      }
    }

    if (!slice) {
      try {
        const raw = await api.readFile(ch.path)
        const content = raw.slice(0, perChapterMax)
        if (content.trim()) slice = { name: ch.name, content, source: 'full' }
      } catch {
        /* 读失败则跳过该章 */
      }
    }

    return slice
  }

  const worker = async () => {
    while (true) {
      const i = cursor++
      if (i >= picked.length) return
      results[i] = await readOne(picked[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, picked.length) }, worker))
  return results.filter((s): s is ChapterSlice => s !== null)
}

/**
 * 前情提要：当前章节之前的最近 N 章（由近及远）。
 * 优先读摘要库，缺省退化为章尾片段，保证开箱即用。
 */
export async function readRecap(
  root: string,
  currentPath: string | undefined,
  count: number,
): Promise<ChapterSlice[]> {
  if (!currentPath || count <= 0) return []
  let chapters: ChapterRef[]
  try {
    chapters = await listChapterFiles(root)
  } catch {
    return []
  }
  const idx = chapters.findIndex((c) => c.path === currentPath)
  if (idx <= 0) return []
  const prev = chapters.slice(Math.max(0, idx - count), idx).reverse()
  return readChapterSlices(root, prev, {
    count: prev.length,
    perChapterMax: CONTEXT_BUDGETS.summary,
    preferSummary: true,
    tailFallback: true,
  })
}
