<template>
  <!-- ===== 项目库视图 ===== -->
  <ProjectLibrary v-if="view === 'library'" :projects="projects" @select="proj.openProject" @new-project="proj.handleNewProject"
    @open-project="proj.handleAddProject" @add-project="proj.handleAddProject"
    @remove="proj.handleRemoveProject" />

  <!-- ===== 编辑器视图 ===== -->
  <div v-else-if="view === 'editor'" class="h-screen flex flex-col overflow-hidden bg-bg-page">
    <!-- 顶栏 -->
    <TopBar :project-name="currentProject?.name ?? ''" :file-name="activeFile?.name" :is-dirty="activeFile?.isDirty ?? false"
      :has-back="fileStore.hasBack()" :has-forward="fileStore.hasForward()" @go-library="view = 'library'"
      @go-back="handleGoBack" @go-forward="handleGoForward" @toggle-theme="toggleTheme" />

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
        <div class="flex-1" />
        <button class="icon-bar-btn" title="导出" @click="handleExport">
          <Download :size="16" />
        </button>
        <button class="icon-bar-btn" title="设置" @click="showSettings = true; settingsSection = 'writing'">
          <Settings :size="16" />
        </button>
      </div>

      <!-- 左侧推挤面板：文件树 -->
      <Transition name="slide-left">
        <LeftSidebar v-if="showSidebar" />
      </Transition>

      <!-- 编辑器 -->
      <main class="flex-1 min-w-0 flex flex-col">
        <EditorTabs />
        <MdEditor v-if="activeFile" ref="editorRef" :content="activeFile.content" :path="activeFile.path" :name="activeFile.name"
          @update:content="handleContentChange" @save="fileStore.handleSave()" />
        <div v-else class="flex-1 flex items-center justify-center text-text-muted text-sm">
          打开一个文件开始写作
        </div>
      </main>

      <!-- 右侧推挤面板：AI 紧凑面板 -->
      <Transition name="slide-right">
        <AiPanel v-if="showAiPanel" :active-file="activeFile" :project-root="currentProject?.path ?? ''"
          @expand="view = 'ai-chat'" />
      </Transition>

      <!-- 右侧图标轨 -->
      <div class="icon-bar icon-bar--right">
        <button class="icon-bar-btn" :class="{ active: showAiPanel }" title="AI 助手" @click="showAiPanel = !showAiPanel">
          <Sparkles :size="16" />
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
            <input v-model="newProjectName" class="dialog-input" placeholder="输入项目名称"
              @keydown.enter="confirmNewProject" @keydown.escape="showNewProjectDialog = false" />
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
    <SearchModal :show="showSearch" :files="fileTree" @close="showSearch = false"
      @select-file="(path: string) => fileStore.handleFileSelect(path)" />

    <!-- 设置弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSettings" class="dialog-overlay" @click.self="showSettings = false">
          <div class="settings-modal">
            <div class="settings-modal-header">
              <span class="text-sm font-medium text-text-primary">设置</span>
              <button class="dialog-close" @click="showSettings = false">
                <X :size="14" />
              </button>
            </div>
            <div class="settings-modal-body">
              <div class="settings-nav-col">
                <SettingsNav :section="settingsSection" @update:model-value="settingsSection = $event" />
              </div>
              <div class="settings-content-col">
                <SettingsContent :section="settingsSection" />
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 全局右键菜单 -->
    <GlobalContextMenu />
  </div>

  <!-- ===== AI 全屏对话 ===== -->
  <AiChatView v-if="view === 'ai-chat'" :active-file="activeFile" :project-root="currentProject?.path ?? ''"
    @back="view = 'editor'" @insert="handleAiInsert" />
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { FolderOpen, Search, Sparkles, X, Settings, Download } from 'lucide-vue-next'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useProjectOperations } from './composables/useProjectOperations'
import { storeToRefs } from 'pinia'
import { useProjectStore } from './stores/project'
import { useFileStore } from './stores/file'
import ProjectLibrary from './components/ProjectLibrary.vue'
import type { ProjectEntry } from './types/project'
import type { FileNode } from './types/file'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import TopBar from './components/TopBar.vue'
import MdEditor from './components/MdEditor.vue'
import AiPanel from './components/AiPanel.vue'
import AiChatView from './components/AiChatView.vue'
import LeftSidebar from './components/LeftSidebar.vue'
import SearchModal from './components/SearchModal.vue'
import GlobalContextMenu from './components/GlobalContextMenu.vue'
import EditorTabs from './components/EditorTabs.vue'
import SettingsNav from './components/SettingsNav.vue'
import SettingsContent from './components/SettingsContent.vue'

// ── State ──

type View = 'library' | 'editor' | 'ai-chat'
const view = ref<View>('library')
const showSidebar = ref(false)
const showAiPanel = ref(false)
const showSearch = ref(false)
const showSettings = ref(false)
const settingsSection = ref('writing')
const editorRef = ref<InstanceType<typeof MdEditor>>()

const fileStore = useFileStore()
const { openFile: activeFile, tree: fileTree } = storeToRefs(fileStore)

const projects = ref<ProjectEntry[]>([])
const currentProject = ref<ProjectEntry | null>(null)

const proj = useProjectOperations({ view, projects, currentProject })
const { showNewProjectDialog, newProjectPath, newProjectName, confirmNewProject } = proj


// ── File operations ──

function handleContentChange(content: string) {
  if (activeFile.value) {
    fileStore.updateActiveFile({ content, isDirty: true })
  }
}

async function handleGoBack() {
  const path = fileStore.goBack()
  if (path) await fileStore.handleFileSelect(path)
}

async function handleGoForward() {
  const path = fileStore.goForward()
  if (path) await fileStore.handleFileSelect(path)
}

// ── 导出 ──

function collectFilePaths(nodes: FileNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) collectFilePaths(n.children, acc)
    } else if (/\.(md|txt)$/i.test(n.name)) {
      acc.push(n.path)
    }
  }
  return acc
}

async function handleExport() {
  const paths = collectFilePaths(fileTree.value)
  if (paths.length === 0) return
  const projectName = currentProject.value?.name || '导出'
  try {
    const destPath = await save({
      defaultPath: `${projectName}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] },
      ],
    })
    if (!destPath) return
    const withTitles = destPath.toLowerCase().endsWith('.md')
    await invoke('export_project', { paths, destPath, withTitles })
  } catch (e) {
    console.error('导出失败:', e)
  }
}

// ── AI ──

function handleAiInsert(text: string) {
  editorRef.value?.insertAtCursor(text)
}

// ── Theme ──

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme')
  document.documentElement.setAttribute('data-theme', current === 'warm-paper' ? 'warm-paper-dark' : 'warm-paper')
}

// ── Keyboard shortcuts ──
useKeyboardShortcuts({ view, showSidebar, showAiPanel, showSearch, showSettings, settingsSection, showNewProjectDialog })

onMounted(() => {
  const ps = useProjectStore()
  ps.loadIndex()
  projects.value = ps.projects
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

.slide-right-enter-active,
.slide-right-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  width: 0 !important;
  opacity: 0;
}

/* ── Fade Transition ── */

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

/* ── Settings Modal ── */

.settings-modal {
  width: 800px;
  max-height: 620px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.settings-modal-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-nav-col {
  width: 172px;
  padding: 12px;
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
}

.settings-content-col {
  flex: 1;
  min-width: 0;
}

/* ── Slide Left ── */

.slide-left-enter-active,
.slide-left-leave-active {
  transition: width 0.2s ease, opacity 0.15s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
