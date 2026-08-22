<template>
  <div class="project-library">
    <!-- 顶栏 -->
    <div class="header">
      <div class="title-block">
        <div class="title">
          <FolderOpen :size="18" class="title-icon" />
          <span>我的项目</span>
        </div>
        <div v-if="projects.length" class="header-sub">
          共 {{ projects.length }} 个项目
          <template v-if="totalWords">· 累计 {{ formatWordCount(totalWords) }}</template>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-accent" @click="$emit('newProject')">
          + 新建项目
        </button>
        <button class="btn btn-ghost" @click="$emit('openProject')">
          打开已有项目
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="projects.length === 0" class="empty-state">
      <BookOpen :size="40" class="empty-icon" />
      <p class="empty-title">还没有项目</p>
      <p class="empty-desc">创建一个新项目，或打开已有的小说文件夹</p>
      <div class="empty-actions">
        <button class="btn btn-accent" @click="$emit('newProject')">
          新建项目
        </button>
        <button class="btn btn-ghost" @click="$emit('openProject')">
          打开已有项目
        </button>
      </div>
    </div>

    <!-- 项目卡片网格 -->
    <div v-else class="grid">
      <div
        v-for="project in projects"
        :key="project.path"
        class="card"
        :class="{ 'card--broken': project.broken }"
        @click="handleClick(project)"
        @contextmenu.prevent="handleContextMenu($event, project)"
      >
        <div
          class="card-cover"
          :style="{ '--cover-color': project.color }"
        >
          <span class="card-cover-letter">{{ project.name.trim().charAt(0) || '书' }}</span>
        </div>
        <div class="card-name">{{ project.name }}</div>
        <div class="card-meta">
          <span v-if="project.broken" class="card-broken"><AlertTriangle :size="11" /> 路径失效</span>
          <template v-else>
              <span>{{ formatTime(project.lastOpened) }}</span>
              <span v-if="project.wordCount" class="card-sep">·</span>
              <span v-if="project.wordCount">{{ formatWordCount(project.wordCount) }}</span>
          </template>
        </div>
      </div>

      <!-- 添加项目占位 -->
      <div class="card card--add" @click="$emit('addProject')">
        <Plus :size="20" />
        <span>添加项目</span>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <Transition name="ctx-menu">
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
        <button class="context-item" @click="handleLocate">
          在文件管理器中显示
        </button>
        <button
          v-if="contextMenu.project?.broken"
          class="context-item"
          @click="handleRelocate"
        >
          重新定位...
        </button>
        <div class="context-divider" />
        <button class="context-item context-item--danger" @click="handleRemove">
          移出列表
        </button>
      </div>
      </Transition>
    </Teleport>

    <!-- 点击空白关闭右键菜单 -->
    <div
      v-if="contextMenu.show"
      class="context-overlay"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { BookOpen, FolderOpen, Plus, AlertTriangle } from 'lucide-vue-next'
import type { ProjectEntry } from '../types/project'
// ── Props & Emits ──

const props = defineProps<{
  projects: ProjectEntry[]
}>()

const emit = defineEmits<{
  select: [project: ProjectEntry]
  newProject: []
  openProject: []
  addProject: []
  locate: [project: ProjectEntry]
  relocate: [project: ProjectEntry]
  remove: [project: ProjectEntry]
}>()

// ── Time formatting ──

const totalWords = computed(() => props.projects.reduce((s, p) => s + (p.wordCount || 0), 0))

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)

  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  if (weeks < 52) return `${weeks} 周前`
  return `${Math.floor(weeks / 52)} 年前`
}

function formatWordCount(count: number): string {
  if (count < 1000) return `${count} 字`
  if (count < 10000) return `${(count / 1000).toFixed(1)} 千字`
  return `${(count / 10000).toFixed(1)} 万字`
}

// ── Click handler ──

function handleClick(project: ProjectEntry) {
  if (!project.broken) {
    emit('select', project)
  }
}

// ── Context menu ──

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  project: null as ProjectEntry | null,
})

function handleContextMenu(e: MouseEvent, project: ProjectEntry) {
  contextMenu.show = true
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  contextMenu.project = project
}

function closeContextMenu() {
  contextMenu.show = false
  contextMenu.project = null
}

function handleLocate() {
  if (contextMenu.project) emit('locate', contextMenu.project)
  closeContextMenu()
}

function handleRelocate() {
  if (contextMenu.project) emit('relocate', contextMenu.project)
  closeContextMenu()
}

function handleRemove() {
  if (contextMenu.project) emit('remove', contextMenu.project)
  closeContextMenu()
}
</script>

<style scoped>
.project-library {
  width: 100%;
  height: 100%;
  background: var(--color-bg-page, #faf6ee);
  padding: 32px 40px;
  overflow-y: auto;
  font-family: var(--font-sans, "PingFang SC", sans-serif);
}

/* ── Header ── */

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #4a4032);
}

