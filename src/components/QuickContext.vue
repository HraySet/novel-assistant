<template>
  <div class="flex flex-col h-full overflow-y-auto">
    <div v-if="!store.currentChapter" class="flex-1 flex items-center justify-center p-4">
      <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs">选择一个章节查看上下文</p>
    </div>

    <div v-else class="p-4 space-y-4">
      <!-- Chapter title -->
      <div :style="{ borderColor: 'var(--border-hairline)' }" class="pb-2 border-b">
        <p :style="{ color: 'var(--text-primary)' }" class="text-sm font-semibold truncate">{{ store.currentChapter?.title || '未命名' }}</p>
        <p v-if="volumeTitle" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] mt-0.5">{{ volumeTitle }}</p>
      </div>

      <!-- Outline -->
      <div v-if="currentOutline" class="space-y-2">
        <p :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] uppercase tracking-wider font-medium">大纲</p>
        <p v-if="currentOutline.goal" :style="{ color: s.accentColor }" class="text-xs font-medium">{{ currentOutline.goal }}</p>
        <p v-if="currentOutline.summary" :style="{ color: 'var(--text-tertiary)' }" class="text-[11px] leading-relaxed">{{ currentOutline.summary }}</p>
        <div v-if="currentOutline.keyEvents?.length" class="space-y-0.5">
          <div v-for="(ev, i) in currentOutline.keyEvents" :key="i" :style="{ color: 'var(--text-tertiary)' }" class="text-[11px]">
            {{ i + 1 }}. {{ ev }}
          </div>
        </div>
      </div>

      <!-- Characters -->
      <div v-if="relatedChars.length" class="space-y-2">
        <p :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] uppercase tracking-wider font-medium">角色 · {{ relatedChars.length }}</p>
        <div class="space-y-1">
          <div v-for="char in relatedChars" :key="char.id"
            :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }"
            class="rounded-[var(--radius-md)] border px-2.5 py-2">
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: roleColor(char.role) }" />
              <span :style="{ color: 'var(--text-primary)' }" class="text-xs font-medium">{{ char.name }}</span>
              <span class="text-[10px]" :style="{ color: roleColor(char.role) }">{{ char.role }}</span>
            </div>
            <p v-if="char.personality" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] leading-relaxed mt-1">
              {{ char.personality.slice(0, 60) }}{{ char.personality.length > 60 ? '…' : '' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Foreshadowing -->
      <div v-if="currentOutline?.foreshadowIn || currentOutline?.foreshadowOut" class="space-y-1.5">
        <p :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] uppercase tracking-wider font-medium">伏笔</p>
        <div v-if="currentOutline.foreshadowIn" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">
          <span :style="{ color: 'var(--status-info)' }">↘</span> {{ currentOutline.foreshadowIn }}
        </div>
        <div v-if="currentOutline.foreshadowOut" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">
          <span :style="{ color: 'var(--status-success)' }">↗</span> {{ currentOutline.foreshadowOut }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNovelStore } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { roleColor, tx } from "../composables/useTheme";

const store = useNovelStore();
const s = useSettingsStore();

const currentOutline = computed(() => {
  const ch = store.currentChapter;
  if (!ch) return null;
  return store.outlines.find(o => o.id === ch.outlineId) ?? null;
});

const volumeTitle = computed(() => {
  const ol = currentOutline.value;
  if (!ol?.parentId) return null;
  const parent = store.outlines.find(o => o.id === ol.parentId);
  return parent?.title ?? null;
});

const relatedChars = computed(() => {
  const ol = currentOutline.value;
  if (!ol?.characterRefs?.length) return [];
  return store.characters.filter(c => ol.characterRefs!.includes(c.id));
});

</script>
