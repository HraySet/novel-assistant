<template>
  <!-- ===== 项目库视图 ===== -->
  <ProjectLibrary v-if="view === 'library'" :projects="projects" @select="proj.openProject" @new-project="proj.handleNewProject"
    @open-project="proj.handleAddProject" @add-project="proj.handleAddProject"
    @remove="proj.handleRemoveProject" @locate="proj.handleLocate" @relocate="proj.handleRelocate" />

  <!-- ===== 编辑器视图 ===== -->
  <div v-else-if="view === 'editor'" class="h-screen flex flex-col overflow-hidden bg-bg-page">
    <!-- 顶栏 -->
    <TopBar :project-name="currentProject?.name ?? ''" :file-name="activeFile?.name" :is-dirty="activeFile?.isDirty ?? false"
      :prev-path="prevChapterPath" :next-path="nextChapterPath" :focus-mode="focusMode"
      :chapter-index="chapterIndex" :chapter-total="chapterTotal"
      @go-library="view = 'library'" @navigate="(p: string) => fileStore.handleFileSelect(p)"
      @open-search="showSearch = true" @toggle-focus="focusMode = !focusMode" />

    <!-- 主体：编辑器 + 两条图标轨 + 可推挤面板 -->
    <div class="flex-1 flex min-h-0">

      <!-- 左侧图标轨 -->
      <div v-if="!focusMode" class="icon-bar icon-bar--left">
        <button class="icon-bar-btn" :class="{ active: showSidebar }" title="文件树" @click="showSidebar = !showSidebar">
          <FolderOpen :size="16" />
        </button>
        <button class="icon-bar-btn" title="搜索文件" @click="showSearch = true">
          <Search :size="16" />
        </button>
        <button class="icon-bar-btn" title="角色卡片" @click="showCharacters = true">
          <Users :size="16" />
        </button>
        <div class="flex-1" />
        <button class="icon-bar-btn" title="导出" @click="handleExport">
          <Download :size="16" />
        </button>
        <button class="icon-bar-btn" title="回收站" @click="showTrash = true">
          <Trash2 :size="16" />
        </button>
        <button class="icon-bar-btn" title="设置" @click="showSettings = true; settingsSection = 'writing'">
          <Settings :size="16" />
        </button>
      </div>

      <!-- 左侧推挤面板：文件树 -->
      <Transition name="slide-left">
        <LeftSidebar v-if="showSidebar && !focusMode" />
      </Transition>

      <!-- 编辑器 -->
      <main class="flex-1 min-w-0 flex flex-col">
        <EditorTabs />
        <MdEditor v-if="activeFile" ref="editorRef" :content="activeFile.content" :path="activeFile.path" :name="activeFile.name"
          :prev-path="prevChapterPath" :next-path="nextChapterPath"
          @update:content="handleContentChange" @dirty="handleEditorDirty" @save="fileStore.handleSave()"
          @navigate="(p: string) => fileStore.handleFileSelect(p)" />
        <div v-else class="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
          <div class="text-4xl mb-1">📖</div>
          <div class="text-sm">打开一个文件开始写作</div>
          <div class="text-xs">Ctrl+P 搜索文件 · 左侧文件树选择章节</div>
          <div v-if="recentFiles.length > 0" class="flex flex-wrap gap-2 justify-center max-w-md mt-2">
            <button v-for="p in recentFiles" :key="p" class="recent-chip" @click="fileStore.handleFileSelect(p)">
              {{ fileNameOf(p) }}
            </button>
          </div>
        </div>
      </main>

      <!-- 右侧推挤面板：AI 紧凑面板 -->
      <Transition name="slide-right">
        <AiPanel v-if="showAiPanel && !focusMode" :active-file="activeFile" :project-root="currentProject?.path ?? ''"
          :apply-to-selection="handleApplySelection"
          @expand="view = 'ai-chat'" @insert="handleAiInsert" />
      </Transition>

      <!-- 右侧图标轨 -->
      <div v-if="!focusMode" class="icon-bar icon-bar--right">
        <button class="icon-bar-btn" :class="{ active: showAiPanel }" title="AI 助手" @click="showAiPanel = !showAiPanel">
          <Sparkles :size="16" />
        </button>
      </div>
    </div>

    <!-- 新建项目命名弹窗 -->
    <BaseModal :show="showNewProjectDialog" @close="showNewProjectDialog = false">
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
    </BaseModal>

    <!-- 搜索浮层 -->
    <SearchModal :show="showSearch" :files="fileTree" @close="showSearch = false"
      @select-file="(path: string) => fileStore.handleFileSelect(path)" />

    <!-- 角色卡片 -->
    <CharacterCards :show="showCharacters" :project-root="currentProject?.path ?? ''"
      @close="showCharacters = false" />

    <!-- 回收站 -->
    <TrashModal :show="showTrash" :project-root="currentProject?.path ?? ''"
      @close="showTrash = false" @restored="onTrashRestored" />

    <!-- 设置弹窗 -->
    <BaseModal :show="showSettings" width="800px" max-height="620px" @close="showSettings = false">
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
    </BaseModal>

    <!-- 全局右键菜单 -->
    <!-- 全局右键菜单（文件树） -->
    <GlobalContextMenu />
  </div>

  <!-- ===== AI 全屏对话 ===== -->
  <AiChatView v-if="view === 'ai-chat'" :active-file="activeFile" :project-root="currentProject?.path ?? ''"
    :apply-to-selection="handleApplySelection"
    @back="view = 'editor'" @insert="handleAiInsert" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { FolderOpen, Search, Sparkles, X, Settings, Download, Users, Trash2 } from 'lucide-vue-next'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useProjectOperations } from './composables/useProjectOperations'
