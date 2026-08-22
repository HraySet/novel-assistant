<template>
  <header class="titlebar">
    <!-- 品牌区 + 空白区由 Tauri 注入脚本处理窗口拖拽（data-tauri-drag-region）；
         按钮区不在拖拽区域内，点击为普通 DOM 事件，配合 capabilities 权限正常生效 -->
    <div class="titlebar-brand" data-tauri-drag-region>
      <svg class="titlebar-logo" viewBox="0 0 512 512" width="16" height="16" aria-hidden="true">
        <rect width="512" height="512" rx="116" fill="var(--color-accent)" />
        <polygon points="296.5,181.5 323.5,208.5 211,321 175,330 184,294" fill="var(--color-text-on-accent)" />
        <line x1="256" y1="330" x2="337" y2="330" stroke="var(--color-text-on-accent)" stroke-width="18" stroke-linecap="round" />
      </svg>
      <span class="titlebar-name">清笔</span>
    </div>
    <div class="titlebar-spacer" data-tauri-drag-region />
    <div v-if="isTauriEnv" class="titlebar-controls" @mousedown.stop @click.stop>
      <button type="button" class="titlebar-btn" title="最小化" aria-label="最小化" @click="minimize">
        <Minus :size="14" />
      </button>
      <button type="button" class="titlebar-btn" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原' : '最大化'" @click="toggleMaximize">
        <Square v-if="!isMaximized" :size="11" />
        <Copy v-else :size="11" />
      </button>
      <button type="button" class="titlebar-btn titlebar-btn--close" title="关闭" aria-label="关闭" @click="closeWindow">
        <X :size="14" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { Minus, Square, Copy, X } from 'lucide-vue-next'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const isTauriEnv = isTauri()
const isMaximized = ref(false)
/** 浏览器开发模式（npm run dev）下为 null，控制按钮隐藏且不调用 Tauri API */
const win = isTauriEnv ? getCurrentWindow() : null
let unlistenResize: (() => void) | null = null

if (win) {
  void win.isMaximized().then((v) => { isMaximized.value = v })
  // 监听窗口大小变化，同步最大化/还原图标
  win.onResized(() => {
    void win.isMaximized().then((v) => { isMaximized.value = v })
  }).then((fn) => { unlistenResize = fn })
}

function minimize() { if (win) void win.minimize() }
function toggleMaximize() { if (win) void win.toggleMaximize() }
// 关闭走系统流程：会触发 App 的 onCloseRequested（未保存确认）
function closeWindow() { if (win) void win.close() }

onUnmounted(() => { unlistenResize?.() })
</script>

<style scoped>
.titlebar {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  -webkit-user-select: none;
  position: relative;
  z-index: 20;
}

.titlebar-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  cursor: default;
}

.titlebar-logo {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
}

.titlebar-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.titlebar-spacer {
  flex: 1;
  min-width: 0;
}

.titlebar-controls {
  display: flex;
  align-items: stretch;
  pointer-events: auto;
}

.titlebar-btn {
  width: 42px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}
.titlebar-btn:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.titlebar-btn--close:hover { background: var(--color-danger); color: var(--color-text-on-accent); }
</style>
