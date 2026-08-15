<template>
  <div class="topbar h-9 flex items-center px-3 gap-3 shrink-0 border-b bg-bg-surface"
    style="border-color: var(--color-border)">
    
    <!-- 项目名 → 回项目库 -->
    <button class="topbar-project" @click="$emit('goLibrary')">
      <FolderOpen :size="14" class="flex-shrink-0" />
      <span class="topbar-project-name">{{ projectName }}</span>
      <span v-if="isDirty" class="text-warning text-[10px] ml-0.5">●</span>
    </button>

    <div class="flex-1" />

    <!-- 文件名（居中） -->
    <span v-if="fileName" class="text-xs text-text-secondary truncate max-w-[240px] text-center">
      {{ fileName }}
    </span>

    <div class="flex-1" />

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1">
      <button class="topbar-btn" title="后退" :disabled="!hasBack" @click="$emit('goBack')">
        <ChevronLeft :size="16" />
      </button>
      <button class="topbar-btn" title="前进" :disabled="!hasForward" @click="$emit('goForward')">
        <ChevronRight :size="16" />
      </button>
      <button class="topbar-btn" title="切换主题" @click="handleToggleTheme">
        <Sun v-if="isDark" :size="14" />
        <Moon v-else :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'

defineProps<{
  projectName: string
  fileName?: string
  isDirty?: boolean
  hasBack?: boolean
  hasForward?: boolean
}>()

defineEmits<{
  goLibrary: []
  goBack: []
  goForward: []
}>()

const settings = useSettingsStore()
const isDark = computed(() => settings.themeDark)

function handleToggleTheme() {
  settings.toggleDark()
}
</script>

<style scoped>
.topbar-project {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s ease, color 0.1s ease;
}

.topbar-project:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-project-name {
  font-size: 12px;
  font-weight: 500;
}

.topbar-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.topbar-btn:hover:not(:disabled) {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.topbar-btn:disabled {
  opacity: 0.25;
  cursor: default;
}
</style>
