import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProjectEntry } from '../types/project'

const INDEX_PATH = 'project-index.json'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<ProjectEntry[]>([])
  const currentProject = ref<ProjectEntry | null>(null)

  async function loadIndex() {
    // TODO: 从 Rust 配置目录读取索引
    const stored = localStorage.getItem(INDEX_PATH)
    if (stored) {
      projects.value = JSON.parse(stored)
    }
  }

  async function saveIndex() {
    // TODO: 写到 Rust 配置目录
    localStorage.setItem(INDEX_PATH, JSON.stringify(projects.value))
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
