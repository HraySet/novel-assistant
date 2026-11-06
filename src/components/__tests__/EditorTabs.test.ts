// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EditorTabs from '../EditorTabs.vue'

vi.mock('../../api/files', () => ({
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

import * as api from '../../api/files'
import { useFileStore } from '../../stores/file'

/**
 * EditorTabs 组件级测试（T6）。
 *
 * 标签关闭是「会丢数据」的关键入口：脏文件必须先落盘、失败则不关。
 * 这里锁定「关闭脏标签 → closeFile → 先 saveFile 落盘」这条路径，
 * 防止点 × 直接移除导致刚落笔的内容丢失。
 */

describe('EditorTabs 关闭标签的数据安全', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  function seedTabs() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFileStore()
    store.setTree(
      [
        { name: '第1章.md', path: '/p/第1章.md', isDir: false, wordCount: 100 },
        { name: '第2章.md', path: '/p/第2章.md', isDir: false, wordCount: 100 },
      ],
      '/p',
    )
    store.setOpenFile({ path: '/p/第1章.md', name: '第1章.md', content: '一', isDirty: false })
    store.setOpenFile({ path: '/p/第2章.md', name: '第2章.md', content: '二', isDirty: true })
    return { store, pinia }
  }

  it('渲染已打开的标签', () => {
    const { pinia } = seedTabs()
    const w = mount(EditorTabs, { global: { plugins: [pinia] } })
    const tabs = w.findAll('.tab-item')
    expect(tabs.length).toBe(2)
  })

  it('关闭脏标签会先落盘（走 closeFile 的保存路径）', async () => {
    const { store, pinia } = seedTabs()
    const w = mount(EditorTabs, { global: { plugins: [pinia] } })

    // 关闭第2章（脏标签）：点 ×
    const closeBtns = w.findAll('.tab-close')
    await closeBtns[1].trigger('click')
    await flushPromises()

    // closeFile 会先 saveFile 落盘，api.writeFile 被调用
    expect(api.writeFile).toHaveBeenCalled()
    // 关闭后第2章从 openFiles 移除
    expect(store.openFiles.some((f) => f.path === '/p/第2章.md')).toBe(false)
  })

  it('关闭不脏的标签不触发落盘', async () => {
    const { pinia } = seedTabs()
    const w = mount(EditorTabs, { global: { plugins: [pinia] } })

    const closeBtns = w.findAll('.tab-close')
    await closeBtns[0].trigger('click')  // 第1章（不脏）
    await flushPromises()

    expect(api.writeFile).not.toHaveBeenCalled()
  })
})
