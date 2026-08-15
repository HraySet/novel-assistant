<template>
  <div class="ctx-bar">
    <div class="ctx-row">
      <button
        v-for="t in toggles"
        :key="t.key"
        class="ctx-chip"
        :class="{ active: t.value, 'ctx-chip--disabled': t.disabled }"
        :title="t.disabled ? t.emptyTitle : t.title"
        :aria-pressed="t.value"
        :disabled="t.disabled"
        @click="toggle(t.key)"
      >
        {{ t.label }}
        <span v-if="t.count !== undefined && t.count > 0" class="ctx-chip-count"> · {{ t.count }}</span>
      </button>
      <!-- 前情章数选择：始终占位渲染，避免开关切换时布局跳动；关闭前情时置灰 -->
      <select
        v-model.number="recapChapters"
        class="ctx-select"
        :class="{ 'ctx-select--off': !opts.recap }"
        :disabled="!opts.recap"
        :title="opts.recap ? '前情提要包含最近几章' : '开启前情提要后可选章数'"
      >
        <option v-for="n in RECAP_OPTIONS" :key="n" :value="n">前 {{ n }} 章</option>
      </select>
    </div>
    <div v-if="label" class="ctx-label" :title="label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore, type AiContextOptions } from '../stores/settings'

/** 前情提要可选章数（常量提出来，方便后续按项目章节总数动态过滤） */
const RECAP_OPTIONS = [2, 4, 6, 8]

const props = defineProps<{
  label: string
  /** 各上下文组成的可用数量：角色/大纲文件数、概述是否存在、前情可用章数 */
  counts?: { roles: number; outlines: number; project: number; recap: number }
}>()

const settings = useSettingsStore()
const opts = computed(() => settings.aiContextOptions)

type ToggleKey = 'roles' | 'outlines' | 'project' | 'recap'

const toggles = computed(() => [
  { key: 'roles' as const, label: '角色设定', title: '包含 角色/ 目录下的角色设定', emptyTitle: '角色/ 目录为空，先创建角色卡', value: opts.value.roles, count: props.counts?.roles, disabled: props.counts?.roles === 0 },
  { key: 'outlines' as const, label: '剧情大纲', title: '包含 大纲/ 目录下的大纲', emptyTitle: '大纲/ 目录为空，先创建大纲', value: opts.value.outlines, count: props.counts?.outlines, disabled: props.counts?.outlines === 0 },
  { key: 'project' as const, label: '项目简介', title: '包含项目根目录的 _project.md', emptyTitle: '项目根目录没有 _project.md，先写项目概述', value: opts.value.project, count: props.counts?.project, disabled: props.counts?.project === 0 },
  { key: 'recap' as const, label: '前情提要', title: '包含最近章节的摘要或章尾片段（防止剧情矛盾）', emptyTitle: '当前是第一章，暂无前情', value: opts.value.recap, count: props.counts?.recap, disabled: props.counts?.recap === 0 },
])

const recapChapters = computed({
  get: () => opts.value.recapChapters,
  set: (v: number) => settings.setAiContextOptions({ recapChapters: v }),
})

function toggle(key: ToggleKey) {
  const t = toggles.value.find((x) => x.key === key)
  if (t && t.count === 0) return
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

.ctx-chip:hover:not(:disabled) {
  border-color: var(--color-accent-border);
  color: var(--color-text-primary);
}

.ctx-chip.active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}

.ctx-chip--disabled {
  opacity: 0.45;
  cursor: default;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.ctx-chip-count {
  color: var(--color-text-muted);
  font-size: 10px;
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

.ctx-select:hover:not(:disabled) {
  border-color: var(--color-accent-border);
}

.ctx-select--off {
  opacity: 0.45;
  cursor: default;
}

/* 上下文说明允许换行完整展示（决定 AI 生成质量的重要信息，不再单行截断） */
.ctx-label {
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-text-muted);
  word-break: break-word;
}
</style>
