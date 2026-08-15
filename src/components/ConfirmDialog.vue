<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="confirm-overlay" @click.self="$emit('cancel')">
        <div class="confirm-box">
          <div class="confirm-title">{{ title }}</div>
          <div class="confirm-msg">{{ message }}</div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--ghost" @click="$emit('cancel')">{{ cancelLabel }}</button>
            <button
              class="confirm-btn confirm-btn--primary"
              :class="{ 'confirm-btn--danger': danger }"
              @click="$emit('confirm')"
            >
              {{ okLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  show: boolean
  title?: string
  message?: string
  okLabel?: string
  cancelLabel?: string
  danger?: boolean
}>(), {
  title: '确认',
  message: '',
  okLabel: '确定',
  cancelLabel: '取消',
  danger: false,
})

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<style scoped>
/* 自持遮罩与动画，不依赖外部 scoped 样式 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 64, 50, 0.18);
}

.confirm-box {
  min-width: 300px;
  max-width: 420px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  padding: 18px;
}

.confirm-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.confirm-msg {
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  margin-top: 6px;
  white-space: pre-line;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.confirm-btn {
  padding: 5px 16px;
  font-size: 12px;
  font-family: inherit;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}

.confirm-btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.confirm-btn--ghost:hover {
  background: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
}

.confirm-btn--primary {
  background: var(--color-accent);
  color: var(--color-text-on-accent);
  border: 1px solid var(--color-accent);
}

.confirm-btn--primary:hover {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.confirm-btn--danger {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}

.confirm-btn--danger:hover {
  background: var(--color-danger);
  border-color: var(--color-danger);
  filter: brightness(1.1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
