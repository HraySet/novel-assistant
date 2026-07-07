<template>
  <span class="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] truncate inline-block" :style="style">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** accent: 强调色（跟随用户主题色）· info/success/danger: 固定语义色 · neutral: 中性灰 */
    variant?: "neutral" | "accent" | "info" | "success" | "danger";
  }>(),
  { variant: "neutral" }
);

const style = computed(() => {
  switch (props.variant) {
    case "accent":
      return { backgroundColor: "var(--surface-accent)", color: "var(--accent)" };
    case "info":
      return { backgroundColor: "rgba(6,182,212,0.1)", color: "var(--status-info)" };
    case "success":
      return { backgroundColor: "rgba(34,197,94,0.1)", color: "var(--status-success)" };
    case "danger":
      return { backgroundColor: "rgba(239,68,68,0.1)", color: "var(--status-danger)" };
    default:
      return { backgroundColor: "var(--surface-2)", color: "var(--text-secondary)" };
  }
});
</script>
