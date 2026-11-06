// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffView from '../DiffView.vue'

/**
 * DiffView 组件级测试（T6）。
 *
 * 纯 diff 计算（computeDiff / mergeDiffLines / groupHunks）已有 useDiff.*.test.ts 护着，
 * 这里锁定「组件交互 → 合并结果」的链路——这是「应用修改」会真正落盘到正文的入口，
 * 勾选逻辑写错会写出病句/丢段落，属于「会丢数据」的关键组件。
 */

describe('DiffView 组件交互', () => {
  it('无修改时显示空态', () => {
    const w = mount(DiffView, { props: { oldText: '正文', newText: '正文', editable: true } })
    expect(w.text()).toContain('AI 未做出任何修改')
    expect(w.find('.diff-empty').exists()).toBe(true)
  })

  it('有修改时渲染修改处数，accept 发出合并后的全文', async () => {
    const w = mount(DiffView, {
      props: { oldText: '他走进房间。', newText: '他慢慢走进房间。', editable: true },
    })
    expect(w.text()).toContain('处修改')

    await w.find('.diff-btn--accept').trigger('click')
    const emitted = w.emitted('accept') as unknown[][]
    expect(emitted).toBeTruthy()
    // 未取消任何修改时，合并结果 = newText
    expect(emitted[0][0]).toBe('他慢慢走进房间。')
  })

  it('取消某处修改后 accept，合并结果回退该处为原文（不丢段落）', async () => {
    // 两处修改分处两行，各自形成独立修改块（勾选槽）
    const w = mount(DiffView, {
      props: {
        oldText: '他走进房间。\n坐在椅子上。',
        newText: '他慢慢走进房间。\n坐在破旧的椅子上。',
        editable: true,
      },
    })
    // 应有两个独立修改块（两个勾选槽）
    const toggles = w.findAll('.diff-toggle')
    expect(toggles.length).toBeGreaterThanOrEqual(2)

    // 取消第一处修改
    await toggles[0].trigger('click')

    await w.find('.diff-btn--accept').trigger('click')
    const emitted = w.emitted('accept') as unknown[][]
    expect(emitted).toBeTruthy()
    // 第一处回退原文「走进」，第二处保留「破旧的」
    expect(emitted[0][0]).toBe('他走进房间。\n坐在破旧的椅子上。')
  })

  it('只读模式（历史版本对比）不渲染操作栏，不触发 accept', () => {
    const w = mount(DiffView, { props: { oldText: 'a', newText: 'b', editable: false } })
    expect(w.find('.diff-footer').exists()).toBe(false)
  })

  it('全部取消时点应用 = 与原文一致，走 reject 而非 accept', async () => {
    const w = mount(DiffView, {
      props: { oldText: '他走进房间。', newText: '他慢慢走进房间，关上门。', editable: true },
    })
    // 把所有修改块都取消
    const toggles = w.findAll('.diff-toggle')
    for (const t of toggles) await t.trigger('click')

    await w.find('.diff-btn--accept').trigger('click')
    expect(w.emitted('reject')).toBeTruthy()
    expect(w.emitted('accept')).toBeFalsy()
  })
})
