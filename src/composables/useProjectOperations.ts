import { ref, type Ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { useFileStore } from '../stores/file'
import { useToastStore } from '../stores/toast'
import { useProjectSession } from './useProjectSession'
import { totalWords } from '../core/tree'
import { joinPath, samePath } from '../core/paths'
import { sanitizeFileName } from '../core/text'
import type { ProjectEntry } from '../types/project'
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
  const session = useProjectSession()

  const showNewProjectDialog = ref(false)
  const newProjectPath = ref('')
  const newProjectName = ref('')

  /**
   * 新建项目时生成骨架：角色/ 与 大纲/ 目录 + 一份 _project.md 项目概述。
   *
   * 新用户建完项目面对的是空目录，不知道角色卡、大纲该写到哪里——
   * 骨架让「设定文件放哪」一眼可辨，也让前情提要的 _project.md 有个起点。
   * 必须在 setProjectPath(root) 之后调用（写盘走项目沙箱，路径需落在当前项目内）。
   */
  async function ensureSkeleton(root: string) {
    const roleDir = joinPath(root, '角色')
    const outlineDir = joinPath(root, '大纲')
    const overview = joinPath(root, '_project.md')
    try {
      await api.createDir(roleDir)
      await api.createDir(outlineDir)
    } catch (e) {
      console.error('创建骨架目录失败:', e)
    }
    // 已存在 _project.md 就不覆盖（用户可能已经写过概述）
    if (!(await api.pathExists(overview))) {
      try {
        await api.writeFile(overview, '# 项目概述\n\n> 全书的一句话简介、主线、主要冲突，写在这里。\n> 前情提要会优先引用这份概述。\n\n')
      } catch (e) {
        console.error('创建项目概述失败:', e)
      }
    }
  }

  async function loadFileTree() {
    if (!opts.currentProject.value) return
    try {
      await fileStore.loadTree(opts.currentProject.value.path)
    } catch (e) {
      console.error('加载文件树失败:', e)
    }
  }

  async function openProject(project: ProjectEntry, opts2?: { isNew?: boolean }) {
    // 切换前先落盘：此刻 Rust 端的项目根仍是旧项目，保存路径才有效。
    // 必须放在 setProjectPath 之前，否则旧项目的写盘会被沙箱拒绝；
    // 保存失败则取消切换，避免 resetForProject 把未落盘的内容直接丢掉。
    if (opts.currentProject.value && opts.currentProject.value.path !== project.path) {
      const flushed = await fileStore.saveAllDirty()
      if (!flushed) {
        useToastStore().push('error', '已取消切换项目', '有文件保存失败，请处理后再切换', 5000)
        return
      }
    }

    opts.currentProject.value = project
    projectStore.markOpened(project.path)
    opts.view.value = 'editor'
    try {
      await api.setProjectPath(project.path)
      // 新建项目：此时项目根已切到新路径，生成 角色/ 大纲/ _project.md 骨架
      if (opts2?.isNew) await ensureSkeleton(project.path)
      // 域状态统一重置（标签/活动文件/树/统计/检测/对话），避免上一个项目残留
      await session.enterProject(project.path)
      await loadFileTree()
      // 恢复上次会话的标签页与活动文件（后台逐个读盘，失败跳过）
      await fileStore.restoreOpenTabs()
      // 汇总正文总字数并写回项目索引（项目库卡片显示用）
      const total = totalWords(fileStore.tree)
      const updated = { ...project, wordCount: total, broken: false }
      opts.currentProject.value = updated
      projectStore.addProject(updated)
    } catch (e) {
      console.error('打开项目失败:', e)
      // 回滚：不这样做会停在「已进入项目」的空编辑器上（树是空的、也退不回项目库）
      opts.currentProject.value = null
      opts.view.value = 'library'
      await session.leaveProject()
      const broken = opts.projects.value.find((p) => samePath(p.path, project.path))
      if (broken) broken.broken = true
      void projectStore.saveIndex()
      useToastStore().push('error', '打开项目失败', e instanceof Error ? e.message : String(e), 4000)
    }
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
      useToastStore().push('error', '重新定位失败', e instanceof Error ? e.message : String(e), 4000)
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
      useToastStore().push('error', '新建项目失败', e instanceof Error ? e.message : String(e), 4000)
    }
  }

  async function confirmNewProject() {
    const name = sanitizeFileName(newProjectName.value)
    if (!name) {
      useToastStore().push('error', '项目名无效', '请勿使用 < > : " / \\ | ? * 等字符', 4000)
      return
    }
    // 目录不在此时创建（Rust 侧 create_dir 受当前项目沙箱限制，此刻根目录还是旧项目），
    // 首次写入章节文件时会自动建目录。
    const projectPath = joinPath(newProjectPath.value, name)
    if (opts.projects.value.some((p) => samePath(p.path, projectPath))) {
      useToastStore().push('error', '项目已存在', `「${name}」已在项目库中`, 4000)
      return
    }
    // 磁盘上已有同名目录：直接接管会把它原有的文件一起当成这个项目的正文，
    // 用户以为新建了一个空项目，实际上打开了别人的旧稿
    if (await api.pathExists(projectPath)) {
      useToastStore().push(
        'error',
        '目录已存在',
        `「${name}」文件夹已存在，换个名字，或用「打开已有项目」直接打开它`,
        6000,
      )
      return
    }
    showNewProjectDialog.value = false
    const project: ProjectEntry = {
      path: projectPath,
      name,
      lastOpened: new Date().toISOString(),
      wordCount: 0,
      color: pickCoverColor(opts.projects.value.length),
    }
    opts.projects.value = [...opts.projects.value, project]
    projectStore.addProject(project)
    await openProject(project, { isNew: true })
  }

  async function handleAddProject() {
    try {
      const folder = await openDialog({ directory: true, title: '选择已有项目文件夹' })
      if (!folder) return
      const path = typeof folder === 'string' ? folder : String(folder)
      // 重复添加同一目录会在项目库留下两张相同卡片（addProject 只更新了第一张）
      const dup = opts.projects.value.find((p) => samePath(p.path, path))
      if (dup) {
        useToastStore().push('info', '已在项目库中', `「${dup.name}」`, 3000)
        await openProject(dup)
        return
      }
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
      useToastStore().push('error', '打开项目失败', e instanceof Error ? e.message : String(e), 4000)
    }
  }

  /**
   * 从项目库移除项目。
   * 若移除的正是当前打开的项目，顺带清空域状态并退回项目库——
   * 否则编辑器会继续显示一个已不在列表里的项目，还能往里写盘。
   */
  async function handleRemoveProject(project: ProjectEntry) {
    opts.projects.value = opts.projects.value.filter((p) => !samePath(p.path, project.path))
    projectStore.removeProject(project.path)

    if (opts.currentProject.value && samePath(opts.currentProject.value.path, project.path)) {
      await session.leaveProject()
      opts.currentProject.value = null
      opts.view.value = 'library'
    }
  }

  return {
    showNewProjectDialog, newProjectPath, newProjectName,
    openProject, handleNewProject, confirmNewProject, handleAddProject, handleRemoveProject, handleLocate, handleRelocate,
    loadFileTree,
  }
}
