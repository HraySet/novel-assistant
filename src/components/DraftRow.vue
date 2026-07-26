<template>
  <div class="draft-row" :style="{ paddingLeft: depth * 14 + 4 + 'px' }">
    <FileText v-if="type === 'file'" :size="13" class="text-text-muted shrink-0" />
    <Folder v-else :size="13" class="text-text-muted shrink-0" />
    <input
      ref="inputRef"
      v-model="value"
      class="draft-input"
      spellcheck="false"
      @keydown.enter="confirm"
      @keydown.escape="cancel"
      @blur="confirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { FileText, Folder } from 'lucide-vue-next'

const props = defineProps<{
  type: 'file' | 'dir'
  defaultName: string
  depth?: number
}>()

const emit = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

const value = ref(props.defaultName)
const inputRef = ref<HTMLInputElement>()
let confirmed = false

onMounted(async () => {
  await nextTick()
  const el = inputRef.value
  if (!el) return
  el.focus()
  if (props.type === 'file') {
    const dot = props.defaultName.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : props.defaultName.length)
  } else {
    el.select()
  }
})

function confirm() {
  if (confirmed) return
  confirmed = true
  emit('confirm', value.value)
}

function cancel() {
  confirmed = true
  emit('cancel')
}
</script>

<style scoped>
.draft-row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding-right: 6px;
}

.draft-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-accent-border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  outline: none;
}
</style>
