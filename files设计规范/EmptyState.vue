<template>
  <div class="flex flex-col items-center justify-center gap-3 text-center" :class="compact ? 'py-8' : 'flex-1'">
    <div class="rounded-[var(--radius-lg)] flex items-center justify-center"
      :class="compact ? 'w-12 h-12' : 'w-14 h-14'"
      :style="{ backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }">
      <n-icon :size="compact ? 20 : 24">
        <component :is="icon" />
      </n-icon>
    </div>
    <div>
      <p :style="{ color: 'var(--text-secondary)' }" class="text-sm font-medium mb-1">{{ title }}</p>
      <p v-if="subtitle" :style="{ color: 'var(--text-tertiary)' }" class="text-xs">{{ subtitle }}</p>
    </div>

    <!-- 自定义内容（比如虚线预览框、自定义按钮）；不需要时用下面的 actionLabel 走默认按钮即可 -->
    <slot />

    <button v-if="actionLabel"
      class="px-4 py-2 rounded-[var(--radius-md)] text-xs font-medium transition-colors hover:opacity-80"
      :style="{ backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }" @click="$emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { NIcon } from "naive-ui";

defineProps<{
  /** ionicons5 图标组件，不再接受 emoji 字符串 */
  icon: unknown;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  /** compact: 用在小区域（比如搜索无结果）· 默认: 占满整个面板高度 */
  compact?: boolean;
}>();
defineEmits<{ (e: "action"): void }>();
</script>