import { storeToRefs } from 'pinia'
import { useProjectStore } from './stores/project'
import { useFileStore } from './stores/file'
import { useChatStore } from './stores/chat'
import { useStatsStore } from './stores/stats'
import { useSettingsStore } from './stores/settings'
import { useDetectionStore } from './stores/detection'
import { useSelectionStore } from './stores/selection'
import { useDesignTokens } from './composables/useDesignTokens'
import ProjectLibrary from './components/ProjectLibrary.vue'
import type { ProjectEntry } from './types/project'
import { pickCoverColor } from './types/project'
import type { FileNode } from './types/file'
import * as api from './api/files'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { save, confirm } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import TopBar from './components/TopBar.vue'
import MdEditor from './components/MdEditor.vue'
import AiPanel from './components/AiPanel.vue'
import LeftSidebar from './components/LeftSidebar.vue'
import GlobalContextMenu from './components/GlobalContextMenu.vue'
import EditorTabs from './components/EditorTabs.vue'
import SettingsNav from './components/SettingsNav.vue'
import BaseModal from './components/BaseModal.vue'
// 弹层类组件按需加载（减小主包，项目库/编辑器首屏更快）
const AiChatView = defineAsyncComponent(() => import('./components/AiChatView.vue'))
const SearchModal = defineAsyncComponent(() => import('./components/SearchModal.vue'))
const CharacterCards = defineAsyncComponent(() => import('./components/CharacterCards.vue'))
const TrashModal = defineAsyncComponent(() => import('./components/TrashModal.vue'))
const SettingsContent = defineAsyncComponent(() => import('./components/SettingsContent.vue'))

// ── State ──

type View = 'library' | 'editor' | 'ai-chat'
const view = ref<View>('library')
const showSidebar = ref(false)
const showAiPanel = ref(false)
const showSearch = ref(false)
const showCharacters = ref(false)
const showTrash = ref(false)
const focusMode = ref(false)

// 章节顺序（按文件树展示顺序展平的 md/txt 文件）
const orderedFiles = computed(() => {
  const out: string[] = []
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) walk(n.children)
      } else if (/\.(md|txt)$/i.test(n.name)) {
        out.push(n.path)
      }
    }
  }
  walk(fileTree.value)
  return out
})

const prevChapterPath = computed(() => {
  const p = activeFile.value?.path
  if (!p) return undefined
  const i = orderedFiles.value.indexOf(p)
  return i > 0 ? orderedFiles.value[i - 1] : undefined
})

const nextChapterPath = computed(() => {
  const p = activeFile.value?.path
  if (!p) return undefined
  const i = orderedFiles.value.indexOf(p)
  return i >= 0 && i < orderedFiles.value.length - 1 ? orderedFiles.value[i + 1] : undefined
})

