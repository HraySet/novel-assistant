<template>
  <div class="flex gap-2" :class="wrap ? 'flex-wrap' : ''">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="seg-btn rounded-[var(--radius-md)] transition-all"
      :class="[size === 'sm' ? 'px-2.5 py-1.5 text-xs font-medium' : 'px-4 py-2 text-sm font-medium', modelValue === opt.value && 'seg-btn--active']"
      @click="$emit('update:modelValue', opt.value)"
    >
      <slot :option="opt" :active="modelValue === opt.value">{{ opt.label }}</slot>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 用于"简单单选按钮组"：字数目标、字号、AI 服务商、设定库分类 tab。
 * 如果选项需要展示图标+描述这种更丰富的信息（比如布局模式选择），
 * 用 SurfaceCard 手动拼装，不要硬塞进这个组件。
 */
withDefaults(
  defineProps<{
    options: { value: string | number; label: string }[];
    modelValue: string | number;
    size?: "sm" | "md";
    wrap?: boolean;
  }>(),
  { size: "md", wrap: true }
);

defineEmits<{ (e: "update:modelValue", v: string | number): void }>();
</script>

<style scoped>
/* 颜色全部走 class（而非内联 style），hover/focus/active 才能正常叠加与过渡 */
.seg-btn {
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
  border: 1px solid transparent;
  font-family: inherit;
  cursor: pointer;
}

.seg-btn:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.seg-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.seg-btn:active {
  filter: brightness(0.95);
}

.seg-btn--active {
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
}

.seg-btn--active:hover {
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
}
</style>
