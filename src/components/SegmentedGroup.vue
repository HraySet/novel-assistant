<template>
  <div class="flex gap-2" :class="wrap ? 'flex-wrap' : ''">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="rounded-[var(--radius-md)] transition-all"
      :class="size === 'sm' ? 'px-2.5 py-1.5 text-xs font-medium' : 'px-4 py-2 text-sm font-medium'"
      :style="modelValue === opt.value ? activeStyle : inactiveStyle"
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

const activeStyle = { backgroundColor: "var(--color-accent)", color: "var(--color-text-on-accent)" };
const inactiveStyle = { backgroundColor: "var(--color-bg-surface)", color: "var(--color-text-secondary)" };
</script>
