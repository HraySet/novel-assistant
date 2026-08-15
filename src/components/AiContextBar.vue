<template>
  <div class="ctx-bar">
    <div class="ctx-row">
      <button
        v-for="t in toggles"
        :key="t.key"
        class="ctx-chip"
        :class="{ active: t.value }"
        :title="t.title"
        @click="toggle(t.key)"
      >
        {{ t.label }}
      </button>
      <select
        v-if="opts.recap"
        v-model.number="recapChapters"
        class="ctx-select"
        title="前情提要包含最近几章"
      >
        <option v-for="n in [2, 4, 6, 8]" :key="n" :value="n">前 {{ n }} 章</option>
      </select>
    </div>
    <div v-if="label" class="ctx-label" :title="label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore, type AiContextOptions } from '../stores/settings'

defineProps<{ label: string }>()

const settings = useSettingsStore()
const opts = computed(() => settings.aiContextOptions)

type ToggleKey = 'roles' | 'outlines' | 'project' | 'recap'

const toggles = computed(() => [
  { key: 'roles' as const, label: '角色', title: '包含 角色/ 目录下的角色设定', value: opts.value.roles },
  { key: 'outlines' as const, label: '大纲', title: '包含 大纲/ 目录下的大纲', value: opts.value.outlines },
  { key: 'project' as const, label: '概述', title: '包含项目根目录的 _project.md', value: opts.value.project },
  { key: 'recap' as const, label: '前情', title: '包含最近章节的摘要或章尾片段（防止剧情矛盾）', value: opts.value.recap },
])

const recapChapters = computed({
  get: () => opts.value.recapChapters,
  set: (v: number) => settings.setAiContextOptions({ recapChapters: v }),
})

function toggle(key: ToggleKey) {
  const patch: Partial<AiContextOptions> = {}
  if (key === 'roles') patch.roles = !opts.value.roles
  else if (key === 'outlines') patch.outlines = !opts.value.outlines
  else if (key === 'project') patch.project = !opts.value.project
  else patch.recap = !opts.value.recap
  settings.setAiContextOptions(patch)
}
</script>

<style scoped>
.ctx-bar {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ctx-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ctx-chip {
  font-size: 11px;
  line-height: 1;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
  user-select: none;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.ctx-chip:hover {
  border-color: var(--color-accent-border);
  color: var(--color-text-primary);
}

.ctx-chip.active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}

.ctx-select {
  font-size: 11px;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 3px 5px;
  outline: none;
  font-family: inherit;
  cursor: pointer;
}

.ctx-select:hover {
  border-color: var(--color-accent-border);
}

.ctx-label {
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
