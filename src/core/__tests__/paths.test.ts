import { describe, it, expect } from 'vitest'
import {
  stripVerbatimPrefix,
  normalize,
  detectStyle,
  sepOf,
  samePath,
  joinPath,
  dirname,
  basename,
  isInside,
  remapPath,
  remapPaths,
  toRelativePath,
  undoFileName,
} from '../paths'

/**
 * 路径工具的契约测试。
 *
 * 重点覆盖两个曾造成真实 bug 的差异：
 * 1. Rust canonicalize 返回的 `\\?\` 前缀导致与用户选择的项目根字符串比较失败
 *    （回收站里显示原始 UNC 路径）；
 * 2. 重命名目录时只做精确匹配、没有前缀映射，导致子文件标签失联。
 */

describe('stripVerbatimPrefix / normalize', () => {
  it('去掉 Windows 扩展长度前缀', () => {
    expect(stripVerbatimPrefix(String.raw`\\?\E:\书\长篇`)).toBe(String.raw`E:\书\长篇`)
    expect(stripVerbatimPrefix('//?/E:/书/长篇')).toBe('E:/书/长篇')
  })

  it('反斜杠统一为正斜杠', () => {
    expect(normalize(String.raw`E:\书\长篇\第1章.md`)).toBe('E:/书/长篇/第1章.md')
  })

  it('带 \\\\?\\ 前缀与不带前缀的路径规范化后相等（修复回收站路径显示）', () => {
    const fromRust = String.raw`\\?\E:\书\长篇\.trash\1_第1章.md`
    const fromDialog = String.raw`E:\书\长篇`
    expect(normalize(fromRust).startsWith(normalize(fromDialog))).toBe(true)
  })

  it('去尾部斜杠但保留盘符根', () => {
    expect(normalize('E:/书/')).toBe('E:/书')
    expect(normalize('E:/')).toBe('E:/')
    expect(normalize('/')).toBe('/')
  })

  it('空串安全', () => {
    expect(normalize('')).toBe('')
  })
})

describe('detectStyle / sepOf', () => {
  it('含反斜杠判定 win32', () => expect(detectStyle(String.raw`E:\a`)).toBe('win32'))
  it('盘符 + 正斜杠仍判定 posix（风格看实际分隔符，不看盘符）', () => {
    expect(detectStyle('E:/a')).toBe('posix')
    expect(sepOf('E:/a')).toBe('/')
  })
  it('纯正斜杠判定 posix', () => expect(detectStyle('/home/u/a')).toBe('posix'))
  it('分隔符跟随风格', () => {
    expect(sepOf(String.raw`E:\a`)).toBe('\\')
    expect(sepOf('/home/u')).toBe('/')
  })
})

describe('samePath', () => {
  it('忽略风格与前缀差异', () => {
    expect(samePath(String.raw`\\?\E:\书\长篇\第1章.md`, 'E:/书/长篇/第1章.md')).toBe(true)
  })
  it('不同路径返回 false', () => {
    expect(samePath('E:/a/b.md', 'E:/a/c.md')).toBe(false)
  })
  it('空值返回 false', () => {
    expect(samePath('', 'E:/a')).toBe(false)
    expect(samePath(undefined, 'E:/a')).toBe(false)
  })
})

describe('joinPath（保持父路径风格）', () => {
  it('Windows 父路径用反斜杠', () => {
    expect(joinPath(String.raw`E:\书`, '第1章.md')).toBe(String.raw`E:\书\第1章.md`)
  })
  it('posix 父路径用正斜杠', () => {
    expect(joinPath('/home/u', 'a.md')).toBe('/home/u/a.md')
  })
  it('父路径已带分隔符不重复添加', () => {
    expect(joinPath('E:/书/', 'a.md')).toBe('E:/书/a.md')
    expect(joinPath('E:\\书\\', 'a.md')).toBe(String.raw`E:\书\a.md`)
  })
  it('空父路径原样返回 name', () => {
    expect(joinPath('', 'a.md')).toBe('a.md')
  })
})

describe('dirname / basename', () => {
  it('两种风格都正确', () => {
    expect(dirname(String.raw`E:\书\卷1\第1章.md`)).toBe(String.raw`E:\书\卷1`)
    expect(dirname('/home/u/a.md')).toBe('/home/u')
    expect(basename(String.raw`E:\书\卷1\第1章.md`)).toBe('第1章.md')
    expect(basename('/home/u/a.md')).toBe('a.md')
  })
  it('无父目录时返回空串', () => {
    expect(dirname('a.md')).toBe('')
  })
})