/** 当前章节在项目章节序列中的位置（1 起始） */
const chapterIndex = computed(() => {
  const p = activeFile.value?.path
  if (!p) return undefined
  const i = orderedFiles.value.indexOf(p)
  return i >= 0 ? i + 1 : undefined
})

const chapterTotal = computed(() => orderedFiles.value.length)

const recentFiles = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = fileStore.openHistory.length - 1; i >= 0 && out.length < 5; i--) {
    const p = fileStore.openHistory[i]
    if (!seen.has(p)) { seen.add(p); out.push(p) }
  }
  return out
})

function fileNameOf(p: string) {
  return p.split(/[/\\]/).pop() || p
}
const showSettings = ref(false)
const settingsSection = ref('writing')
const editorRef = ref<InstanceType<typeof MdEditor>>()
let mtimeTimer: ReturnType<typeof setInterval> | null = null

const fileStore = useFileStore()
const chatStore = useChatStore()
const statsStore = useStatsStore()
const settingsStore = useSettingsStore()
const projectStore = useProjectStore()
const { openFile: activeFile, tree: fileTree } = storeToRefs(fileStore)
const { projects } = storeToRefs(projectStore)

const currentProject = ref<ProjectEntry | null>(null)

const proj = useProjectOperations({ view, projects, currentProject })
const { showNewProjectDialog, newProjectPath, newProjectName, confirmNewProject } = proj


// ── File operations ──

function handleContentChange(content: string) {
  // 仅同步内容（恢复历史版本等场景）；脏状态由编辑器的 dirty 事件管理
  if (activeFile.value) {
    fileStore.updateActiveFile({ content })
  }
}

/** 用户输入只发轻量脏标记；内容由保存时按需从编辑器读取，避免每次按键全量拷贝文档 */
function handleEditorDirty() {
  const file = activeFile.value
  if (file && !file.isDirty) {
    fileStore.updateActiveFile({ isDirty: true })
  }
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
      defaultPath: `${projectName}.epub`,
      filters: [
        { name: 'EPUB 电子书', extensions: ['epub'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: '纯文本', extensions: ['txt'] },
      ],
    })
    if (!destPath) return
    if (destPath.toLowerCase().endsWith('.epub')) {
      await api.exportEpub(paths, destPath, projectName)
    } else {
      const withTitles = destPath.toLowerCase().endsWith('.md')
      await invoke('export_project', { paths, destPath, withTitles })
    }
  } catch (e) {
    console.error('导出失败:', e)
  }
}

// ── AI ──

function handleAiInsert(text: string) {
  editorRef.value?.insertIfNotDuplicate(text)
}

const selectionStore = useSelectionStore()

/** 把 AI 结果替换进编辑器划词选区；范围已不是原文或文件已切换时拒绝 */
function handleApplySelection(target: { path: string; from: number; to: number; original?: string }, text: string): boolean {
  const el = editorRef.value
  if (!el || fileStore.openFile?.path !== target.path) return false
  const ok = el.replaceRange(target.from, target.to, text, target.original)
  if (ok) void fileStore.handleSave()
  return ok
}

// 编辑器划词工具条触发动作时自动打开 AI 面板（面板消费 pendingAction 后清空）
watch(() => selectionStore.pendingAction, (action) => {
  if (action && !showAiPanel.value) showAiPanel.value = true
})
const detectionStore = useDetectionStore()
// 项目切换时载入该项目的一致性检测结果（含待确认的人物/大纲变化）
watch(() => currentProject.value?.path, (p) => {
  void detectionStore.setProjectRoot(p ?? '')
}, { immediate: true })

// ── 回收站 ──

async function onTrashRestored() {
  // 恢复后刷新文件树，恢复的章节重新出现在原位置
  await fileStore.loadTree()
}

// ── 全局拖放守卫 ──
// 文件被拖到没有 drop 处理器的区域（如编辑器）时，阻止 WebView 默认行为（直接打开该文件）
function preventFileNavigation(e: DragEvent) {
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    e.preventDefault()
  }
}

// ── Theme ──
// 主题变量注入（强调色/背景色/明暗 → CSS 变量），setup 顶层调用一次
useDesignTokens()

