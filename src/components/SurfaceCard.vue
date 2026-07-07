<template>
  <div
    class="rounded-[var(--radius-md)] border transition-colors duration-150"
    :class="[paddingClass, interactive && !selected ? 'sc-interactive' : '']"
    :style="cardStyle"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 内边距预设。none 用于自己控制内边距的场景（比如带展开区域的行）。 */
    padding?: "none" | "sm" | "md";
    /** 是否响应 hover（列表行通常为 true，纯展示卡片通常为 false）。 */
    interactive?: boolean;
    /** 是否处于"当前选中/激活"状态 —— 触发强调色竖条这一唯一的选中语法。 */
    selected?: boolean;
  }>(),
  { padding: "md", interactive: false, selected: false }
);

const paddingClass = computed(
  () => ({ none: "", sm: "px-3 py-2.5", md: "p-4" }[props.padding])
);

const cardStyle = computed(() => {
  if (props.selected) {
    return {
      backgroundColor: "var(--surface-accent)",
      borderColor: "var(--border-accent)",
      borderLeft: "2px solid var(--accent)",
    };
  }
  return {
    backgroundColor: "var(--surface-1)",
    borderColor: "var(--border-hairline)",
  };
});
</script>

<style scoped>
.sc-interactive:hover {
  background-color: var(--surface-2);
  border-color: var(--border-soft);
}
</style>
