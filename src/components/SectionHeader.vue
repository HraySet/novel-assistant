<template>
  <div class="flex items-center justify-between pb-3 mb-3 border-b shrink-0"
    :style="{ borderColor: 'var(--border-hairline)' }">
    <div class="flex items-center gap-2">
      <n-icon size="16" :style="{ color: 'var(--accent)' }">
        <component :is="icon" />
      </n-icon>
      <span :style="{ color: 'var(--text-secondary)' }" class="text-[14px] font-semibold">
        {{ label }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <span v-if="count !== undefined"
        :style="{ backgroundColor: 'var(--surface-2)', color: 'var(--text-tertiary)' }"
        class="text-[10px] tabular-nums px-1.5 py-0.5 rounded-[var(--radius-sm)] font-medium">
        {{ count }}
      </span>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: unknown;
  label: string;
  count?: number | string;
}>();
</script>
