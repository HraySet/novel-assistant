import { describe, it, expect } from 'vitest'
import { detectRole, preview, parseNameList } from '../parseCharacter'

describe('detectRole', () => {
  it('提取「定位」字段的角色类型并截前 6 字', () => {
    expect(detectRole('# 张三\n- 定位：主角\n- 外貌：\n')).toBe('主角')
    expect(detectRole('定位: 反派Boss')).toBe('反派Boss')
  })

  it('全角/半角冒号都识别', () => {
    expect(detectRole('- 定位：主角')).toBe('主角')
    expect(detectRole('- 定位: 配角')).toBe('配角')
  })

  it('超 6 字截断', () => {
    expect(detectRole('- 定位：这是一个很长的角色定位描述')).toBe('这是一个很长')
  })

  it('无定位字段回退「角色」', () => {
    expect(detectRole('# 张三\n- 外貌：高')).toBe('角色')
    expect(detectRole('')).toBe('角色')
  })
})

describe('preview', () => {
  it('取第一行有效文本（跳过标题与定位行）', () => {
    expect(preview('# 张三\n- 定位：主角\n这是人物简介。')).toBe('这是人物简介。')
  })

  it('截前 60 字', () => {
    const long = 'x'.repeat(100)
    expect(preview(long)).toBe('x'.repeat(60))
  })

  it('空内容回退「（空）」', () => {
    expect(preview('')).toBe('（空）')
    expect(preview('# 只有标题\n- 定位：主角')).toBe('（空）')
  })
})

describe('parseNameList', () => {
  it('解析纯 JSON 数组', () => {
    expect(parseNameList('["张三","李四"]')).toEqual(['张三', '李四'])
  })

  it('从前后混杂文本中提取数组', () => {
    expect(parseNameList('结果是：["张三","李四"]，请查收')).toEqual(['张三', '李四'])
  })

  it('过滤非字符串 / 过短 / 过长 / 纯数字项', () => {
    expect(parseNameList('["张三","A","这是七个字的角色名字啊","123",42,null]')).toEqual([
      '张三',
      '这是七个字的角色名字啊',
    ])
  })

  it('无方括号或非法 JSON 返回空数组', () => {
    expect(parseNameList('没有数组')).toEqual([])
    expect(parseNameList('[not json')).toEqual([])
    expect(parseNameList('')).toEqual([])
  })
})
