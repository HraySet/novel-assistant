<template>
  <div class="flex flex-col h-full">
    <div class="mb-6 px-1">
      <span :class="tx('text-gray-300', 'text-gray-700')" class="text-sm font-semibold">设置</span>
    </div>
    <nav class="space-y-1 flex-1">
      <button v-for="item in navItems" :key="item.key"
        class="w-full text-left px-3 py-2 rounded-lg transition-all"
        :class="section === item.key
          ? tx('bg-purple-500/15 text-purple-400 border border-purple-500/20', 'bg-purple-500/10 text-purple-600 border border-purple-500/20')
          : tx('text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent', 'text-gray-400 hover:text-gray-700 hover:bg-black/[0.03] border border-transparent')"
        @click="$emit('update:modelValue', item.key)">
        <div class="text-sm font-medium">{{ item.label }}</div>
        <div :class="tx('text-gray-600', 'text-gray-400')" class="text-[10px] truncate">{{ item.desc }}</div>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from "../stores/settings";
const s = useSettingsStore();
const tx = (d: string, l: string) => s.themeDark ? d : l;

defineProps<{ section: string }>();
defineEmits<{ "update:modelValue": [v: string] }>();

const navItems = [
  { key: "general", label: "工作区", desc: "目录 · 作品管理" },
  { key: "writing", label: "写作", desc: "目标 · 编辑器偏好" },
  { key: "theme", label: "主题", desc: "深色 · 浅色 · 强调色" },
  { key: "ai", label: "AI 接口", desc: "服务商 · 密钥 · 模型" },
  { key: "about", label: "关于", desc: "版本 · 技术栈" },
];
</script>
