<template>
  <div class="topbar h-10 flex items-center px-3 gap-2 shrink-0 border-b bg-bg-page"
    style="border-color: var(--color-border)">
    
    <!-- 项目名 → 回项目库 -->
    <button class="text-sm font-medium text-text-primary hover:text-accent transition-colors flex items-center gap-1"
      @click="$emit('goLibrary')">
      <span>📁</span>
      <span>{{ projectName }}</span>
      <span v-if="isDirty" class="text-warning text-xs ml-0.5">●</span>
    </button>

    <div class="flex-1" />

    <!-- 文件名 -->
    <span v-if="fileName" class="text-xs text-text-secondary truncate max-w-[200px]">
      {{ fileName }}
    </span>

    <div class="flex-1" />

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1">
      <button class="topbar-btn" title="文件树 (Ctrl+B)" @click="$emit('toggleSidebar')">
        ☰
      </button>
      <button class="topbar-btn" title="后退" @click="$emit('goBack')" :disabled="!hasBack" :class="{ 'opacity-30': !hasBack }">
        ◀
      </button>
      <button class="topbar-btn" title="前进" @click="$emit('goForward')" :disabled="!hasForward" :class="{ 'opacity-30': !hasForward }">
        ▶
      </button>
      <button class="topbar-btn" title="AI 助手" @click="$emit('toggleAi')">
        ✦
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  projectName: string
  fileName?: string
  isDirty?: boolean
  hasBack?: boolean
  hasForward?: boolean
}>()

defineEmits<{
  goLibrary: []
  toggleSidebar: []
  toggleAi: []
  goBack: []
  goForward: []
}>()
</script>

<style scoped>
.topbar-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}

.topbar-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}
</style>