.title-icon {
  color: var(--color-accent, #b5652f);
}

.header-sub {
  font-size: 12px;
  color: var(--color-text-muted, #b0a48f);
  margin-top: 2px;
}

.actions {
  display: flex;
  gap: 10px;
}

.btn {
  font-size: 13px;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease, box-shadow 0.1s ease;
  border: none;
  font-family: inherit;
  line-height: 1.4;
  user-select: none;
}

.btn:active {
  transform: scale(0.96);
}

.btn-accent {
  background: var(--color-accent-bg, #f5e4d5);
  color: var(--color-accent, #b5652f);
  border: 1px solid var(--color-accent-border, #dba876);
}

.btn-accent:hover {
  background: var(--color-accent-border, #dba876);
  color: var(--color-accent-hover, #9c5527);
}

.btn-accent:active {
  background: var(--color-accent, #b5652f);
  color: var(--color-text-on-accent, #faf6ee);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary, #8a7d68);
  border: 1px solid var(--color-border, #e3d9c8);
}

.btn-ghost:hover {
  background: var(--color-bg-surface-hover, #ebe3d4);
}

.btn-ghost:active {
  background: var(--color-border, #e3d9c8);
}

/* ── Empty state ── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 160px);
  text-align: center;
}

.empty-icon {
  color: var(--color-accent, #b5652f);
  opacity: 0.35;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary, #4a4032);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 13px;
  color: var(--color-text-muted, #b0a48f);
  margin: 0 0 24px 0;
}

.empty-actions {
  display: flex;
  gap: 10px;
}

/* ── Grid ── */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 14px;
}

/* ── Card ── */

.card {
  background: var(--color-bg-elevated, #ffffff);
  border: 1px solid var(--color-border, #e3d9c8);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  border-color: var(--color-accent-border, #dba876);
  box-shadow: var(--shadow-popover, 0 4px 16px rgba(74, 64, 50, 0.08));
}

.card:active {
  transform: scale(0.99);
}

.card--broken {
  cursor: default;
}

.card--broken .card-cover {
  filter: grayscale(1) opacity(0.6);
}

.card--broken .card-name {
  opacity: 0.6;
}

.card--broken:hover {
  border-color: var(--color-border, #e3d9c8);
  box-shadow: none;
}

/* 书封：渐变 + 左侧书脊，让色块变成“一本书” */
.card-cover {
  width: 100%;
  height: 64px;
  border-radius: 6px 6px 2px 2px;
  margin-bottom: 12px;
  position: relative;
  background: var(--cover-color, #f5e4d5);
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(0, 0, 0, 0.08));
  box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.08);
}

.card-cover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  border-radius: 6px 0 0 2px;
  background: rgba(0, 0, 0, 0.12);
}

/* 封面首字：衬线大写字，让色块封面有内容 */
.card-cover-letter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-voice);
  font-size: 30px;
  font-weight: 700;
  color: color-mix(in srgb, var(--cover-color) 35%, var(--color-text-primary));
  opacity: 0.7;
  user-select: none;
}

.card-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #4a4032);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #8a7d68);
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-sep {
  color: var(--color-text-muted, #b0a48f);
}

.card-broken {
  color: var(--color-warning, #c08a2e);
  display: flex;
  align-items: center;
  gap: 3px;
}

/* ── Add card placeholder ── */

.card--add {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #b0a48f);
  font-size: 13px;
  border-style: dashed;
  border-color: var(--color-border-strong, #d3c4ab);
  min-height: 148px;
}

.card--add:hover {
  border-color: var(--color-accent-border, #dba876);
  color: var(--color-accent, #b5652f);
  box-shadow: none;
}

/* ── Context menu ── */

.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 998;
}

/* 右键菜单：轻微缩放淡入，减少“弹出生硬”感 */
.ctx-menu-enter-active {
  transition: transform 0.1s ease, opacity 0.1s ease;
}
.ctx-menu-enter-from,
.ctx-menu-leave-to {
  transform: scale(0.95) translateY(-4px);
  opacity: 0;
}

.context-menu {
  position: fixed;
  z-index: 999;
  min-width: 160px;
  background: var(--color-bg-elevated, #fefcf7);
  border: 1px solid var(--color-border, #e3d9c8);
  border-radius: 8px;
  box-shadow: var(--shadow-popover, 0 4px 16px rgba(74, 64, 50, 0.08));
  padding: 4px 0;
}

.context-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-text-primary, #4a4032);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s ease;
}

.context-item:hover {
  background: var(--color-bg-surface-hover, #ebe3d4);
}

.context-item--danger {
  color: var(--color-danger, #a13f35);
}

.context-divider {
  height: 1px;
  background: var(--color-border, #e3d9c8);
  margin: 4px 0;
}
</style>
