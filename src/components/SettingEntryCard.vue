<template>
  <SurfaceCard padding="sm" interactive class="cursor-pointer group relative" @dblclick="$emit('edit', entry.id)">
    <div v-if="!hideCategory" class="mb-1.5">
      <Tag variant="neutral">{{ categoryLabel }}</Tag>
    </div>

    <div class="flex items-center gap-2 mb-1">
      <span :style="{ color: 'var(--text-primary)' }" class="text-sm font-medium truncate flex-1">{{ entry.name }}</span>
      <button class="opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 transition-opacity w-5 h-5 rounded flex items-center justify-center"
        :class="tx('hover:bg-white/10 text-gray-400 hover:text-gray-200', 'hover:bg-black/5 text-gray-500 hover:text-gray-700')"
        @click.stop="$emit('edit', entry.id)">
        <n-icon size="12"><CreateOutline /></n-icon>
      </button>
      <button class="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[11px] shrink-0 transition-opacity w-5 h-5 rounded flex items-center justify-center"
        :class="delArmed ? 'text-red-400 animate-pulse' : tx('hover:bg-red-500/10 text-gray-400 hover:text-red-400', 'hover:bg-red-500/10 text-gray-500 hover:text-red-500')"
        @click.stop="$emit('delete', entry.id)">{{ delArmed ? '确认删除' : '✕' }}</button>
    </div>

    <slot name="content" :entry="entry" />
  </SurfaceCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { CreateOutline } from "@vicons/ionicons5";
import { useSettingsStore } from "../stores/settings";
import { useSettingLibStore } from "../stores/settingslib";
import { tx } from "../composables/useTheme";
import type { SettingEntry } from "../stores/settingslib";
import SurfaceCard from "./SurfaceCard.vue";
import Tag from "./Tag.vue";

const props = defineProps<{
  entry: SettingEntry;
  delArmed?: boolean;
  hideCategory?: boolean;
}>();

defineEmits<{
  edit: [id: string];
  delete: [id: string];
}>();

const s = useSettingsStore();
const lib = useSettingLibStore();

const categoryLabel = computed(() =>
  lib.categories.find(c => c.id === props.entry.categoryId)?.name ?? ""
);
</script>
