<template>
  <!-- ===== 项目库视图 ===== -->
  <ProjectLibrary
    v-if="view === 'library'"
    :projects="projects"
    @select="openProject"
    @new-project="handleNewProject"
    @open-project="handleOpenProject"
    @add-project="handleAddProject"
    @locate="handleLocate"
    @relocate="handleRelocate"
    @remove="handleRemoveProject"
  />

  <!-- ===== 编辑器视图 ===== -->
  <div v-else-if="view === 'editor'" class="h-screen flex flex-col overflow-hidden bg-bg-page">
    <!-- 顶栏 -->
    <TopBar
      :project-name="currentProject?.name ?? ''"
      :file-name="activeFile?.name"
      :is-dirty="isDirty"
      :has-back="fileStore.hasBack()"
      :has-forward="fileStore.hasForward()"
      @go-library="view = 'library'"
      @go-back="handleGoBack"
      @go-forward="handleGoForward"
      @toggle-theme="toggleTheme"
    />

    <!-- 主体：编辑器 + 两条图标轨 + 可推挤面板 -->
    <div class="flex-1 flex min-h-0">
      
      <!-- 左侧图标轨 -->
      <div class="icon-bar icon-bar--left">
        <button class="icon-bar-btn" :class="{ active: showSidebar }" title="文件树" @click="showSidebar = !showSidebar">
          <FolderOpen :size="16" />
        </button>
        <button class="icon-bar-btn" title="搜索文件" @click="showSearch = true">
          <Search :size="16" />
        </button>
      </div>

      <!-- 左侧推挤面板：文件树 -->
      <Transition name="slide-left">
        <FileTree
          v-if="showSidebar"
          :root-path="currentProject?.path ?? ''"
          :active-file="activeFile?.path"
          :files="fileTree"
          @select-file="handleFileSelect"
          @create-file="handleCreateFile"
          @create-dir="handleCreateDir"
          @delete="handleDelete"
          @rename="handleRename"
        />
      </Transition>

      <!-- 编辑器 -->
      <main class="flex-1 min-w-0 flex flex-col">
        <MdEditor
          v-if="activeFile"
          ref="editorRef"
          :content="activeFile.content"
          @update:content="handleContentChange"
          @save="handleSave"
        />
        <div v-else class="flex-1 flex items-center justify-center text-text-muted text-sm">
          打开一个文件开始写作
        </div>
      </main>

      <!-- 右侧推挤面板：AI 紧凑面板 -->
      <Transition name="slide-right">
        <AiPanel
          v-if="showAiPanel"
          :active-file="activeFile"
          :project-root="currentProject?.path ?? ''"
          @expand="view = 'ai-chat'"
        />
      </Transition>

      <!-- 右侧图标轨 -->
      <div class="icon-bar icon-bar--right">
        <button class="icon-bar-btn" :class="{ active: showAiPanel }" title="AI 助手" @click="showAiPanel = !showAiPanel">
          <Sparkles :size="16" />
        </button>
        <div class="icon-bar-divider" />
        <button class="icon-bar-btn icon-bar-btn--text" title="续写" @click="runQuickAction('续写')">
          续
        </button>
        <button class="icon-bar-btn icon-bar-btn--text" title="润色" @click="runQuickAction('润色')">
          润
        </button>
        <button class="icon-bar-btn icon-bar-btn--text" title="扩写" @click="runQuickAction('扩写')">
          扩
        </button>
        <button class="icon-bar-btn icon-bar-btn--text" title="检查" @click="runQuickAction('检查')">
          查
        </button>
      </div>
    </div>

    <!-- 新建项目命名弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showNewProjectDialog" class="dialog-overlay" @click.self="showNewProjectDialog = false">
          <div class="dialog-box">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm font-medium text-text-primary">新建项目</span>
              <button class="dialog-close" @click="showNewProjectDialog = false">
                <X :size="14" />
              </button>
            </div>
            <label class="block text-xs text-text-secondary mb-1">项目名称</label>
            <input
              ref="newProjectInput"
              v-model="newProjectName"
              class="dialog-input"
              placeholder="输入项目名称"
              @keydown.enter="confirmNewProject"
              @keydown.escape="showNewProjectDialog = false"
            />
            <div class="text-[10px] text-text-muted mt-1">
              位置：{{ newProjectPath }}
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button class="btn-dialog-ghost" @click="showNewProjectDialog = false">取消</button>
              <button class="btn-dialog-accent" :disabled="!newProjectName.trim()" @click="confirmNewProject">
                创建
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 搜索浮层 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSearch" class="search-overlay" @click.self="showSearch = false">
          <div class="search-modal">
            <div class="flex items-center gap-2 px-4 py-3 border-b" style="border-color: var(--color-border)">
              <Search :size="16" class="text-text-muted" />
              <input
                ref="searchInput"
                v-model="searchQuery"
                class="flex-1 bg-transparent text-sm text-text-primary outline-none"
                placeholder="搜索文件..."
                @keydown.escape="showSearch = false"
                @keydown.enter="handleSearchSelect"
                @keydown.up.prevent="searchIndex = Math.max(0, searchIndex - 1)"
                @keydown.down.prevent="searchIndex = Math.min(searchResults.length - 1, searchIndex + 1)"
              />
              <span class="text-[10px] text-text-muted">ESC</span>
            </div>
            <div class="max-h-64 overflow-y-auto p-1">
              <div
                v-for="(item, i) in searchResults"
                :key="item.path"
                class="search-item"
                :class="{ 'search-item--active': searchIndex === i }"
                @click="selectSearchResult(item)"
                @mouseenter="searchIndex = i"
              >
                <span class="text-text-muted mr-2">{{ item.isDir ? '📁' : '📄' }}</span>
                <span class="text-sm text-text-primary">{{ item.name }}</span>
                <span class="ml-auto text-[10px] text-text-muted">{{ item.parent }}</span>
              </div>
              <div v-if="searchQuery && searchResults.length === 0" class="text-xs text-text-muted text-center py-4">
                没有找到匹配的文件
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>

  <!-- ===== AI 全屏对话 ===== -->
  <AiChatView
    v-if="view === 'ai-chat'"
    :active-file="activeFile"
    :project-root="currentProject?.path ?? ''"
    @back="view = 'editor'"
    @insert="handleAiInsert"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { FolderOpen, Search, Sparkles, X } from 'lucide-vue-next'
