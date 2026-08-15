<template>
  <span
    class="inline-block rounded-full shrink-0"
    :class="size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5'"
    :style="{ backgroundColor: color, boxShadow: glow ? `0 0 6px ${color}` : 'none' }"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** none: 未开始 · low: 起步 · mid: 进行中 · high: 完成度高 */
    level: "none" | "low" | "mid" | "high";
    size?: "sm" | "md";
    glow?: boolean;
  }>(),
  { size: "sm", glow: true }
);

const color = computed(
  () =>
    ({
      none: "var(--color-text-muted)",
      low: "var(--color-accent)",
      mid: "var(--color-warning)",
      high: "var(--color-success)",
    }[props.level])
);
</script>
