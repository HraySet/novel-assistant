import { describe, it, expect } from 'vitest'
import { replaceFirst, truncateWithEllipsis, tailChars, cleanHeadingLine } from '../text'

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