import { useProjectStore } from './stores/project'
import { useFileStore } from './stores/file'
import ProjectLibrary from './components/ProjectLibrary.vue'
import type { ProjectEntry } from './types/project'
import { pickCoverColor } from './types/project'
import * as api from './api/files'
import TopBar from './components/TopBar.vue'
import FileTree from './components/FileTree.vue'
import MdEditor from './components/MdEditor.vue'
import AiPanel from './components/AiPanel.vue'
import AiChatView from './components/AiChatView.vue'

// ── State ──

type View = 'library' | 'editor' | 'ai-chat'
const view = ref<View>('library')
const showSidebar = ref(false)
const showNewProjectDialog = ref(false)
const newProjectPath = ref('')
const newProjectName = ref('')
const showAiPanel = ref(false)
const showSearch = ref(false)
const searchQuery = ref('')
const searchIndex = ref(0)
const searchInput = ref<HTMLInputElement>()
const editorRef = ref<InstanceType<typeof MdEditor>>()

const projectStore = useProjectStore()
const fileStore = useFileStore()

const projects = ref<ProjectEntry[]>([])
const currentProject = ref<ProjectEntry | null>(null)
const activeFile = ref<{ path: string; name: string; content: string } | null>(null)
const isDirty = ref(false)
const fileTree = ref<any[]>([])

// ── Search ──

interface SearchResult {
  name: string
  path: string
  isDir: boolean
  parent: string
}

const searchResults = computed(() => {
  if (!searchQuery.value) return []
  const q = searchQuery.value.toLowerCase()
  const results: SearchResult[] = []
  
  function walk(nodes: any[], parentPath: string) {
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(q)) {
        results.push({
          name: node.name,
          path: node.path,
          isDir: node.isDir,
          parent: parentPath || '/',
        })
      }
      if (node.children) walk(node.children, node.name)
    }
  }
  walk(fileTree.value, '')
  return results.slice(0, 20)
})

