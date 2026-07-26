<template>
  <n-button
    v-if="show"
    size="small"
    quaternary
    :type="ctrl.armed.value ? 'error' : 'default'"
    :class="ctrl.armed.value ? 'animate-pulse' : ''"
    @click="ctrl.trigger"
  >
    <template v-if="$slots.icon" #icon>
      <slot name="icon" />
    </template>
    {{ ctrl.armed.value ? (armedLabel ?? '确认删除') : (label ?? '删除') }}
  </n-button>
</template>

<script setup lang="ts">
import { NButton } from "naive-ui";
import type { useConfirmDelete } from "../composables/useConfirmDelete";

defineProps<{
  ctrl: ReturnType<typeof useConfirmDelete>;
  show?: boolean;
  label?: string;
  armedLabel?: string;
}>();
</script>
