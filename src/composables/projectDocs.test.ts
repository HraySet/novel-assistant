import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/files', () => ({
  listDir: vi.fn(),
  readFile: vi.fn(),
  readFileTail: vi.fn(),
}))

import * as api from '../api/files'
import {
  CONTEXT_BUDGETS,
  chapterStem,
  countDirDocs,
  listChapterFiles,
  listDirDocs,
  readChapterSlices,
  readDirDocs,
  readDirDocsFull,
  readOverview,
  readRecap,
} from './projectDocs'

const listDir = api.listDir as unknown as ReturnType<typeof vi.fn>
const readFile = api.readFile as unknown as ReturnType<typeof vi.fn>
const readFileTail = api.readFileTail as unknown as ReturnType<typeof vi.fn>

const ROOT = '/proj'

function entry(name: string, parent = ROOT, isDir = false) {
  return { name, path: `${parent}/${name}`, isDir }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chapterStem', () => {
  it('去掉 md/txt 扩展名', () => {
    expect(chapterStem('第1章.md')).toBe('第1章')
    expect(chapterStem('番外.TXT')).toBe('番外')
    expect(chapterStem('无扩展名')).toBe('无扩展名')
  })
})

describe('listChapterFiles', () => {
  it('排除设定目录、_ 前缀与隐藏项', async () => {
    listDir.mockResolvedValue([
      entry('第一卷', ROOT, true),
      entry('第3章.md'),
      entry('_project.md'),
      { name: '角色', path: `${ROOT}/角色`, isDir: true, children: [entry('张三.md', `${ROOT}/角色`)] },
      { name: '大纲', path: `${ROOT}/大纲`, isDir: true, children: [entry('主线.md', `${ROOT}/大纲`)] },
      entry('封面.png'),
    ])
    const chapters = await listChapterFiles(ROOT)
    expect(chapters.map((c) => c.name)).toEqual(['第3章.md'])
  })
})

describe('listDirDocs', () => {
  it('重名文件去扩展名后作为 name', async () => {
    listDir.mockResolvedValue([entry('张三.md', `${ROOT}/角色`), entry('李四.txt', `${ROOT}/角色`)])
    const docs = await listDirDocs(ROOT, '角色')
    expect(docs).toEqual([
      { name: '张三', path: `${ROOT}/角色/张三.md` },
      { name: '李四', path: `${ROOT}/角色/李四.txt` },
    ])
  })

  it('目录不存在时返回空数组', async () => {
    listDir.mockRejectedValue(new Error('no dir'))
    expect(await listDirDocs(ROOT, '角色')).toEqual([])
  })
})

describe('countDirDocs', () => {
  it('只数文件', async () => {
    listDir.mockResolvedValue([entry('张三.md', `${ROOT}/角色`), entry('子目录', `${ROOT}/角色`, true)])
    expect(await countDirDocs(ROOT, '角色')).toBe(1)
  })
  it('目录不存在返回 0', async () => {
    listDir.mockRejectedValue(new Error('x'))
    expect(await countDirDocs(ROOT, '角色')).toBe(0)
  })
})

describe('readDirDocs（预算截断）', () => {
  it('单文件按 perFileMax 截断', async () => {
    listDir.mockResolvedValue([entry('a.md', `${ROOT}/角色`)])
    readFile.mockResolvedValue('x'.repeat(100))
    const docs = await readDirDocs(ROOT, '角色', { perFileMax: 10, totalMax: 1000 })
    expect(docs[0].content).toHaveLength(10)
  })

  it('目录总量按 totalMax 截断，后续文件不再读取', async () => {
    listDir.mockResolvedValue([
      entry('a.md', `${ROOT}/角色`),
      entry('b.md', `${ROOT}/角色`),
      entry('c.md', `${ROOT}/角色`),
    ])
    readFile.mockResolvedValue('y'.repeat(50))
    const docs = await readDirDocs(ROOT, '角色', { perFileMax: 50, totalMax: 60, concurrency: 1 })
    expect(docs.length).toBe(2)
    expect(docs[0].content).toHaveLength(50)
    expect(docs[1].content).toHaveLength(10)
  })

  it('保持文件顺序（并发读取不改变顺序）', async () => {
    listDir.mockResolvedValue([
      entry('1.md', `${ROOT}/角色`),
      entry('2.md', `${ROOT}/角色`),
      entry('3.md', `${ROOT}/角色`),
    ])
    readFile.mockImplementation(async (p: string) => `内容:${p.split('/').pop()}`)
    const docs = await readDirDocs(ROOT, '角色', { concurrency: 3 })
    expect(docs.map((d) => d.content)).toEqual(['内容:1.md', '内容:2.md', '内容:3.md'])
  })

  it('单个文件读失败被跳过，不影响其余', async () => {
    listDir.mockResolvedValue([entry('a.md', `${ROOT}/角色`), entry('b.md', `${ROOT}/角色`)])
    readFile.mockImplementation(async (p: string) => {
      if (p.endsWith('a.md')) throw new Error('boom')
      return 'ok'
    })
    const docs = await readDirDocs(ROOT, '角色')
    expect(docs.map((d) => d.name)).toEqual(['b'])
  })
})

