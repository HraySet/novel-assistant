<template>
  <div class="project-library">
    <!-- 顶栏 -->
    <div class="header">
      <span class="title">我的项目</span>
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
      <div class="empty-icon">📖</div>
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
          :style="{ background: project.color }"
        />
        <div class="card-name">{{ project.name }}</div>
        <div class="card-meta">
          <span v-if="project.broken" class="card-broken">路径失效</span>
          <template v-else>
              <span>{{ formatTime(project.lastOpened) }}</span>
              <span v-if="project.wordCount" class="card-sep">·</span>
              <span v-if="project.wordCount">{{ formatWordCount(project.wordCount) }}</span>
          </template>
        </div>
      </div>

      <!-- 添加项目占位 -->
      <div class="card card--add" @click="$emit('addProject')">
        <span>+ 添加项目</span>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
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
import type { ProjectEntry } from '../types/project'
import { pickCoverColor } from '../types/project'

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
  height: 100vh;
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
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #4a4032);
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
  transition: background 0.15s ease, opacity 0.15s ease;
  border: none;
  font-family: inherit;
  line-height: 1.4;
}

.btn:active {
  transform: scale(0.98);
}

.btn-accent {
  background: var(--color-accent-bg, #f5e4d5);
  color: var(--color-accent, #b5652f);
  border: 1px solid var(--color-accent-border, #dba876);
}

.btn-accent:hover {
  background: var(--color-accent-border, #dba876);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary, #8a7d68);
  border: 1px solid var(--color-border, #e3d9c8);
}

.btn-ghost:hover {
  background: var(--color-bg-surface-hover, #ebe3d4);
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
  font-size: 48px;
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
  border-radius: 10px;
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
  opacity: 0.5;
  cursor: default;
}

.card--broken:hover {
  border-color: var(--color-border, #e3d9c8);
  box-shadow: none;
}

.card-cover {
  width: 100%;
  height: 64px;
  border-radius: 6px;
  margin-bottom: 12px;
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
}

/* ── Add card placeholder ── */

.card--add {
  display: flex;
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
