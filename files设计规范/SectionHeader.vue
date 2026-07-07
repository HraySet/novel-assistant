<template>
  <div class="flex items-center justify-between pb-2.5 mb-2 border-b shrink-0"
    :style="{ borderColor: 'var(--border-hairline)' }">
    <div class="flex items-center gap-1.5">
      <n-icon size="14" :style="{ color: 'var(--accent)' }">
        <component :is="icon" />
      </n-icon>
      <span :style="{ color: 'var(--text-secondary)' }" class="text-[11px] font-semibold uppercase tracking-wider">
        {{ label }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <span v-if="count !== undefined" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] tabular-nums">
        {{ count }}
      </span>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NIcon } from "naive-ui";

defineProps<{
  icon: unknown;
  label: string;
  count?: number | string;
}>();
</script>