describe('readDirDocsFull（角色卡编辑用，不截断）', () => {
  it('返回全文，不受预算限制', async () => {
    listDir.mockResolvedValue([entry('张三.md', `${ROOT}/角色`)])
    readFile.mockResolvedValue('x'.repeat(20000))
    const docs = await readDirDocsFull(ROOT, '角色')
    expect(docs[0].content).toHaveLength(20000)
    expect(docs[0].path).toBe(`${ROOT}/角色/张三.md`)
  })

  it('空卡片也保留（新建角色卡刚创建时没有内容）', async () => {
    listDir.mockResolvedValue([entry('新角色.md', `${ROOT}/角色`)])
    readFile.mockResolvedValue('')
    const docs = await readDirDocsFull(ROOT, '角色')
    expect(docs).toHaveLength(1)
    expect(docs[0].content).toBe('')
  })

  it('保持顺序', async () => {
    listDir.mockResolvedValue([
      entry('1.md', `${ROOT}/角色`),
      entry('2.md', `${ROOT}/角色`),
      entry('3.md', `${ROOT}/角色`),
    ])
    readFile.mockImplementation(async (p: string) => `内容:${p.split('/').pop()}`)
    const docs = await readDirDocsFull(ROOT, '角色', 3)
    expect(docs.map((d) => d.name)).toEqual(['1', '2', '3'])
  })
})

describe('readOverview', () => {
  it('返回去空白的项目概述', async () => {
    readFile.mockResolvedValue('  概述内容  \n')
    expect(await readOverview(ROOT)).toBe('概述内容')
  })
  it('不存在时返回空串', async () => {
    readFile.mockRejectedValue(new Error('no file'))
    expect(await readOverview(ROOT)).toBe('')
  })
})

describe('readChapterSlices', () => {
  const chapters = [
    { path: `${ROOT}/第1章.md`, name: '第1章.md' },
    { path: `${ROOT}/第2章.md`, name: '第2章.md' },
    { path: `${ROOT}/第3章.md`, name: '第3章.md' },
  ]

  it('fromEnd 取最后 N 章', async () => {
    readFile.mockImplementation(async (p: string) => `正文:${p}`)
    const slices = await readChapterSlices(ROOT, chapters, { count: 2, perChapterMax: 100, fromEnd: true })
    expect(slices.map((s) => s.name)).toEqual(['第2章.md', '第3章.md'])
  })

  it('preferSummary 优先读摘要库', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p.includes('.summaries')) return '这是摘要'
      return '这是全文'
    })
    const slices = await readChapterSlices(ROOT, chapters, {
      count: 1,
      perChapterMax: 100,
      preferSummary: true,
      tailFallback: true,
    })
    expect(slices[0]).toMatchObject({ content: '这是摘要', source: 'summary' })
  })

  it('无摘要时退回章尾片段', async () => {
    readFile.mockRejectedValue(new Error('no summary'))
    readFileTail.mockResolvedValue('章尾内容')
    const slices = await readChapterSlices(ROOT, chapters, {
      count: 1,
      perChapterMax: 100,
      preferSummary: true,
      tailFallback: true,
    })
    expect(slices[0]).toMatchObject({ content: '章尾内容', source: 'tail' })
  })

  it('无摘要且不取章尾时读整章开头', async () => {
    readFile.mockResolvedValue('全文内容')
    const slices = await readChapterSlices(ROOT, chapters, { count: 1, perChapterMax: 2 })
    expect(slices[0]).toMatchObject({ content: '全文', source: 'full' })
  })

  it('每章不超过 perChapterMax', async () => {
    readFile.mockResolvedValue('z'.repeat(500))
    const slices = await readChapterSlices(ROOT, chapters, { count: 3, perChapterMax: 10 })
    expect(slices.every((s) => s.content.length <= 10)).toBe(true)
  })

  it('读失败与空内容的章节被跳过', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p.includes('第1章')) throw new Error('boom')
      if (p.includes('第2章')) return '   '
      return '有内容'
    })
    const slices = await readChapterSlices(ROOT, chapters, { count: 3, perChapterMax: 10 })
    expect(slices.map((s) => s.name)).toEqual(['第3章.md'])
  })
})

describe('readRecap', () => {
  it('取当前章之前 N 章，由近及远', async () => {
    listDir.mockResolvedValue([
      { name: '第1章.md', path: `${ROOT}/第1章.md`, isDir: false },
      { name: '第2章.md', path: `${ROOT}/第2章.md`, isDir: false },
      { name: '第3章.md', path: `${ROOT}/第3章.md`, isDir: false },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p.includes('.summaries')) return '摘要'
      return '正文'
    })
    const recap = await readRecap(ROOT, `${ROOT}/第3章.md`, 2)
    expect(recap.map((r) => r.name)).toEqual(['第2章.md', '第1章.md'])
  })

  it('当前是第一章时返回空', async () => {
    listDir.mockResolvedValue([{ name: '第1章.md', path: `${ROOT}/第1章.md`, isDir: false }])
    expect(await readRecap(ROOT, `${ROOT}/第1章.md`, 3)).toEqual([])
  })

  it('count 为 0 或路径缺失时返回空', async () => {
    expect(await readRecap(ROOT, `${ROOT}/第2章.md`, 0)).toEqual([])
    expect(await readRecap(ROOT, undefined, 3)).toEqual([])
  })
})

describe('CONTEXT_BUDGETS 单一来源', () => {
  it('关键预算值固定（改动需同步 UI 文案与测试）', () => {
    expect(CONTEXT_BUDGETS.currentFile).toBe(8000)
    expect(CONTEXT_BUDGETS.dirTotal).toBe(30000)
    expect(CONTEXT_BUDGETS.total).toBe(60000)
    expect(CONTEXT_BUDGETS.detectionChapters).toBe(5)
  })
})
