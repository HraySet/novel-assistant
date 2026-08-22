<template>
  <Transition name="fade">
  <div v-if="openFiles.length > 0" class="tabs-bar">
    <div class="tabs-scroll" ref="scrollRef">
      <div
        v-for="file in openFiles"
        :key="file.path"
        class="tab-item"
        :class="{ 'tab-item--active': openFile?.path === file.path }"
        :title="file.path + '（中键点击关闭，右键更多操作）'"
        role="button"
        tabindex="0"
        @click="switchTab(file.path)"
        @auxclick.middle.prevent="closeTab(file.path)"
        @keydown.enter="switchTab(file.path)"
        @contextmenu.prevent="openTabMenu($event, file.path)"
      >
        <StatusDot v-if="file.isDirty" level="low" size="sm" :glow="false" class="shrink-0" />
        <span class="tab-name">{{ file.name }}</span>
        <button
          class="tab-close"
          @click.stop="closeTab(file.path)"
          title="关闭"
        ><X :size="12" /></button>
      </div>
    </div>
  </div>
  </Transition>

  <!-- tab 右键菜单 -->
  <Teleport to="body">
    <div
      v-if="tabMenu"
      ref="tabMenuRef"
      class="tab-menu"
      :style="{ left: tabMenu.x + 'px', top: tabMenu.y + 'px' }"
      @click.stop
    >
      <button class="tab-menu-item" @click="tabAction('close')">关闭标签</button>
      <button class="tab-menu-item" @click="tabAction('closeOthers')">关闭其他标签</button>
      <button class="tab-menu-item" @click="tabAction('closeLeft')">关闭左侧标签</button>
      <button class="tab-menu-item" @click="tabAction('closeRight')">关闭右侧标签</button>
      <div class="tab-menu-divider" />
      <button class="tab-menu-item" @click="tabAction('copyPath')">复制路径</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { onClickOutside } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { useFileStore } from '../stores/file'
import StatusDot from './StatusDot.vue'

const fileStore = useFileStore()
const { openFiles, openFile } = storeToRefs(fileStore)
const scrollRef = ref<HTMLElement>()

function switchTab(path: string) {
  if (path === fileStore.openFile?.path) return
  fileStore.handleFileSelect(path)
}

async function closeTab(path: string) {
  // 脏文件先保存再关；保存失败（含写盘期间仍有新键入）时中止关闭，避免丢内容
  const target = openFiles.value.find(f => f.path === path)
  if (target?.isDirty) {
    const saved = await fileStore.saveFile(path)
    if (!saved) return
  }
  fileStore.closeFile(path)
}

// ── 右键菜单 ──
const tabMenu = ref<{ x: number; y: number; path: string } | null>(null)
const tabMenuRef = ref<HTMLElement>()

function openTabMenu(e: MouseEvent, path: string) {
  // 菜单宽度约 140px，避免超出右缘
  tabMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - 150),
    y: e.clientY,
    path,
  }
}

function closeTabMenu() { tabMenu.value = null }

onClickOutside(tabMenuRef, closeTabMenu)

type TabAction = 'close' | 'closeOthers' | 'closeLeft' | 'closeRight' | 'copyPath'

async function tabAction(action: TabAction) {
  const path = tabMenu.value?.path
  const list = openFiles.value
  const idx = path ? list.findIndex((f) => f.path === path) : -1
  closeTabMenu()
  if (idx < 0 || !path) return

  if (action === 'copyPath') {
    try { await navigator.clipboard.writeText(path) } catch { /* 忽略 */ }
    return
  }

  const toClose: string[] = []
  if (action === 'close') toClose.push(path)
  else if (action === 'closeOthers') list.forEach((f, i) => { if (i !== idx) toClose.push(f.path) })
  else if (action === 'closeLeft') list.forEach((f, i) => { if (i < idx) toClose.push(f.path) })
  else if (action === 'closeRight') list.forEach((f, i) => { if (i > idx) toClose.push(f.path) })

  for (const p of toClose) await closeTab(p)
}

// 切换标签时自动滚动到 active tab
watch(() => openFile.value?.path, () => {
  nextTick(() => {
    const el = scrollRef.value?.querySelector('.tab-item--active')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})
</script>

<style scoped>
.tabs-bar {
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.tabs-scroll {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs-scroll::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px 0 10px;
  border-right: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-muted);
  background: transparent;
  border-top: none;
  border-bottom: 2px solid transparent;
  border-left: none;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 150px;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.tab-item:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}
.tab-item--active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
  background: var(--color-bg-page);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  width: 16px; height: 16px;
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; line-height: 1;
  color: var(--color-text-muted);
  background: none; border: none; cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.1s, background 0.1s, color 0.1s;
}
.tab-item:hover .tab-close,
.tab-item--active .tab-close { opacity: 1; }
.tab-close:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-danger);
}

/* ── 右键菜单 ── */
.tab-menu {
  position: fixed;
  z-index: 400;
  min-width: 140px;
  padding: 4px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-popover);
  animation: tab-menu-in 0.1s ease;
}
@keyframes tab-menu-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.tab-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  font-size: 12px;
  font-family: inherit;
  border: none;
  background: none;
  color: var(--color-text-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.tab-menu-item:hover { background: var(--color-bg-surface-hover); }
.tab-menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

/* 标签栏整体淡入淡出，关闭最后一个标签时布局不“咯噔” */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