watch(searchQuery, () => { searchIndex.value = 0 })

watch(showSearch, (v) => {
  if (v) {
    searchQuery.value = ''
    nextTick(() => searchInput.value?.focus())
  }
})

function handleSearchSelect() {
  const item = searchResults.value[searchIndex.value]
  if (item && !item.isDir) selectSearchResult(item)
}

function selectSearchResult(item: SearchResult) {
  showSearch.value = false
  if (!item.isDir) handleFileSelect(item.path)
}

// ── Project operations ──

async function openProject(project: ProjectEntry) {
  currentProject.value = project
  projectStore.markOpened(project.path)
  view.value = 'editor'
  try {
    await api.setProjectPath(project.path)
    await loadFileTree()
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
    path: projectPath,
    name,
    lastOpened: new Date().toISOString(),
    wordCount: 0,
    color: pickCoverColor(projects.value.length),
  }

  projects.value = [...projects.value, project]
  projectStore.addProject(project)
  await openProject(project)
}

async function handleOpenProject() {
  handleAddProject()
}

async function handleAddProject() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const folder = await open({ directory: true, title: '选择已有项目文件夹' })
    if (!folder) return

    const path = typeof folder === 'string' ? folder : String(folder)
    const name = path.split(/[/\\]/).pop() || '未命名'

    const project: ProjectEntry = {
      path,
      name,
      lastOpened: new Date().toISOString(),
      wordCount: 0,
      color: pickCoverColor(projects.value.length),
    }

    projects.value = [...projects.value, project]
    projectStore.addProject(project)
    await openProject(project)
  } catch (e) {
    console.error('打开项目失败:', e)
  }
}

function handleLocate(_project: ProjectEntry) {
  // TODO: 调用系统文件管理器
}

function handleRelocate(project: ProjectEntry) {
  handleAddProject().then(() => {
    handleRemoveProject(project)
  })
}

function handleRemoveProject(project: ProjectEntry) {
  projects.value = projects.value.filter(p => p.path !== project.path)
  projectStore.removeProject(project.path)
}

// ── File operations ──

async function loadFileTree() {
  if (!currentProject.value) return
  try {
    const entries = await api.listDir(currentProject.value.path)
    fileTree.value = entries
  } catch (e) {
    console.error('加载文件树失败:', e)
  }
}

async function handleFileSelect(path: string) {
  await editorRef.value?.flushPendingSave()
  try {
    const content = await api.readFile(path)
    const name = path.split(/[/\\]/).pop() || path
    activeFile.value = { path, name, content }
    isDirty.value = false
    fileStore.setOpenFile({ path, name, content, isDirty: false })
  } catch (e) {
    console.error('读取文件失败:', e)
  }
}

async function handleCreateFile(parentPath: string) {
  const name = window.prompt('文件名（自动补 .md）：')
  if (!name?.trim()) return
  const filename = name.endsWith('.md') ? name : `${name}.md`
  const sep = parentPath.includes('\\') ? '\\' : '/'
  const filepath = `${parentPath}${sep}${filename}`
  try {
    await api.createFile(filepath)
    await loadFileTree()
    await handleFileSelect(filepath)
  } catch (e) {
    console.error('创建文件失败:', e)
  }
}

async function handleCreateDir(parentPath: string) {
  const name = window.prompt('文件夹名：')
  if (!name?.trim()) return
  const sep = parentPath.includes('\\') ? '\\' : '/'
  const dirpath = `${parentPath}${sep}${name}`
  try {
    await api.createDir(dirpath)
    await loadFileTree()
  } catch (e) {
    console.error('创建文件夹失败:', e)
  }
}

async function handleDelete(path: string) {
  if (!confirm('确定要删除吗？（会移到 .trash）')) return
  try {
    await api.deletePath(path)
    await loadFileTree()
    if (activeFile.value?.path === path) {
      activeFile.value = null
    }
  } catch (e) {
    console.error('删除失败:', e)
  }
}

async function handleRename(path: string, newName: string) {
  // TODO: 需要 Rust 端 rename 命令
}

function handleContentChange(content: string) {
  if (activeFile.value) {
    activeFile.value.content = content
    isDirty.value = true
  }
}

