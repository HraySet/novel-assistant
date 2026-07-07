<template>
  <div v-if="hasContent"
    :style="{ backgroundColor: 'var(--surface-accent)', borderColor: 'var(--border-accent)' }"
    class="rounded-xl border px-3 py-2.5 shrink-0">
    <div class="flex items-center gap-1.5 mb-2">
      <n-icon size="12" :style="{ color: 'var(--accent)' }"><BookmarkOutline /></n-icon>
      <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] uppercase tracking-wider font-medium">本章参考</span>
    </div>
    <div class="space-y-1.5">
      <div v-if="outline!.goal" class="flex items-start gap-1.5">
        <n-icon size="12" :style="{ color: 'var(--accent)' }" class="shrink-0 mt-0.5"><BulbOutline /></n-icon>
        <span :style="{ color: 'var(--accent)' }" class="text-[11px] font-medium opacity-80">{{ outline!.goal }}</span>
      </div>
      <div v-if="outline!.keyEvents?.length" class="flex items-start gap-1.5">
        <n-icon size="12" :style="{ color: 'var(--text-tertiary)' }" class="shrink-0 mt-0.5"><ListOutline /></n-icon>
        <div class="flex flex-wrap gap-x-2 gap-y-0.5">
          <span v-for="(ev, i) in outline!.keyEvents" :key="i" :style="{ color: 'var(--text-tertiary)' }" class="text-[11px]">· {{ ev }}</span>
        </div>
      </div>
      <div v-if="outline!.foreshadowIn" class="flex items-center gap-1.5">
        <n-icon size="12" :style="{ color: 'var(--status-info)' }" class="shrink-0"><ArrowDownOutline /></n-icon>
        <Tag variant="info">{{ outline!.foreshadowIn }}</Tag>
      </div>
      <div v-if="outline!.foreshadowOut" class="flex items-center gap-1.5">
        <n-icon size="12" :style="{ color: 'var(--status-success)' }" class="shrink-0"><ArrowUpOutline /></n-icon>
        <Tag variant="success">{{ outline!.foreshadowOut }}</Tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { BookmarkOutline, BulbOutline, ListOutline, ArrowDownOutline, ArrowUpOutline } from "@vicons/ionicons5";
import { useNovelStore } from "../stores/novel";
import Tag from "./Tag.vue";

const novel = useNovelStore();

const outline = computed(() => {
  const ch = novel.chapters.find(c => c.id === novel.currentChapterId);
  if (!ch) return null;
  return novel.outlines.find(o => o.id === ch.outlineId) ?? null;
});

const hasContent = computed(() => {
  const o = outline.value;
  if (!o) return false;
  return !!(o.goal || o.keyEvents?.length || o.foreshadowOut || o.foreshadowIn);
});
</script>
