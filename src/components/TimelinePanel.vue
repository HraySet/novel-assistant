<template>
  <WorkspaceGuard>
    <div class="flex flex-col h-full">
      <SectionHeader :icon="CalendarOutline" label="时间线" :count="timelineEntries.length">
        <template #actions>
          <n-tooltip>
            <template #trigger>
              <n-button size="small" quaternary @click="openNew" class="!w-7 !h-7 add-btn">
                <template #icon><n-icon size="16">
                    <AddOutline />
                  </n-icon></template>
              </n-button>
            </template>
            新增事件
          </n-tooltip>
        </template>
      </SectionHeader>

      <!-- Time span hint — 徽章化，作为时间线的"标题卡" -->
      <div v-if="timeSpan && timelineEntries.length" class="mb-3 shrink-0">
        <span class="time-span-badge">
          <n-icon size="11" class="opacity-70">
            <CalendarOutline />
          </n-icon>
          {{ timeSpan }}
        </span>
      </div>

      <!-- Timeline -->
      <div v-if="timelineEntries.length === 0" class="flex-1 flex items-center justify-center">
        <EmptyState :icon="CalendarOutline" title="暂无时间线事件" subtitle="点击右上角 + 添加第一个事件" :action-label="'新增事件'"
          @action="openNew" />
      </div>

      <div v-else class="flex-1 overflow-y-auto px-4 py-2 timeline-scroll">
        <!-- Vertical timeline spine -->
        <div class="relative pl-8 timeline-spine">
          <TransitionGroup name="tl-item" tag="div">
            <div v-for="(entry, i) in timelineEntries" :key="entry.id" class="relative pb-6 last:pb-0 timeline-row">
              <!-- Connector dot -->
              <div class="timeline-dot" :class="{ 'timeline-dot--first': i === 0 }" />

              <SettingEntryCard :entry="entry" hide-category class="timeline-card"
                :del-armed="delConfirm(entry.id).armed.value" @edit="lib.openEditEntry"
                @delete="delConfirm(entry.id).trigger">
                <template #content="{ entry: e }">
                  <div v-if="e.fields['时间点']" class="mb-1.5">
                    <span class="time-point-badge">{{ e.fields['时间点'] }}</span>
                  </div>
                  <p v-if="e.notes" :style="{ color: 'var(--text-tertiary)' }"
                    class="text-[11px] leading-relaxed line-clamp-2">
                    {{ e.notes }}
                  </p>
                  <div v-if="e.characterRefs.length" class="flex flex-wrap gap-1 mt-1.5 items-center">
                    <Tag v-for="cid in e.characterRefs.slice(0, 3)" :key="cid" variant="neutral">
                      {{ characterName(cid) }}
                    </Tag>
                    <span v-if="e.characterRefs.length > 3" class="overflow-count">
                      +{{ e.characterRefs.length - 3 }}
                    </span>
                  </div>
                </template>
              </SettingEntryCard>
            </div>
          </TransitionGroup>
        </div>
      </div>

      <SettingEntryEditor />
    </div>
  </WorkspaceGuard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NButton, NIcon, NTooltip } from "naive-ui";
import { AddOutline, CalendarOutline } from "@vicons/ionicons5";
import { useSettingLibStore } from "../stores/settingslib";
import { useNovelStore } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";
import SectionHeader from "./SectionHeader.vue";
import EmptyState from "./EmptyState.vue";
import SettingEntryCard from "./SettingEntryCard.vue";
import Tag from "./Tag.vue";
import SettingEntryEditor from "./SettingEntryEditor.vue";
import WorkspaceGuard from "./WorkspaceGuard.vue";
import { useEntryDelete } from "../composables/useEntryDelete";

const CATEGORY_TIMELINE = "cat_timeline";

const lib = useSettingLibStore();
const novel = useNovelStore();
const s = useSettingsStore();

const { delConfirm } = useEntryDelete(() => lib.entries, (id) => lib.deleteEntry(id));

const timelineEntries = computed(() =>
  lib.entries
    .filter(e => e.categoryId === CATEGORY_TIMELINE)
    .slice()
    .sort((a, b) => {
      const ta = a.fields["时间点"]?.trim();
      const tb = b.fields["时间点"]?.trim();
      if (ta && tb) return ta.localeCompare(tb, "zh");
      if (ta && !tb) return -1;
      if (!ta && tb) return 1;
      return a.sortOrder - b.sortOrder;
    })
);

const timeSpan = computed(() => {
  const entries = timelineEntries.value;
  if (entries.length < 2) return "";

  const first = entries[0].fields["时间点"];
  const last = entries[entries.length - 1].fields["时间点"];
  if (!first || !last) return "";

  const countText = `${entries.length} 个事件`;
  return first === last
    ? `「${first}」· ${countText}`
    : `从「${first}」到「${last}」· ${countText}`;
});

const characterMap = computed(() => {
  const map = new Map<string, string>();
  for (const c of novel.characters) map.set(c.id, c.name);
  return map;
});

function characterName(id: string): string {
  return characterMap.value.get(id) ?? id;
}

function openNew() {
  lib.openNewEntry(CATEGORY_TIMELINE);
}
</script>

<style scoped>
/* ===== 主轴：渐变淡出，暗示故事仍在延续 ===== */
.timeline-spine {
  border-left: 2px solid transparent;
  background-image: linear-gradient(to bottom,
      var(--border-hairline) 0%,
      var(--border-hairline) 85%,
      transparent 100%);
  background-size: 2px 100%;
  background-repeat: no-repeat;
  background-position: 0 0;
}

/* ===== 时间点圆点 ===== */
.timeline-dot {
  position: absolute;
  left: -7px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background-color: var(--accent);
  border: 2px solid var(--background, var(--bg-color));
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  box-shadow: 0 0 0 0 transparent;
}

.timeline-row:hover .timeline-dot {
  transform: scale(1.35);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
}

.timeline-dot--first {
  width: 14px;
  height: 14px;
  left: -8px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}

/* ===== 卡片：轻微上浮反馈 ===== */
.timeline-card {
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.timeline-row:hover .timeline-card {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.18);
}

/* ===== 时间跨度徽章 ===== */
.time-span-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  background-color: color-mix(in srgb, var(--accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
  padding: 3px 9px;
  border-radius: 9999px;
}

/* ===== 时间点徽章（卡片内） ===== */
.time-point-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 10%, transparent);
  padding: 1px 7px;
  border-radius: 5px;
}

/* ===== 人物溢出计数 ===== */
.overflow-count {
  font-size: 10px;
  color: var(--text-tertiary);
  padding: 0 2px;
}

/* ===== 新增按钮：轻微呼吸感 ===== */
.add-btn {
  transition: transform 0.15s ease;
}

.add-btn:hover {
  transform: rotate(90deg);
}

/* ===== 滚动条微调（可选，若全局已有可删除） ===== */
.timeline-scroll {
  scrollbar-width: thin;
}

/* ===== 列表进入/离开动效 ===== */
.tl-item-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.tl-item-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.tl-item-leave-active {
  transition: opacity 0.15s ease;
  position: absolute;
}

.tl-item-leave-to {
  opacity: 0;
}

/* 尊重用户的减少动效偏好 */
@media (prefers-reduced-motion: reduce) {

  .timeline-dot,
  .timeline-card,
  .add-btn,
  .tl-item-enter-active,
  .tl-item-leave-active {
    transition: none !important;
  }
}
</style>