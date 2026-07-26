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

  <!-- ===== 编辑器三栏视图 ===== -->
  <div v-else class="h-screen flex flex-col">
    <!-- 顶栏 -->
    <TopBar
      :project-name="currentProject?.name ?? ''"
      :file-name="activeFile?.name"
      :is-dirty="isDirty"
      @go-library="view = 'library'"
      @toggle-sidebar="showSidebar = !showSidebar"
      @toggle-ai="showAiPanel = !showAiPanel"
    />

    <!-- 主体三栏 -->
    <div class="flex-1 flex min-h-0">
      <!-- 左侧：文件树 -->
      <FileTree
        v-if="showSidebar"
        :root-path="currentProject?.path ?? ''"
        :active-file="activeFile?.path"
        :files="fileTree"
        @select-file="openFile"
        @create-file="handleCreateFile"
        @create-dir="handleCreateDir"
        @delete="handleDelete"
        @rename="handleRename"
      />

      <!-- 中间：编辑器 -->
      <main class="flex-1 min-w-0 flex flex-col" :class="[
        showSidebar ? '' : '',
        showAiPanel ? '' : ''
      ]">
        <MdEditor
          v-if="activeFile"
          :file-path="activeFile.path"
          :content="activeFile.content"
          @update:content="handleContentChange"
          @save="handleSave"
        />
        <div v-else class="flex-1 flex items-center justify-center text-text-muted text-sm">
          打开一个文件开始写作
        </div>
      </main>

      <!-- 右侧：AI 面板 -->
      <AiPanel
        v-if="showAiPanel"
        :active-file="activeFile"
        :project-root="currentProject?.path ?? ''"
        @expand="view = 'ai-chat'"
      />
    </div>
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
import { ref, reactive } from 'vue'
import { useProjectStore } from './stores/project'
import { useFileStore } from './stores/file'
import ProjectLibrary from './components/ProjectLibrary.vue'
import type { ProjectEntry } from './types/project'
import TopBar from './components/TopBar.vue'
import FileTree from './components/FileTree.vue'
import MdEditor from './components/MdEditor.vue'
import AiPanel from './components/AiPanel.vue'
import AiChatView from './components/AiChatView.vue'

// ── State ──

type View = 'library' | 'editor' | 'ai-chat'
const view = ref<View>('library')
const showSidebar = ref(true)
const showAiPanel = ref(true)

const projectStore = useProjectStore()
const fileStore = useFileStore()

const projects = ref<ProjectEntry[]>([])
const currentProject = ref<ProjectEntry | null>(null)
const activeFile = ref<{ path: string; name: string; content: string } | null>(null)
const isDirty = ref(false)
const fileTree = ref<any[]>([])

// ── Project operations ──

async function openProject(project: ProjectEntry) {
  currentProject.value = project
  view.value = 'editor'
  await loadFileTree()
}

function handleNewProject() {
  // TODO: 选位置 + 输入名
}

function handleOpenProject() {
  // TODO: 选文件夹加入索引
}

function handleAddProject() {
  // TODO: 同上
}

function handleLocate(project: ProjectEntry) {
  // TODO: 调用系统文件管理器打开
}

function handleRelocate(project: ProjectEntry) {
  // TODO: 重新选择路径
}

function handleRemoveProject(project: ProjectEntry) {
  projects.value = projects.value.filter(p => p.path !== project.path)
}

// ── File operations ──

async function loadFileTree() {
  if (!currentProject.value) return
  // TODO: 调用 Rust list_dir
  fileTree.value = []
}

async function openFile(path: string) {
  // TODO: 调用 Rust read_file
}

function handleCreateFile(parentPath: string) {
  // TODO
}

function handleCreateDir(parentPath: string) {
  // TODO
}

function handleDelete(path: string) {
  // TODO
}

function handleRename(path: string, newName: string) {
  // TODO
}

function handleContentChange(content: string) {
  if (activeFile.value) {
    activeFile.value.content = content
    isDirty.value = true
  }
}

async function handleSave() {
  // TODO: 调用 Rust write_file
  isDirty.value = false
}

function handleAiInsert(text: string) {
  // TODO: 插入到编辑器
}
</script>
