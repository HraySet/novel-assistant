<template>
  <Teleport to="body">
    <div class="toast-host" role="region" aria-label="通知">
      <TransitionGroup name="toast">
        <div
          v-for="t in toastStore.toasts"
          :key="t.id"
          class="toast-item"
          :class="'toast-item--' + t.type"
          role="status"
        >
          <span class="toast-icon" aria-hidden="true">
            <CheckCircle2 v-if="t.type === 'success'" :size="15" />
            <XCircle v-else-if="t.type === 'error'" :size="15" />
            <AlertTriangle v-else-if="t.type === 'warning'" :size="15" />
            <Info v-else :size="15" />
          </span>
          <div class="toast-body">
            <div class="toast-title">{{ t.title }}</div>
            <div v-if="t.message" class="toast-message">{{ t.message }}</div>
          </div>
          <button class="toast-close" title="关闭" @click="toastStore.dismiss(t.id)">
            <X :size="12" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-vue-next'
import { useToastStore } from '../stores/toast'

const toastStore = useToastStore()
</script>

<style scoped>
.toast-host {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(360px, calc(100vw - 32px));
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-popover);
}

/* 类型色只作用于图标与标题，不整体染色，保持浅色/深色主题下的可读性 */
.toast-icon { flex-shrink: 0; margin-top: 1px; }
.toast-item--success .toast-icon { color: var(--color-success); }
.toast-item--error .toast-icon { color: var(--color-danger); }
.toast-item--warning .toast-icon { color: var(--color-warning); }
.toast-item--info .toast-icon { color: var(--color-accent); }
.toast-item--success .toast-title { color: var(--color-success); }
.toast-item--error .toast-title { color: var(--color-danger); }
.toast-item--warning .toast-title { color: var(--color-warning); }

.toast-body { flex: 1; min-width: 0; }
.toast-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.4;
}
.toast-message {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-top: 2px;
  word-break: break-word;
}

.toast-close {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: none;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
}
.toast-close:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

/* 入场：轻微上浮淡入；离场：右滑淡出 */
.toast-enter-active { transition: transform 0.18s ease, opacity 0.18s ease; }
.toast-leave-active { transition: transform 0.15s ease, opacity 0.15s ease; }
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
