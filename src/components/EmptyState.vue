<template>
  <div class="flex flex-col items-center justify-center gap-3 text-center" :class="compact ? 'py-8' : 'flex-1'">
    <div
      class="rounded-2xl flex items-center justify-center"
      :class="compact ? 'w-12 h-12 text-xl' : 'w-14 h-14 text-2xl'"
      :style="{ backgroundColor: 'var(--surface-accent)' }"
    >
      <template v-if="typeof icon === 'string'">{{ icon }}</template>
      <component :is="icon" v-else />
    </div>
    <div>
      <p :style="{ color: 'var(--text-secondary)' }" class="text-sm font-medium mb-1">{{ title }}</p>
      <p v-if="subtitle" :style="{ color: 'var(--text-tertiary)' }" class="text-xs">{{ subtitle }}</p>
    </div>
    <button
      v-if="actionLabel"
      class="px-4 py-2 rounded-[var(--radius-md)] text-xs font-medium transition-colors"
      :style="{ backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </button>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** emoji 字符串或 ionicons 组件 */
  icon: string | object;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  compact?: boolean;
}>();
defineEmits<{ (e: "action"): void }>();
</script>
