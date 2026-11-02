import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/files', () => ({
  listDir: vi.fn(async () => []),
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  createFile: vi.fn(async () => undefined),
  createDir: vi.fn(async () => undefined),
  deletePath: vi.fn(async () => undefined),
  renamePath: vi.fn(async () => undefined),
  movePath: vi.fn(async () => undefined),
  readFileTail: vi.fn(async () => ''),
  fileMtime: vi.fn(async () => null),
}))

import * as api from '../api/files'
import { useFileStore } from './file'
import { useStatsStore } from './stats'

const ROOT = '/p'
const DIR = `${ROOT}/卷1`
const CH1 = `${DIR}/第1章.md`
const CH2 = `${DIR}/第2章.md`
const OUT = `${ROOT}/第3章.md`

function seed() {
  setActivePinia(createPinia())
  const store = useFileStore()
  store.setTree(
    [
      {
        name: '卷1',
        path: DIR,
        isDir: true,
        children: [
          { name: '第1章.md', path: CH1, isDir: false, wordCount: 100 },
          { name: '第2章.md', path: CH2, isDir: false, wordCount: 100 },
        ],
      },
      { name: '第3章.md', path: OUT, isDir: false, wordCount: 100 },
    ],
    ROOT,
  )
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('renamePath：目录重命名的路径迁移', () => {
  it('目录内已打开的标签跟随迁移（此前只做精确匹配，标签全部失联）', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: '正文一', isDirty: false })
    store.setOpenFile({ path: CH2, name: '第2章.md', content: '正文二', isDirty: true })

    await store.renamePath(DIR, '第一卷')

    expect(store.openFiles.map((f) => f.path)).toEqual([
      `${ROOT}/第一卷/第1章.md`,
      `${ROOT}/第一卷/第2章.md`,
    ])
    expect(store.openFiles[1].isDirty).toBe(true) // 脏标记不能因为迁移丢失
    expect(store.openFiles[1].name).toBe('第2章.md')
  })

  it('活动文件迁移后仍指向同一份内容', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: '编辑器内容', isDirty: true })

    await store.renamePath(DIR, '第一卷')

    expect(store.openFile?.path).toBe(`${ROOT}/第一卷/第1章.md`)
    expect(store.openFile?.content).toBe('编辑器内容')
  })

  it('后退历史与选区路径同步迁移', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })
    store.setOpenFile({ path: CH2, name: '第2章.md', content: 'b', isDirty: false })
    store.setSelectedPath(CH2)

    await store.renamePath(DIR, '第一卷')

    expect(store.openHistory).toEqual([`${ROOT}/第一卷/第1章.md`, `${ROOT}/第一卷/第2章.md`])
    expect(store.selectedPath).toBe(`${ROOT}/第一卷/第2章.md`)
  })

  it('收藏路径迁移（避免收藏里留下打不开的旧路径）', async () => {
    const store = seed()
    store.toggleFavorite(CH1)
    expect(store.isFavorite(CH1)).toBe(true)

    await store.renamePath(DIR, '第一卷')

    expect(store.isFavorite(CH1)).toBe(false)
    expect(store.isFavorite(`${ROOT}/第一卷/第1章.md`)).toBe(true)
  })

  it('统计快照 key 迁移（避免重命名后今日字数被重复计入）', async () => {
    const store = seed()
    const stats = useStatsStore()
    stats.syncChapterSnapshot(CH1, 1000)

    await store.renamePath(DIR, '第一卷')

    // 迁移后按新路径记录增量应基于旧快照，而不是从 0 重算
    stats.recordChapterEdit(`${ROOT}/第一卷/第1章.md`, 1100)
    expect(stats.todayWords).toBe(100)
  })

  it('无关路径不受影响', async () => {
    const store = seed()
    store.setOpenFile({ path: OUT, name: '第3章.md', content: 'c', isDirty: false })

    await store.renamePath(DIR, '第一卷')

    expect(store.openFile?.path).toBe(OUT)
  })
})

describe('deletePath：删除目录后的清理', () => {
  it('目录内打开的标签被移除，活动文件回退到剩余标签', async () => {
    const store = seed()
    store.setOpenFile({ path: OUT, name: '第3章.md', content: 'c', isDirty: false })
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })

    await store.deletePath(DIR)

    expect(store.openFiles.map((f) => f.path)).toEqual([OUT])
    expect(store.openFile?.path).toBe(OUT)
  })

  it('收藏、展开状态与统计快照中的相关项被清理', async () => {
    const store = seed()
    const stats = useStatsStore()
    store.toggleFavorite(CH1)
    store.expandPath(DIR)
    stats.syncChapterSnapshot(CH1, 500)

    await store.deletePath(DIR)

    expect(store.isFavorite(CH1)).toBe(false)
    expect(store.expandedPaths).not.toContain(DIR)
    // 删除后重建同名文件不应沿用旧快照
    stats.recordChapterEdit(CH1, 800)
    expect(stats.todayWords).toBe(0)
  })

  it('删除单个文件只影响它自己', async () => {
    const store = seed()
    store.setOpenFile({ path: OUT, name: '第3章.md', content: 'c', isDirty: false })

    await store.deletePath(CH1)

    expect(store.openFiles.map((f) => f.path)).toEqual([OUT])
  })
})

