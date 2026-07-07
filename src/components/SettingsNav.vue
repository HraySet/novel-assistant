<template>
  <div class="flex flex-col h-full">
    <div class="mb-6 px-1">
      <span :class="tx('text-gray-300', 'text-gray-700')" class="text-sm font-semibold">设置</span>
    </div>
    <nav class="space-y-1 flex-1">
      <button v-for="item in navItems" :key="item.key"
        class="w-full text-left px-3 py-2 rounded-[var(--radius-sm)] transition-all border"
        :style="section === item.key
          ? { backgroundColor: 'var(--surface-accent)', color: 'var(--accent)', borderColor: 'var(--border-accent)' }
          : { color: 'var(--text-tertiary)', borderColor: 'transparent' }"
        :class="section !== item.key ? tx('hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]', 'hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]') : ''"
        @click="$emit('update:modelValue', item.key)">
        <div class="text-sm font-medium">{{ item.label }}</div>
        <div :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] truncate">{{ item.desc }}</div>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";
const s = useSettingsStore();

defineProps<{ section: string }>();
defineEmits<{ "update:modelValue": [v: string] }>();

const navItems = [
  { key: "general", label: "工作区", desc: "目录 · 作品管理" },
  { key: "writing", label: "写作", desc: "目标 · 编辑器偏好" },
  { key: "theme", label: "主题", desc: "深色 · 浅色 · 强调色" },
  { key: "ai", label: "AI 接口", desc: "服务商 · 密钥 · 模型" },
  { key: "stats", label: "统计", desc: "码字日历 · 写作数据" },
  { key: "about", label: "关于", desc: "版本 · 技术栈" },
];
</script>