async function handleSave() {
  if (!activeFile.value) return
  try {
    await api.writeFile(activeFile.value.path, activeFile.value.content)
    isDirty.value = false
  } catch (e) {
    console.error('保存失败:', e)
  }
}

async function handleGoBack() {
  const path = fileStore.goBack()
  if (path) await handleFileSelect(path)
}

async function handleGoForward() {
  const path = fileStore.goForward()
  if (path) await handleFileSelect(path)
}

// ── AI ──

function runQuickAction(action: string) {
  // TODO: 一键 AI 操作，不打开面板
  console.log('Quick action:', action)
}

function handleAiInsert(text: string) {
  // TODO: 插入到编辑器
}

// ── Theme ──

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme')
  document.documentElement.setAttribute('data-theme', current === 'warm-paper' ? 'warm-paper-dark' : 'warm-paper')
}

// ── Init ──

// ── Keyboard shortcuts ──

function isEditorFocused(): boolean {
  const el = document.activeElement
  return el !== null && (el.closest('.cm-editor') !== null || el.closest('.cm-content') !== null)
}

function isAnyOverlayOpen(): boolean {
  return showNewProjectDialog.value || showSearch.value
}

function handleGlobalKeydown(e: KeyboardEvent) {
  // 弹窗打开时只允许 Esc，其他快捷键都不触发
  if (isAnyOverlayOpen() && e.key !== 'Escape') return

  // AI 全屏对话页也支持跳回
  if (view.value === 'ai-chat') {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault()
      view.value = 'editor'
    }
    return
  }

  if (view.value !== 'editor') return

  // Ctrl+B — 切换文件树（编辑器内不拦截，留给加粗）
  if (e.ctrlKey && e.key === 'b' && !isEditorFocused()) {
    e.preventDefault()
    showSidebar.value = !showSidebar.value
  }
  // Ctrl+J — 切换 AI 面板
  if (e.ctrlKey && e.key === 'j') {
    e.preventDefault()
    showAiPanel.value = !showAiPanel.value
  }
  // Ctrl+Shift+A — 全屏 AI
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault()
    view.value = 'ai-chat'
  }
  // Ctrl+P — 搜索（编辑器内不拦截）
  if (e.ctrlKey && e.key === 'p' && !isEditorFocused()) {
    e.preventDefault()
    showSearch.value = true
  }
}

onMounted(() => {
  projectStore.loadIndex()
  projects.value = projectStore.projects
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
/* ── Icon Bars ── */

.icon-bar {
  width: 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
  gap: 14px;
  flex-shrink: 0;
  background: var(--color-bg-surface);
}

.icon-bar--left {
  border-right: 1px solid var(--color-border);
}

.icon-bar--right {
  border-left: 1px solid var(--color-border);
}

.icon-bar-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.icon-bar-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.icon-bar-btn.active {
  color: var(--color-accent);
  background: var(--color-accent-bg);
}

.icon-bar-btn--text {
  font-size: 10px;
  font-family: inherit;
}

.icon-bar-divider {
  width: 20px;
  height: 1px;
  background: var(--color-border);
}

/* ── Slide Transitions ── */

.slide-left-enter-active,
.slide-left-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  width: 0 !important;
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  width: 0 !important;
  opacity: 0;
}

/* ── Search Overlay ── */

.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding-top: 120px;
  background: rgba(74, 64, 50, 0.08);
}

.search-modal {
  width: 420px;
  max-height: 360px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}

.search-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  margin: 2px 4px;
  transition: background 0.1s ease;
}

.search-item:hover,
.search-item--active {
  background: var(--color-accent-bg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ── Dialog ── */

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 64, 50, 0.1);
}

.dialog-box {
  width: 380px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  padding: 20px;
}

.dialog-close {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
}

.dialog-close:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.dialog-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  outline: none;
}

.dialog-input:focus {
  border-color: var(--color-accent-border);
}

.btn-dialog-ghost {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-family: inherit;
}

.btn-dialog-ghost:hover {
  background: var(--color-bg-surface-hover);
}

.btn-dialog-accent {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-text-on-accent);
  background: var(--color-accent);
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.btn-dialog-accent:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.btn-dialog-accent:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
