<template>
  <div class="flex gap-2" :class="align === 'between' ? 'justify-between w-full' : ''">
    <slot name="left" />
    <div :class="align === 'between' ? '' : 'ml-auto'" class="flex gap-2">
      <n-button size="small" :quaternary="cancelQuaternary" @click="$emit('cancel')">
        {{ cancelLabel ?? '取消' }}
      </n-button>
      <n-button
        size="small"
        type="primary"
        :disabled="disabled"
        @click="$emit('confirm')"
      >
        {{ confirmLabel ?? '保存' }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton } from "naive-ui";

withDefaults(defineProps<{
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  cancelQuaternary?: boolean;
  align?: 'right' | 'between';
}>(), {
  cancelQuaternary: true,
  align: 'right',
});

defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>
