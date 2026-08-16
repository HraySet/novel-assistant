<template>
  <Teleport to="body">
    <Transition name="base-modal">
      <div
        v-if="show"
        class="base-overlay"
        :style="{
          background: overlayColor,
          alignItems: align === 'top' ? 'flex-start' : 'center',
          backdropFilter: backdropBlur ? 'blur(4px)' : undefined,
          WebkitBackdropFilter: backdropBlur ? 'blur(4px)' : undefined,
          paddingTop: align === 'top' ? '120px' : undefined,
        }"
        @click.self="onOverlayClick"
      >
        <div class="base-box" :style="{ width, height, maxHeight }">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'

/**
 * 全局弹窗基座：遮罩色、Esc 关闭、遮罩点击关闭、进出场动画（遮罩淡入 +
 * 弹窗位移缩放）在此统一定义。内容、头部按钮、盒内布局由各弹窗自行负责。
 */
const props = withDefaults(
  defineProps<{
    show: boolean
    /** 遮罩色（全 App 默认统一暖褐，个别弹窗可覆盖） */
    overlayColor?: string
    /** 点击遮罩关闭 */
    closeOnOverlay?: boolean
    /** Esc 关闭（自带 keydown 监听，弹窗无需各自实现） */
    closeOnEsc?: boolean
    /** 对齐方式：center 居中 / top 顶部呼出（如搜索框） */
    /** 遮罩毛玻璃（回收站等需要层次感的弹窗用） */
    backdropBlur?: boolean
    align?: 'center' | 'top'
    width?: string
    height?: string
    maxHeight?: string
  }>(),
  {
    overlayColor: 'rgba(74, 64, 50, 0.1)',
    closeOnOverlay: true,
    closeOnEsc: true,
    align: 'center',
  },
)

const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEsc) emit('close')
}

function onOverlayClick() {
  if (props.closeOnOverlay) emit('close')
}

watch(
  () => props.show,
  (v) => {
    if (v) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.base-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  justify-content: center;
}

.base-box {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
  max-width: calc(100vw - 48px);
  transition: transform 0.15s ease, opacity 0.15s ease;
}

/* 内容根容器占满盒高并允许收缩：内容超高时由弹窗自身的滚动区接管，
   否则 flex 子项默认 min-height:auto 会把盒子撑出 max-height 被裁剪（滚不动） */
.base-box :deep(> *) {
  flex: 1;
  min-height: 0;
}

/* 进出场：遮罩淡入淡出 + 弹窗位移缩放 */
.base-modal-enter-active,
.base-modal-leave-active {
  transition: opacity 0.15s ease;
}
.base-modal-enter-from,
.base-modal-leave-to {
  opacity: 0;
}
.base-modal-enter-from .base-box,
.base-modal-leave-to .base-box {
  transform: scale(0.96) translateY(6px);
  opacity: 0;
}
</style>
