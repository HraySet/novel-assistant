<template>
  <div class="flex flex-col h-full">
    <div class="mb-5 px-2">
      <span class="text-xs font-semibold tracking-wide text-text-muted uppercase">导航</span>
    </div>
    <nav class="space-y-0.5 flex-1">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        :class="{ 'nav-item--active': section === item.key }"
        @click="$emit('update:modelValue', item.key)"
      >
        <component :is="item.icon" :size="15" class="nav-item-icon" />
        <div class="min-w-0">
          <div class="nav-item-label">{{ item.label }}</div>
          <div class="nav-item-desc">{{ item.desc }}</div>
        </div>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { PenLine, Palette, Bot } from 'lucide-vue-next'

defineProps<{ section: string }>()
defineEmits<{ 'update:modelValue': [v: string] }>()

const navItems = [
  { key: 'writing', label: '写作', desc: '字数目标 · 编辑器偏好', icon: PenLine },
  { key: 'theme', label: '主题', desc: '深色 · 浅色 · 强调色', icon: Palette },
  { key: 'ai', label: 'AI 接口', desc: '服务商 · 密钥 · 模型', icon: Bot },
]
</script>

<style scoped>
.nav-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  text-align: left;
  padding: 7px 10px 7px 8px;
  border-radius: var(--radius-sm);
  border-left: 2px solid transparent;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.nav-item:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-secondary);
}

.nav-item--active {
  background: var(--color-accent-bg);
  border-left-color: var(--color-accent);
  color: var(--color-accent);
}

.nav-item-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: inherit;
  opacity: 0.85;
}

.nav-item-label {
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  line-height: 1.3;
}

.nav-item-desc {
  font-size: 10px;
  color: var(--color-text-muted);
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
}

.nav-item--active .nav-item-desc {
  color: var(--color-accent);
  opacity: 0.7;
}
</style>