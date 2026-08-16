<template>
  <div
    class="sc-root"
    :class="[paddingClass, interactive && !selected ? 'sc-interactive' : '', selected ? 'sc-selected' : '']"
    :tabindex="interactive ? 0 : undefined"
    :role="interactive ? 'button' : undefined"
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
</script>

<style scoped>
.sc-root {
  border: 1px solid var(--color-border);
  /* 选中态只切换左边条颜色，不改变宽度——避免 0→2px 的硬跳变与内容重排 */
  border-left: 2px solid transparent;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.sc-root.sc-selected {
  background-color: var(--color-accent-bg);
  border-color: var(--color-accent-border);
  border-left-color: var(--color-accent);
  /* 极淡内阴影加强选中感（与左边条同源，不引入第二种选中语法） */
  box-shadow: inset 0 0 0 1px var(--color-accent-border);
}

/* interactive 卡片：hover 微亮、按下极轻反馈、键盘焦点可见 */
.sc-interactive:hover {
  background-color: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
}

.sc-interactive:active {
  background-color: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
  filter: brightness(0.97);
}

.sc-interactive:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
}
</style>
