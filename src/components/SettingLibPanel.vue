<template>
  <WorkspaceGuard>
    <div class="flex flex-col h-full">
      <SectionHeader :icon="CubeOutline" label="设定库" :count="lib.totalEntries">
        <template #actions>
          <n-tooltip>
            <template #trigger>
              <n-button size="small" quaternary @click="lib.openNewEntry()" class="w-7! h-7!">
                <template #icon><n-icon size="16"><AddOutline /></n-icon></template>
              </n-button>
            </template>
            新建设定
          </n-tooltip>
        </template>
      </SectionHeader>

      <n-input v-model:value="lib.searchQuery" size="small" placeholder="搜索名称、标签、字段、描述..." clearable class="mb-2 shrink-0" />

      <div v-if="tagFilter" class="flex items-center gap-1 mb-2">
        <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">筛选：</span>
        <Tag variant="accent" class="cursor-pointer" @click="clearTagFilter">{{ tagFilter }} ✕</Tag>
      </div>

      <div class="flex-1 overflow-y-auto pr-1 space-y-1.5">
        <EmptyState v-if="displayEntries.length === 0" :icon="CubeOutline"
          :title="lib.searchQuery || tagFilter ? '无匹配设定' : '暂无设定条目'"
          :subtitle="lib.searchQuery || tagFilter ? '' : '点击右上角 + 创建你的第一个设定'"
          :action-label="lib.searchQuery || tagFilter ? undefined : '添加设定'"
          @action="lib.searchQuery || tagFilter ? undefined : lib.openNewEntry()" />

        <SettingEntryCard v-for="entry in displayEntries" :key="entry.id"
          :entry="entry" :del-armed="delConfirm(entry.id).armed.value"
          @edit="lib.openEditEntry" @delete="(id: string) => delConfirm(id).trigger">
          <template #content="{ entry: e }">
            <p v-if="e.notes" :style="{ color: 'var(--text-tertiary)' }" class="text-[11px] leading-relaxed line-clamp-2 mb-1">{{ e.notes }}</p>
            <div v-if="Object.keys(e.fields).length" class="flex flex-wrap gap-1 mb-1">
              <span v-for="(val, key) in firstFields(e.fields, 3)" :key="key"
                :style="{ backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }"
                class="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] truncate max-w-40">{{ key }}: {{ val }}</span>
              <span v-if="Object.keys(e.fields).length > 3" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">
                +{{ Object.keys(e.fields).length - 3 }}
              </span>
            </div>
            <div v-if="e.tags.length" class="flex gap-1 flex-wrap items-center">
              <Tag v-for="t in e.tags.slice(0, 4)" :key="t" variant="accent" class="cursor-pointer hover:opacity-80" @click.stop="filterByTag(t)">{{ t }}</Tag>
              <span v-if="e.tags.length > 4" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">+{{ e.tags.length - 4 }}</span>
            </div>
          </template>
        </SettingEntryCard>
      </div>

      <SettingEntryEditor />
    </div>
  </WorkspaceGuard>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NButton, NInput, NIcon, NTooltip } from "naive-ui";
import { AddOutline, CubeOutline } from "@vicons/ionicons5";
import { useSettingLibStore } from "../stores/settingslib";
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";
import SectionHeader from "./SectionHeader.vue";
import EmptyState from "./EmptyState.vue";
import SettingEntryCard from "./SettingEntryCard.vue";
import Tag from "./Tag.vue";
import SettingEntryEditor from "./SettingEntryEditor.vue";
import WorkspaceGuard from "./WorkspaceGuard.vue";
import { useEntryDelete } from "../composables/useEntryDelete";

const lib = useSettingLibStore();
const s = useSettingsStore();

const { delConfirm } = useEntryDelete(() => lib.entries, (id) => lib.deleteEntry(id));

const tagFilter = ref<string | null>(null);

function setTagFilter(tag: string) { tagFilter.value = tagFilter.value === tag ? null : tag; }
function filterByTag(tag: string) { setTagFilter(tag); }
function clearTagFilter() { tagFilter.value = null; }

const displayEntries = computed(() => {
  const list = lib.filteredEntries;
  const tag = tagFilter.value;
  if (!tag) return list;
  return list.filter(e => e.tags.includes(tag));
});

function firstFields(fields: Record<string, string>, n: number): Record<string, string> {
  const keys = Object.keys(fields).slice(0, n);
  const result: Record<string, string> = {};
  for (const k of keys) result[k] = fields[k];
  return result;
}
</script>
