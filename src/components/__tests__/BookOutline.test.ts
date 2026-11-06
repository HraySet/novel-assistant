// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BookOutline from '../BookOutline.vue'

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

import { useFileStore } from '../../stores/file'

/**
 * BookOutline（全书结构视图）组件测试。
 * 锁定：章节列表正确渲染（排除设定目录/`_` 前缀）、按卷目录分组、点击跳转。
 */

describe('BookOutline 全书结构视图', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  function seedTree() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFileStore()
    store.setTree(
      [
        {
          name: '第一卷',
          path: '/p/第一卷',
          isDir: true,
          children: [
            { name: '第1章.md', path: '/p/第一卷/第1章.md', isDir: false, wordCount: 1200 },
            { name: '第2章.md', path: '/p/第一卷/第2章.md', isDir: false, wordCount: 800 },
          ],
        },
        {
          name: '角色',
          path: '/p/角色',
          isDir: true,
          children: [{ name: '主角.md', path: '/p/角色/主角.md', isDir: false, wordCount: 500 }],
        },
        { name: '第3章.md', path: '/p/第3章.md', isDir: false, wordCount: 2000 },
        { name: '_project.md', path: '/p/_project.md', isDir: false, wordCount: 10 },
      ],
      '/p',
    )
    return store
  }

  it('渲染正文章节，排除设定目录与 _ 前缀文件', () => {
    seedTree()
    const w = mount(BookOutline)
    const text = w.text()
    expect(text).toContain('第1章')
    expect(text).toContain('第2章')
    expect(text).toContain('第3章')
    // 排除角色目录与 _project.md
    expect(text).not.toContain('主角')
    expect(text).not.toContain('_project')
  })

  it('按卷目录分组显示目录标题', () => {
    seedTree()
    const w = mount(BookOutline)
    const labels = w.findAll('.outline-dir-label')
    const names = labels.map((l) => l.text())
    // 第一卷 目录标题 + 根级「正文」目录标题
    expect(names).toContain('第一卷')
    expect(names).toContain('正文')
  })

  it('点击章节触发 handleFileSelect 跳转', async () => {
    const store = seedTree()
    const w = mount(BookOutline)
    const firstChapter = w.findAll('.outline-chapter')[0]
    await firstChapter.trigger('click')
    await flushPromises()
    expect(store.selectedPath).toBe('/p/第一卷/第1章.md')
  })

  it('空项目显示空态引导', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useFileStore()
    store.setTree([], '/p')
    const w = mount(BookOutline)
    expect(w.text()).toContain('还没有正文章节')
  })
})
