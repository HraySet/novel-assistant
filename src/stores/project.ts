import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ProjectEntry } from '../types/project'

// 旧版本用 localStorage 存的 key，仅用于一次性迁移
const LEGACY_INDEX_KEY = 'project-index.json'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<ProjectEntry[]>([])
  const currentProject = ref<ProjectEntry | null>(null)

  async function loadIndex() {
    // 优先从 Rust 配置目录读取
    try {
      const stored = await invoke<ProjectEntry[]>('get_project_index')
      if (Array.isArray(stored) && stored.length > 0) {
        projects.value = stored
        return
      }
    } catch { /* 读不到则回退到迁移 */ }

    // 一次性迁移旧的 localStorage 数据
    try {
      const legacy = localStorage.getItem(LEGACY_INDEX_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (Array.isArray(parsed)) {
          projects.value = parsed
          await saveIndex()
          localStorage.removeItem(LEGACY_INDEX_KEY)
        }
      }
    } catch { /* 迁移失败不阻塞 */ }
  }

  async function saveIndex() {
    try {
      await invoke('save_project_index', { index: projects.value })
    } catch (e) {
      console.error('保存项目索引失败:', e)
    }
  }

  function addProject(project: ProjectEntry) {
    const existing = projects.value.find(p => p.path === project.path)
    if (existing) {
      existing.name = project.name
      existing.lastOpened = project.lastOpened
      existing.wordCount = project.wordCount
      existing.broken = false
    } else {
      projects.value.push(project)
    }
    // 按最近打开排序
    projects.value.sort((a, b) =>
      new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    )
    saveIndex()
  }

  function removeProject(path: string) {
    projects.value = projects.value.filter(p => p.path !== path)
    saveIndex()
  }

  function markOpened(path: string) {
    const p = projects.value.find(p => p.path === path)
    if (p) {
      p.lastOpened = new Date().toISOString()
      saveIndex()
    }
  }

  return {
    projects,
    currentProject,
    loadIndex,
    saveIndex,
    addProject,
    removeProject,
    markOpened,
  }
})