// ── Keyboard shortcuts ──
useKeyboardShortcuts({
  view, showSidebar, showAiPanel, showSearch, showSettings, settingsSection, showNewProjectDialog, showCharacters, focusMode,
  onUndo: () => editorRef.value?.undoCommand(),
  onRedo: () => editorRef.value?.redoCommand(),
  onCloseTab: () => fileStore.closeActiveTab(),
  onCycleTab: (d) => fileStore.cycleTab(d),
})

onMounted(async () => {
  window.addEventListener('dragover', preventFileNavigation)
  window.addEventListener('drop', preventFileNavigation)

  // 打开 WebView2 外部拖放开关：外部文件拖入与应用内拖拽落回都依赖它
  if (isTauri()) {
    api.enableExternalDrop().catch((e) => console.error('enable_external_drop 失败:', e))
  }

  // 外部文件变化检测：每 3 秒比对当前文件的修改时间
  // 有未保存修改时以本地为准，仅覆盖未修改的文件
  let lastMtime: number | null = null
  let mtimePath = ''
  mtimeTimer = setInterval(async () => {
    const file = activeFile.value
    // 窗口隐藏/最小化时跳过轮询，回到前台后下次 tick 自动恢复
    if (document.hidden) return
    if (!file || view.value !== 'editor') return
    try {
      const mtime = await api.fileMtime(file.path)
      if (mtime == null) return
      if (mtimePath !== file.path) {
        mtimePath = file.path
        lastMtime = mtime
        return
      }
      if (lastMtime != null && mtime > lastMtime && !file.isDirty) {
        const content = await api.readFile(file.path)
        fileStore.updateActiveFile({ content, isDirty: false })
      }
      lastMtime = mtime
    } catch { /* 忽略瞬时读取失败 */ }
  }, 3000)

  await projectStore.loadIndex()

  // 校验项目路径有效性：失效的标记为 broken（项目库显示「路径失效」并可重新定位）
  for (const p of projects.value) {
    try {
      p.broken = !(await api.pathExists(p.path))
    } catch {
      p.broken = true
    }
  }
  if (projects.value.some((p) => p.broken)) await projectStore.saveIndex()

  // 关闭窗口前：保存未落盘文件、落盘统计与聊天记录
  if (isTauri()) {
    const win = getCurrentWindow()
    let allowClose = false
    await win.onCloseRequested(async (event) => {
      if (allowClose) return
      event.preventDefault()

      if (fileStore.openFiles.some((f) => f.isDirty)) {
        const choice = await confirm('有未保存的修改，保存后退出吗？', {
          title: '退出确认',
          kind: 'warning',
          okLabel: '保存并退出',
          cancelLabel: '取消',
        })
        if (!choice) return
        await fileStore.saveAllDirty()
      }

      statsStore.pauseSession()
      statsStore.flushPersist()
      await chatStore.flushSave()
      editorRef.value?.flushUndo()
      settingsStore.flushAiSaveNow()

      allowClose = true
      await win.destroy()
    })
  }

  // 记住上次项目：直接打开，不必每次手动选文件夹
  try {
    const lastPath = await api.getProjectPath()
    if (lastPath && (await api.pathExists(lastPath))) {
      let entry = projects.value.find((p) => p.path === lastPath)
      if (!entry) {
        entry = {
          path: lastPath,
          name: lastPath.split(/[/\\]/).pop() || lastPath,
          lastOpened: new Date().toISOString(),
          wordCount: 0,
          color: pickCoverColor(projects.value.length),
        }
        projectStore.addProject(entry)
      }
      await proj.openProject(entry)
    }
  } catch (e) {
    console.error('自动打开上次项目失败:', e)
  }
})

onUnmounted(() => {
  if (mtimeTimer) clearInterval(mtimeTimer)
  window.removeEventListener('dragover', preventFileNavigation)
  window.removeEventListener('drop', preventFileNavigation)
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

/* ── 空状态最近文件 ── */

.recent-chip {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
}

.recent-chip:hover {
  border-color: var(--color-accent-border);
  color: var(--color-accent);
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


.dialog-box {
  width: 380px;
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

/* 盒子外壳（背景/圆角/阴影/进出场）由 BaseModal 统一提供 */
.settings-modal {
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
