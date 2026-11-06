// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HistoryModal from '../HistoryModal.vue'

vi.mock('../../api/files', () => ({
  listBackups: vi.fn(async () => []),
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
}))

import * as api from '../../api/files'

// BaseModal 用 Teleport 渲染到 body，且带 Transition 动画，直接 stub 成透传容器，
// 让 HistoryModal 的内容直接渲染在 wrapper 内，便于断言。
const baseModalStub = {
  props: ['show'],
  template: '<div class="base-modal-stub"><slot /></div>',
}

/**
 * HistoryModal 组件级测试（T6）。
 *
 * 这是「历史版本恢复」的入口，写错会把旧版本内容覆盖到当前正文——数据安全核心。
 * 重点锁定三个易丢数据的守卫：
 * 1. selectBackup 读失败时 preview 清空（不残留上一个备份内容）；
 * 2. previewReady=false 时禁止恢复；
 * 3. 恢复成功发出 restored 事件并携带正确内容。
 */

describe('HistoryModal 历史版本恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  function makeBackup(ts: number): api.BackupEntry {
    return { path: `/b/${ts}_第1章.md`, timestamp: ts }
  }

  function mountModal(props: Record<string, unknown> = {}) {
    return mount(HistoryModal, {
      props: { show: true, filePath: '/p/第1章.md', ...props },
      global: { stubs: { BaseModal: baseModalStub } },
    })
  }

  it('无备份时显示空态，恢复按钮禁用', async () => {
    vi.mocked(api.listBackups).mockResolvedValueOnce([])
    const w = mountModal()
    await flushPromises()
    expect(w.text()).toContain('暂无备份')
    expect(w.find('.hist-btn--primary').attributes('disabled')).toBeDefined()
  })

  it('读备份失败时 preview 清空，恢复按钮保持禁用（不残留上一版本内容）', async () => {
    const b1 = makeBackup(1000)
    const b2 = makeBackup(2000)
    vi.mocked(api.listBackups).mockResolvedValueOnce([b1, b2])
    // load() 顺序：selectBackup(b1) 读预览 → readFile 读 currentContent；
    // 之后点 b2 时 selectBackup(b2) 读预览（失败）
    vi.mocked(api.readFile)
      .mockResolvedValueOnce('版本1内容')    // b1 预览（selectBackup 先执行）
      .mockResolvedValueOnce('第一章正文')   // currentContent（load 后执行）
      .mockRejectedValueOnce(new Error('读取失败')) // b2 预览失败

    const w = mountModal()
    await flushPromises()

    // 默认选中第一个备份，预览就绪，恢复按钮可点
    expect(w.find('.hist-btn--primary').attributes('disabled')).toBeUndefined()

    // 切到第二个备份（读取失败）
    const items = w.findAll('.hist-item')
    await items[1].trigger('click')
    await flushPromises()

    // 读取失败：恢复按钮应重新禁用（previewReady=false，防止把上一版本写进正文）
    expect(w.find('.hist-btn--primary').attributes('disabled')).toBeDefined()
  })

  it('恢复成功发出 restored 事件，携带预览内容并调用 writeFile', async () => {
    const b1 = makeBackup(1000)
    vi.mocked(api.listBackups).mockResolvedValueOnce([b1])
    // load() 顺序：selectBackup 先读 b1 预览，再读 currentContent
    vi.mocked(api.readFile)
      .mockResolvedValueOnce('历史版本内容') // b1 预览（selectBackup 先执行）
      .mockResolvedValueOnce('当前正文')     // currentContent（load 后执行）

    const w = mountModal()
    await flushPromises()

    await w.find('.hist-btn--primary').trigger('click')
    await flushPromises()

    expect(api.writeFile).toHaveBeenCalledWith('/p/第1章.md', '历史版本内容')
    const emitted = w.emitted('restored') as unknown[][]
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toBe('历史版本内容')
  })
})
