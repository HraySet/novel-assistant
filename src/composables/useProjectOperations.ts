import { ref, type Ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { useFileStore } from '../stores/file'
import { useStatsStore } from '../stores/stats'
import type { ProjectEntry } from '../types/project'
import { pickCoverColor } from '../types/project'
import * as api from '../api/files'

export function useProjectOperations(opts: {
  view: Ref<string>
  projects: Ref<ProjectEntry[]>
  currentProject: Ref<ProjectEntry | null>
}) {
  const projectStore = useProjectStore()
  const fileStore = useFileStore()
  const statsStore = useStatsStore()

  const showNewProjectDialog = ref(false)
  const newProjectPath = ref('')
  const newProjectName = ref('')

  async function loadFileTree() {
    if (!opts.currentProject.value) return
    try {
      await fileStore.loadTree(opts.currentProject.value.path)
    } catch (e) {
      console.error('加载文件树失败:', e)
    }
  }

  async function openProject(project: ProjectEntry) {
    opts.currentProject.value = project
    projectStore.markOpened(project.path)
    opts.view.value = 'editor'
    try {
      await api.setProjectPath(project.path)
      await loadFileTree()
      await statsStore.init(project.path)
    } catch (e) {
      console.error('打开项目失败:', e)
    }
  }

  async function handleNewProject() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const folder = await open({ directory: true, title: '选择新项目的存放位置' })
      if (!folder) return
      newProjectPath.value = typeof folder === 'string' ? folder : String(folder)
      newProjectName.value = ''
      showNewProjectDialog.value = true
    } catch (e) {
      console.error('新建项目失败:', e)
    }
  }

  async function confirmNewProject() {
    const name = newProjectName.value.trim()
    if (!name) return
    showNewProjectDialog.value = false
    const projectPath = `${newProjectPath.value}/${name}`
    const project: ProjectEntry = {
      path: projectPath, name,
      lastOpened: new Date().toISOString(),
      wordCount: 0,
      color: pickCoverColor(opts.projects.value.length),
    }
    opts.projects.value = [...opts.projects.value, project]
    projectStore.addProject(project)
    await openProject(project)
  }

  async function handleAddProject() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const folder = await open({ directory: true, title: '选择已有项目文件夹' })
      if (!folder) return
      const path = typeof folder === 'string' ? folder : String(folder)
      const name = path.split(/[/\\]/).pop() || '未命名'
      const project: ProjectEntry = {
        path, name,
        lastOpened: new Date().toISOString(),
        wordCount: 0,
        color: pickCoverColor(opts.projects.value.length),
      }
      opts.projects.value = [...opts.projects.value, project]
      projectStore.addProject(project)
      await openProject(project)
    } catch (e) {
      console.error('打开项目失败:', e)
    }
  }

  function handleRemoveProject(project: ProjectEntry) {
    opts.projects.value = opts.projects.value.filter(p => p.path !== project.path)
    projectStore.removeProject(project.path)
  }

  return {
    showNewProjectDialog, newProjectPath, newProjectName,
    openProject, handleNewProject, confirmNewProject, handleAddProject, handleRemoveProject,
    loadFileTree,
  }
}
