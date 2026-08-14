<template>
  <div class="flex flex-col h-full">
    <div class="mb-6 px-1">
      <span class="text-sm font-semibold text-text-primary">导航</span>
    </div>
    <nav class="space-y-1 flex-1">
      <button v-for="item in navItems" :key="item.key"
        class="w-full text-left px-3 py-2 rounded-[var(--radius-sm)] transition-all border"
        :class="section === item.key
          ? 'border-accent-border bg-accent-bg text-accent'
          : 'border-transparent text-text-muted hover:bg-bg-surface-hover hover:text-text-secondary'"
        @click="$emit('update:modelValue', item.key)">
        <div class="text-sm font-medium">{{ item.label }}</div>
        <div class="text-[10px] truncate text-text-muted">{{ item.desc }}</div>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
defineProps<{ section: string }>();
defineEmits<{ 'update:modelValue': [v: string] }>();

const navItems = [
  { key: 'writing', label: '写作', desc: '字数目标 · 编辑器偏好' },
  { key: 'theme', label: '主题', desc: '深色 · 浅色 · 强调色' },
  { key: 'ai', label: 'AI 接口', desc: '服务商 · 密钥 · 模型' },
];
</script>
