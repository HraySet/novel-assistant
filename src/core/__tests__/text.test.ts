import { describe, it, expect } from 'vitest'
import { replaceFirst, truncateWithEllipsis, tailChars, cleanHeadingLine, sanitizeFileName, compareChapterNames, parseChineseNumber } from '../text'

describe('replaceFirst', () => {
  it('只替换第一处匹配', () => {
    expect(replaceFirst('他很冷。后来大家说他很冷。', '很冷', '很温和'))
      .toBe('他很温和。后来大家说他很冷。')
  })

  it('未找到时原样返回', () => {
    const text = '无关内容'
    expect(replaceFirst(text, '不存在', 'X')).toBe(text)
  })

  it('空查找串不改变原文（避免插入到开头）', () => {
    expect(replaceFirst('abc', '', 'X')).toBe('abc')
  })

  it('替换串为空等于删除该处', () => {
    expect(replaceFirst('甲乙丙', '乙', '')).toBe('甲丙')
  })

  it('回写角色卡场景：同一句设定出现两次只改第一处', () => {
    const card = '# 张三\n- 性格：沉默寡言\n\n## 关系\n- 与李四：都说他沉默寡言\n'
    const next = replaceFirst(card, '沉默寡言', '外冷内热')
    expect(next.match(/外冷内热/g)).toHaveLength(1)
    expect(next.match(/沉默寡言/g)).toHaveLength(1)
  })
})

describe('truncateWithEllipsis', () => {
  it('超长时截断并加省略号', () => {
    expect(truncateWithEllipsis('12345', 3)).toBe('123…')
  })
  it('不超长时原样返回', () => {
    expect(truncateWithEllipsis('123', 3)).toBe('123')
  })
  it('max 为 0 返回空串', () => {
    expect(truncateWithEllipsis('123', 0)).toBe('')
  })
})

describe('tailChars', () => {
  it('取末尾 n 个字符', () => {
    expect(tailChars('一二三四五', 2)).toBe('四五')
  })
  it('短于 n 时返回全部', () => {
    expect(tailChars('一二', 5)).toBe('一二')
  })
  it('n 为 0 返回空串', () => {
    expect(tailChars('一二', 0)).toBe('')
  })
})

describe('cleanHeadingLine', () => {
  it('去掉各级标题标记', () => {
    expect(cleanHeadingLine('## 第二章 夜行')).toBe('第二章 夜行')
    expect(cleanHeadingLine('###### 深层标题')).toBe('深层标题')
  })
  it('普通行只去空白', () => {
    expect(cleanHeadingLine('  正文  ')).toBe('正文')
  })
})

describe('sanitizeFileName', () => {
  it('去掉 Windows 非法字符', () => {
    expect(sanitizeFileName('第1章:开端')).toBe('第1章开端')
    expect(sanitizeFileName('a<b>c"d/e\\f|g?h*i')).toBe('abcdefghi')
  })

  it('压缩空白并去首尾空格', () => {
    expect(sanitizeFileName('  第 一 章  ')).toBe('第 一 章')
  })

  it('去掉结尾的点与空格（Windows 不允许）', () => {
    expect(sanitizeFileName('第一章...')).toBe('第一章')
    expect(sanitizeFileName('第一章 。')).toBe('第一章 。')
  })

  it('限制长度', () => {
    expect(sanitizeFileName('字'.repeat(200))).toHaveLength(80)
  })

  it('全是非法字符时返回空串（调用方据此回退原名）', () => {
    expect(sanitizeFileName(':::')).toBe('')
  })
})

describe('parseChineseNumber', () => {
  it('个位数与十位', () => {
    expect(parseChineseNumber('一')).toBe(1)
    expect(parseChineseNumber('九')).toBe(9)
    expect(parseChineseNumber('十')).toBe(10)
    expect(parseChineseNumber('十一')).toBe(11)
    expect(parseChineseNumber('二十')).toBe(20)
    expect(parseChineseNumber('二十三')).toBe(23)
  })

  it('百位与千位', () => {
    expect(parseChineseNumber('一百')).toBe(100)
    expect(parseChineseNumber('一百零五')).toBe(105)
    expect(parseChineseNumber('三百二十一')).toBe(321)
    expect(parseChineseNumber('一千零一')).toBe(1001)
  })

  it('非中文数字返回 null', () => {
    expect(parseChineseNumber('楔子')).toBeNull()
    expect(parseChineseNumber('')).toBeNull()
    expect(parseChineseNumber('abc')).toBeNull()
  })
})

describe('compareChapterNames：章节排序', () => {
  const sort = (names: string[]) => [...names].sort(compareChapterNames)

  it('中文数字章节按数值排序（此前按拼音乱序）', () => {
    expect(sort(['第一章', '第二章', '第十章', '第十一章', '第二十章'])).toEqual([
      '第一章', '第二章', '第十章', '第十一章', '第二十章',
    ])
  })

  it('阿拉伯数字章节保持正确（回归）', () => {
    expect(sort(['第10章', '第2章', '第1章', '第20章'])).toEqual([
      '第1章', '第2章', '第10章', '第20章',
    ])
  })

  it('阿拉伯数字与中文数字可以混排', () => {
    expect(sort(['第3章', '第二章', '第1章', '第一章'])).toEqual([
      '第1章', '第一章', '第二章', '第3章',
    ])
  })

  it('带扩展名同样正确', () => {
    expect(sort(['第10章.md', '第2章.md', '第1章.md'])).toEqual([
      '第1章.md', '第2章.md', '第10章.md',
    ])
  })

  it('卷名与章名各自按数值排序', () => {
    expect(sort(['第三卷', '第一卷', '第十卷'])).toEqual(['第一卷', '第三卷', '第十卷'])
  })

  it('无数字的名称不被打乱（楔子/番外）', () => {
    const out = sort(['第1章', '楔子', '第2章'])
    expect(out).toHaveLength(3)
    expect(out.filter((n) => n.startsWith('第'))).toEqual(['第1章', '第2章'])
  })
})
