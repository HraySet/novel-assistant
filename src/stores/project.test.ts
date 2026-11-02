import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/files', () => ({
  getProjectIndex: vi.fn(async () => []),
  saveProjectIndex: vi.fn(async () => undefined),
}))

import { useProjectStore } from './project'
import type { ProjectEntry } from '../types/project'

function entry(path: string, name = path.split('/').pop() || path): ProjectEntry {
  return { path, name, lastOpened: new Date().toISOString(), wordCount: 0, color: '#000' }
}

function seed() {
  setActivePinia(createPinia())
  return useProjectStore()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addProject', () => {
  it('同一路径再次添加是更新，不是插入第二张卡片', () => {
    const store = seed()
    store.addProject(entry('/books/长篇'))
    store.addProject({ ...entry('/books/长篇'), wordCount: 12345 })

    expect(store.projects).toHaveLength(1)
    expect(store.projects[0].wordCount).toBe(12345)
  })

  it('路径尾部分隔符不同也视为同一个项目', () => {
    const store = seed()
    store.addProject(entry('/books/长篇'))
    store.addProject(entry('/books/长篇/'))

    expect(store.projects).toHaveLength(1)
  })

  it('按最近打开时间倒序', () => {
    const store = seed()
    const oldOne = { ...entry('/a'), lastOpened: '2026-01-01T00:00:00.000Z' }
    const newOne = { ...entry('/b'), lastOpened: '2026-11-01T00:00:00.000Z' }
    store.addProject(oldOne)
    store.addProject(newOne)

    expect(store.projects.map((p) => p.path)).toEqual(['/b', '/a'])
  })
})

describe('removeProject', () => {
  it('只移除指定项目，其余保留', () => {
    const store = seed()
    store.addProject(entry('/a'))
    store.addProject(entry('/b'))

    store.removeProject('/a')

    expect(store.projects.map((p) => p.path)).toEqual(['/b'])
  })

  it('路径尾部分隔符不同也能移除（此前精确匹配会删不掉）', () => {
    const store = seed()
    store.addProject(entry('/books/长篇'))

    store.removeProject('/books/长篇/')

    expect(store.projects).toHaveLength(0)
  })
})

describe('updateProjectPath', () => {
  it('重新定位后路径与名称同步更新，失效标记清除', () => {
    const store = seed()
    store.addProject({ ...entry('/old/长篇'), broken: true })

    store.updateProjectPath('/old/长篇', '/new/新长篇')

    expect(store.projects[0].path).toBe('/new/新长篇')
    expect(store.projects[0].name).toBe('新长篇')
    expect(store.projects[0].broken).toBe(false)
  })
})
