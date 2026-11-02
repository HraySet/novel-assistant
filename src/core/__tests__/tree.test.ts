import { describe, it, expect } from 'vitest'
import { walkFiles, pathsOf, chapterPaths, listFilesIn, TREE_POLICIES } from '../tree'
import { FIXTURE_ROOT, FIXTURE_TREE, CHAPTER_PATHS } from './fixtures/tree.fixture'

/**
 * 遍历行为契约。
 *
 * 这些断言就是「五种业务场景各自要什么」的唯一定义：
 * 任何一次对过滤规则的改动，都必须在这里体现为一次显式的、经过思考的 diff。
 */

describe('policy: chapters（正文）', () => {
  it('只取正文 md/txt，排除设定目录、_ 前缀与隐藏目录', () => {
    expect(pathsOf(walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters))).toEqual(CHAPTER_PATHS)
  })

  it('不返回目录节点', () => {
    const entries = walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters)
    expect(entries.every((e) => !e.isDir)).toBe(true)
  })

  it('relPath / parentRelPath / depth 正确', () => {
    const entries = walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters)
    const ch1 = entries.find((e) => e.name === '第1章.md')!
    expect(ch1.relPath).toBe('第一卷/第1章.md')
    expect(ch1.parentRelPath).toBe('第一卷')
    expect(ch1.depth).toBe(1)

    const ch3 = entries.find((e) => e.name === '第3章.md')!
    expect(ch3.relPath).toBe('第3章.md')
    expect(ch3.parentRelPath).toBe('')
    expect(ch3.depth).toBe(0)
  })

  it('保留节点上的 wordCount（供项目总字数汇总）', () => {
    const entries = walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters)
    expect(entries.find((e) => e.name === '第1章.md')!.wordCount).toBe(100)
    expect(entries.find((e) => e.name === '番外.txt')!.wordCount).toBe(50)
  })

  it('chapterPaths 便利函数与 walkFiles 结果一致', () => {
    expect(chapterPaths(FIXTURE_TREE)).toEqual(CHAPTER_PATHS)
  })

  it('保持输入顺序（树已由 file store 自然排序）', () => {
    const names = walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters).map((e) => e.name)
    expect(names).toEqual(['第1章.md', '第2章.md', '番外.txt', '第3章.md'])
  })
})

describe('policy: exportable（导出交付物）', () => {
  it('与 chapters 完全一致——导出不得包含角色卡/大纲/项目概述', () => {
    // 回归锚点：修复前 collectFilePaths 遍历整棵树，EPUB 里混进了 角色/大纲/_project.md
    expect(pathsOf(walkFiles(FIXTURE_TREE, TREE_POLICIES.exportable))).toEqual(CHAPTER_PATHS)
    expect(pathsOf(walkFiles(FIXTURE_TREE, TREE_POLICIES.exportable)))
      .toEqual(pathsOf(walkFiles(FIXTURE_TREE, TREE_POLICIES.chapters)))
  })

  it('不包含任何设定文件与项目概述', () => {
    const paths = pathsOf(walkFiles(FIXTURE_TREE, TREE_POLICIES.exportable))
    expect(paths.some((p) => p.includes('角色'))).toBe(false)
    expect(paths.some((p) => p.includes('大纲'))).toBe(false)
    expect(paths.some((p) => p.includes('_project'))).toBe(false)
  })
})

describe('policy: settings（设定目录内部）', () => {
  it('取 md/txt，排除图片等非文本', () => {
    const entries = walkFiles(
      [{ name: '角色', path: `${FIXTURE_ROOT}\\角色`, isDir: true, children: [
        { name: '张三.md', path: `${FIXTURE_ROOT}\\角色\\张三.md`, isDir: false },
        { name: '说明.txt', path: `${FIXTURE_ROOT}\\角色\\说明.txt`, isDir: false },
        { name: 'logo.png', path: `${FIXTURE_ROOT}\\角色\\logo.png`, isDir: false },
      ] }],
      TREE_POLICIES.settings,
    )
    expect(entries.map((e) => e.name)).toEqual(['张三.md', '说明.txt'])
  })

  it('listFilesIn 用于单目录内文件名列表', () => {
    const entries = listFilesIn(`${FIXTURE_ROOT}\\角色`, ['张三.md', '李四.md', 'logo.png'])
    expect(entries.map((e) => e.path)).toEqual([
      `${FIXTURE_ROOT}\\角色\\张三.md`,
      `${FIXTURE_ROOT}\\角色\\李四.md`,
    ])
  })
})

describe('policy: allFiles（浏览/搜索）', () => {
  it('包含目录节点（搜索需要能跳到文件夹）', () => {
    const entries = walkFiles(FIXTURE_TREE, TREE_POLICIES.allFiles)
    expect(entries.some((e) => e.isDir && e.name === '第一卷')).toBe(true)
    expect(entries.some((e) => e.isDir && e.name === '废弃')).toBe(true)
  })

  it('包含非文本文件与 _ 前缀文件', () => {
    const names = walkFiles(FIXTURE_TREE, TREE_POLICIES.allFiles).map((e) => e.name)
    expect(names).toContain('封面.png')
    expect(names).toContain('_project.md')
  })

  it('排除隐藏目录（.stats）', () => {
    const names = walkFiles(FIXTURE_TREE, TREE_POLICIES.allFiles).map((e) => e.name)
    expect(names).not.toContain('.stats')
    expect(names).not.toContain('stats.json')
  })
})

describe('策略可组合', () => {
  it('放开 excludeDirs 后设定目录会进入结果（说明过滤点唯一）', () => {
    const entries = walkFiles(FIXTURE_TREE, {
      ...TREE_POLICIES.chapters,
      excludeDirs: [],
    })
    const names = entries.map((e) => e.name)
    expect(names).toContain('张三.md')
    expect(names).toContain('主线.md')
    expect(names).toContain('第1章.md')
  })
})

describe('边界', () => {
  it('空树返回空数组', () => {
    expect(walkFiles([], TREE_POLICIES.chapters)).toEqual([])
  })

  it('目录但 children 为 undefined 不报错', () => {
    const entries = walkFiles(
      [{ name: '空目录', path: `${FIXTURE_ROOT}\\空目录`, isDir: true }],
      TREE_POLICIES.allFiles,
    )
    expect(entries.map((e) => e.name)).toEqual(['空目录'])
  })

  it('扩展名大小写不敏感（.MD 也算正文）', () => {
    const entries = walkFiles(
      [{ name: '第4章.MD', path: `${FIXTURE_ROOT}\\第4章.MD`, isDir: false }],
      TREE_POLICIES.chapters,
    )
    expect(entries).toHaveLength(1)
  })
})
