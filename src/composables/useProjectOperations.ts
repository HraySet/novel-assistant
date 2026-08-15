import { ref, type Ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { useFileStore } from '../stores/file'
import { useStatsStore } from '../stores/stats'
import type { ProjectEntry } from '../types/project'
import type { FileNode } from '../types/file'
import { pickCoverColor } from '../types/project'
import * as api from '../api/files'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

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
      // 恢复上次会话的标签页与活动文件（后台逐个读盘，失败跳过）
      await fileStore.restoreOpenTabs()
      // 汇总全书字数并写回项目索引（项目库卡片显示用）
      const total = sumWords(fileStore.tree)
      const updated = { ...project, wordCount: total, broken: false }
      opts.currentProject.value = updated
      projectStore.addProject(updated)
    } catch (e) {
      console.error('打开项目失败:', e)
    }
  }

  /** 遍历文件树求和（node.wordCount 来自后端 list_dir） */
  function sumWords(nodes: FileNode[]): number {
    let sum = 0
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) sum += sumWords(n.children)
      } else {
        sum += n.wordCount ?? 0
      }
    }
    return sum
  }

  /** 在系统文件管理器中显示项目文件夹 */
  async function handleLocate(project: ProjectEntry) {
    try {
      await api.revealPath(project.path)
    } catch (e) {
      console.error('在文件管理器中显示失败:', e)
    }
  }

  /** 项目路径失效后重新定位文件夹 */
  async function handleRelocate(project: ProjectEntry) {
    try {
      const folder = await openDialog({ directory: true, title: '重新定位项目文件夹' })
      if (!folder) return
      const newPath = typeof folder === 'string' ? folder : String(folder)
      const oldPath = project.path
      projectStore.updateProjectPath(oldPath, newPath)
      const updated = opts.projects.value.find((p) => p.path === newPath)
      if (updated) {
        updated.broken = false
      }
      // 当前项目正是被重定位的项目 → 直接切到新路径
      if (opts.currentProject.value?.path === oldPath) {
        const target = updated ?? { ...project, path: newPath, broken: false }
        await openProject(target)
      }
    } catch (e) {
      console.error('重新定位失败:', e)
    }
  }

  async function handleNewProject() {
    try {
      const folder = await openDialog({ directory: true, title: '选择新项目的存放位置' })
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
      const folder = await openDialog({ directory: true, title: '选择已有项目文件夹' })
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
    openProject, handleNewProject, confirmNewProject, handleAddProject, handleRemoveProject, handleLocate, handleRelocate,
    loadFileTree,
  }
}
