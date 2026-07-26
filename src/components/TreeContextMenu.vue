<template>
    <Teleport to="body">
        <div v-if="modelValue" ref="menuRef" class="context-menu" :style="{ left: x + 'px', top: y + 'px' }">
            <slot />
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'

const props = defineProps<{
    modelValue: boolean
    x: number
    y: number
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
}>()

const menuRef = ref<HTMLElement>()

function closeMenu() {
    if (props.modelValue) emit('update:modelValue', false)
}

onClickOutside(menuRef, closeMenu)

watch(() => props.modelValue, (value) => {
    if (!value) return
    requestAnimationFrame(() => {
        const menu = menuRef.value
        if (!menu) return
        const maxX = window.innerWidth - menu.offsetWidth - 8
        const maxY = window.innerHeight - menu.offsetHeight - 8
        menu.style.left = `${Math.min(props.x, maxX)}px`
        menu.style.top = `${Math.min(props.y, maxY)}px`
    })
})
</script>

<style scoped>
.context-menu {
    position: fixed;
    z-index: 300;
    min-width: 140px;
    padding: 4px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-popover);
}
</style>
