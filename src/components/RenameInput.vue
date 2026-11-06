<template>
  <input
    ref="renameInputRef"
    v-model="renameValue"
    class="rename-input"
    spellcheck="false"
    @click.stop
    @keydown.enter="handleConfirm"
    @keydown.escape="handleCancel"
    @blur="handleConfirm"
  />
</template>

<script setup lang="ts">
import { useRename } from '../composables/useRename'

const props = defineProps<{
  nodePath: string
  nodeName: string
  isDir: boolean
}>()

// useRename 内部持有 renameValue 与 renameInputRef 两个 ref，
// 通过返回对象解构后模板可直接绑定（ref 自动解包）。
const { renameValue, renameInputRef, handleConfirm, handleCancel } = useRename(
  props.nodePath,
  props.nodeName,
  props.isDir,
)
</script>

<style scoped>
.rename-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-accent-border);
  border-radius: var(--radius-sm);
  padding: 1px 4px;
  outline: none;
}
</style>
