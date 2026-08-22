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
        <div ref="boxRef" class="base-box" :style="{ width, height, maxHeight }">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue'

/**
 * 全局弹窗基座：遮罩色、Esc 关闭、遮罩点击关闭、进出场动画（遮罩淡入 +
 * 弹窗位移缩放）在此统一定义。内容、头部按钮、盒内布局由各弹窗自行负责。
 * 焦点管理：打开时自动聚焦首个可聚焦元素，Tab 焦点圈定在弹窗内，
 * 关闭后把焦点还给触发元素（键盘可达性）。
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

const boxRef = ref<HTMLElement>()
/** 打开弹窗前处于焦点的元素，关闭后归还焦点 */
let lastFocused: HTMLElement | null = null

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getFocusables(): HTMLElement[] {
  const box = boxRef.value
  if (!box) return []
  return Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
  )
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEsc) {
    emit('close')
    return
  }
  // Tab：焦点圈定在弹窗内（Shift+Tab 反向循环）
  if (e.key === 'Tab') {
    const focusables = getFocusables()
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (!boxRef.value?.contains(active)) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function onOverlayClick() {
  if (props.closeOnOverlay) emit('close')
}

watch(
  () => props.show,
  (v) => {
    if (v) {
      lastFocused = document.activeElement as HTMLElement | null
      window.addEventListener('keydown', onKey)
      // 自动聚焦首个可聚焦元素（输入类弹窗体验更好）
      nextTick(() => {
        const target = getFocusables()[0]
        target?.focus()
      })
    } else {
      window.removeEventListener('keydown', onKey)
      // 关闭后把焦点还给触发元素
      const el = lastFocused
      lastFocused = null
      if (el) nextTick(() => el.focus?.())
    }
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