describe('movePath：目录移动（原有能力，补回归）', () => {
  it('整棵子树的打开标签跟随移动', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })

    await store.movePath(DIR, ROOT)

    expect(store.openFiles[0].path).toBe(`${ROOT}/卷1/第1章.md`)
  })
})

describe('项目切换重置', () => {
  it('重置后不残留上一个项目的标签与活动文件', () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })
    store.setOpenFile({ path: OUT, name: '第3章.md', content: 'c', isDirty: false })

    store.resetForProject('/other')

    expect(store.openFiles).toEqual([])
    expect(store.openFile).toBeNull()
    expect(store.openHistory).toEqual([])
    expect(store.tree).toEqual([])
    expect(store.projectRoot).toBe('/other')
  })
})

describe('closeFile：与 Ctrl+W 走同一条保存路径', () => {
  it('脏文件先落盘再关闭（此前点标签 × 直接移除，1 秒防抖内的内容会丢）', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: '打开时的内容', isDirty: true })
    // 零拷贝提供者返回编辑器里的最新文本
    store.registerContentProvider(CH1, () => '刚打的一句话')

    await store.closeFile(CH1)

    expect(api.writeFile).toHaveBeenCalledWith(CH1, '刚打的一句话')
    expect(store.openFiles.some((f) => f.path === CH1)).toBe(false)
  })

  it('保存失败时保持标签打开，不静默丢内容', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: '旧内容', isDirty: true })
    vi.mocked(api.writeFile).mockRejectedValueOnce(new Error('磁盘已满'))

    await store.closeFile(CH1)

    expect(store.openFiles.some((f) => f.path === CH1)).toBe(true)
  })

  it('干净文件直接关闭，不产生无谓写盘', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: '已保存', isDirty: false })

    await store.closeFile(CH1)

    expect(api.writeFile).not.toHaveBeenCalled()
    expect(store.openFiles.some((f) => f.path === CH1)).toBe(false)
  })

  it('关闭非活动标签时其余标签不受影响', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })
    store.setOpenFile({ path: CH2, name: '第2章.md', content: 'b', isDirty: false })

    await store.closeFile(CH1)

    expect(store.openFiles.map((f) => f.path)).toEqual([CH2])
    expect(store.openFile?.path).toBe(CH2)
  })
})

describe('handleFileSelect：打开失败要有反馈', () => {
  it('读取失败时保持当前文件，并把失效路径从最近记录里剔除', async () => {
    const store = seed()
    store.setOpenFile({ path: CH1, name: '第1章.md', content: 'a', isDirty: false })
    store.setOpenFile({ path: OUT, name: '第3章.md', content: 'c', isDirty: false })
    // 回到 CH1，让 OUT 留在最近记录里
    await store.handleFileSelect(CH1)
    expect(store.openHistory).toContain(OUT)

    vi.mocked(api.readFile).mockRejectedValueOnce(new Error('No such file'))
    await store.handleFileSelect(OUT)

    expect(store.openFile?.path).toBe(CH1)
    expect(store.openHistory).not.toContain(OUT)
  })
})

describe('confirmRename：改名走与标题栏相同的清洗规则', () => {
  it('冒号等非法字符自动去掉，而不是报「重命名失败」', async () => {
    const store = seed()
    store.startRename(CH1)

    await store.confirmRename('第1章:开端')

    expect(api.renamePath).toHaveBeenCalledWith(CH1, `${DIR}/第1章开端.md`)
  })

  it('名字被改到丢掉扩展名时自动补回', async () => {
    const store = seed()
    store.startRename(CH1)

    await store.confirmRename('第2章.')

    expect(api.renamePath).toHaveBeenCalledWith(CH1, `${DIR}/第2章.md`)
  })

  it('清洗后与原名相同则不发起重命名', async () => {
    const store = seed()
    store.startRename(CH1)

    await store.confirmRename('第1章.md')

    expect(api.renamePath).not.toHaveBeenCalled()
  })
})

describe('confirmDraft：同名冲突不能静默通过', () => {
  it('同名文件夹不发起创建（create_dir_all 对已存在目录不会报错）', async () => {
    const store = seed()
    store.startDraft('dir', ROOT)

    await store.confirmDraft('卷1')

    expect(api.createDir).not.toHaveBeenCalled()
  })

  it('同名文件也不发起创建', async () => {
    const store = seed()
    store.startDraft('file', DIR)

    await store.confirmDraft('第1章.md')

    expect(api.createFile).not.toHaveBeenCalled()
  })

  it('不重名时正常创建并打开', async () => {
    const store = seed()
    store.startDraft('file', DIR)

    await store.confirmDraft('第9章.md')

    expect(api.createFile).toHaveBeenCalledWith(`${DIR}/第9章.md`)
  })
})