describe('isInside（边界必须严格）', () => {
  it('子路径在内', () => {
    expect(isInside('E:/书', 'E:/书/第1章.md')).toBe(true)
    expect(isInside(String.raw`E:\书`, String.raw`E:\书\卷1\a.md`)).toBe(true)
  })
  it('相等不算在内', () => {
    expect(isInside('E:/书', 'E:/书')).toBe(false)
  })
  it('前缀相似但不是子目录（/a/bc 不在 /a/b 内）', () => {
    expect(isInside('E:/书/卷1', 'E:/书/卷11/a.md')).toBe(false)
  })
  it('兄弟目录不在内', () => {
    expect(isInside('E:/书/卷1', 'E:/书/卷2/a.md')).toBe(false)
  })
})

describe('remapPath（重命名/移动的唯一入口）', () => {
  it('单点重命名', () => {
    expect(remapPath(String.raw`E:\书\第1章.md`, String.raw`E:\书\第1章.md`, String.raw`E:\书\序章.md`))
      .toBe(String.raw`E:\书\序章.md`)
  })

  it('目录重命名时子树整体迁移（修复子文件标签失联）', () => {
    const from = String.raw`E:\书\卷1`
    const to = String.raw`E:\书\第一卷`
    expect(remapPath(String.raw`E:\书\卷1\第1章.md`, from, to)).toBe(String.raw`E:\书\第一卷\第1章.md`)
    expect(remapPath(String.raw`E:\书\卷1\子目录\a.md`, from, to)).toBe(String.raw`E:\书\第一卷\子目录\a.md`)
  })

  it('前缀相似但不属于该子树时原样返回', () => {
    expect(remapPath('E:/书/卷11/a.md', 'E:/书/卷1', 'E:/书/第一卷')).toBe('E:/书/卷11/a.md')
  })

  it('不相关路径原样返回', () => {
    expect(remapPath('E:/书/第3章.md', 'E:/书/卷1', 'E:/书/第一卷')).toBe('E:/书/第3章.md')
  })

  it('同一目录内移动保持风格', () => {
    expect(remapPath('/p/卷1/a.md', '/p/卷1', '/p/卷2')).toBe('/p/卷2/a.md')
  })

  it('忽略 \\\\?\\ 前缀差异仍能识别子树', () => {
    expect(remapPath(String.raw`\\?\E:\书\卷1\a.md`, String.raw`E:\书\卷1`, String.raw`E:\书\卷2`))
      .toBe(String.raw`E:\书\卷2\a.md`)
  })
})

describe('remapPaths', () => {
  it('批量迁移并保留无关项', () => {
    const input = ['E:/书/卷1/a.md', 'E:/书/卷1/b.md', 'E:/书/第3章.md']
    expect(remapPaths(input, 'E:/书/卷1', 'E:/书/第一卷')).toEqual([
      'E:/书/第一卷/a.md',
      'E:/书/第一卷/b.md',
      'E:/书/第3章.md',
    ])
  })
})

describe('toRelativePath / undoFileName（撤销历史命名，T1 定稿锚点）', () => {
  // 定稿锚点：这些测试向量是前后端（JS encodeURIComponent 与 Rust encode_uri_component）
  // 的「定稿」判据，改这里等于改命名契约。
  it('toRelativePath 统一正斜杠并去盘符', () => {
    expect(toRelativePath(String.raw`E:\book`, String.raw`E:\book\第1章.md`)).toBe('第1章.md')
    expect(toRelativePath('E:/book', 'E:/book/卷1/第2章.md')).toBe('卷1/第2章.md')
  })

  it('undoFileName 输出与 encodeURIComponent 保留集一致', () => {
    // 保留集 A-Za-z0-9-_.!~*'() 不编码
    expect(undoFileName('第1章.md')).toBe('%E7%AC%AC1%E7%AB%A0.md.json')
    expect(undoFileName('卷1/第2章.md')).toBe('%E5%8D%B71%2F%E7%AC%AC2%E7%AB%A0.md.json')
    expect(undoFileName('a b.md')).toBe('a%20b.md.json')
    expect(undoFileName('a!b.md')).toBe('a!b.md.json')   // ! 不编码
    expect(undoFileName("a'b.md")).toBe("a'b.md.json")   // ' 不编码
    expect(undoFileName('a*b.md')).toBe('a*b.md.json')   // * 不编码
    expect(undoFileName('a(b).md')).toBe('a(b).md.json') // ( ) 不编码
    expect(undoFileName('a~b.md')).toBe('a~b.md.json')   // ~ 不编码
  })

  it('undoFileName 对反斜杠/盘符路径编码（跨平台稳定）', () => {
    // 反斜杠编码为 %5C，正斜杠 %2F，冒号 %3A
    expect(undoFileName(String.raw`卷1\第2章.md`)).toBe('%E5%8D%B71%5C%E7%AC%AC2%E7%AB%A0.md.json')
  })

  it('toRelativePath 在 path 不在 root 内时退化但统一分隔符', () => {
    expect(toRelativePath('E:/book', 'E:/other/a.md')).toBe('/other/a.md')
  })
})
