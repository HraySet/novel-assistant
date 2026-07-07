<template>
  <div class="flex flex-col h-full">
    <!-- === Workspace Guard === -->
    <EmptyState v-if="!booksStore.workspaceStatus.initialized"
      :icon="FolderOutline" title="还未设置工作区" subtitle="先在设置中选择一个目录" />
    <EmptyState v-else-if="!booksStore.currentBookId"
      :icon="BookOutline" title="还没有作品" subtitle="点击左上角书图标创建" />

    <template v-else>
      <SectionHeader :icon="DocumentTextOutline" label="章节" :count="chapters.length">
        <template #actions>
          <span v-if="totalWordCount > 0" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] tabular-nums">
            {{ formatWordCount(totalWordCount) }}字
          </span>
        </template>
      </SectionHeader>

      <!-- 整体进度条：完成/写作中/草稿 比例一览 -->
      <div v-if="chapters.length > 0" class="mb-2.5 shrink-0">
        <div class="flex h-1 rounded-full overflow-hidden" :class="tx('bg-white/5', 'bg-black/5')">
          <div v-if="progress.done > 0" class="bg-green-400 h-full transition-all"
            :style="{ width: progress.done + '%' }" />
          <div v-if="progress.writing > 0" class="bg-yellow-400 h-full transition-all"
            :style="{ width: progress.writing + '%' }" />
        </div>
        <div class="flex items-center gap-2.5 mt-1">
          <span class="flex items-center gap-1 text-[9px]" :class="tx('text-gray-500', 'text-gray-400')">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400" />完成 {{ statusCounts.done }}
          </span>
          <span class="flex items-center gap-1 text-[9px]" :class="tx('text-gray-500', 'text-gray-400')">
            <span class="w-1.5 h-1.5 rounded-full bg-yellow-400" />写作中 {{ statusCounts.writing }}
          </span>
          <span class="flex items-center gap-1 text-[9px]" :class="tx('text-gray-500', 'text-gray-400')">
            <span class="w-1.5 h-1.5 rounded-full" :class="tx('bg-gray-500', 'bg-gray-400')" />草稿 {{ statusCounts.draft
            }}
          </span>
        </div>
      </div>

      <div class="mb-3 shrink-0">
        <n-input v-model:value="search" size="small" placeholder="搜索章节..." clearable class="mb-2" />

        <SegmentedGroup
          :options="statusOptions.map(o => ({ value: o.value, label: o.label }))"
          :model-value="statusFilter"
          size="sm"
          @update:model-value="statusFilter = $event as string"
        />
      </div>

      <div class="flex-1 overflow-y-auto pr-1" v-if="filteredChapters.length > 0">
        <!-- 搜索/筛选激活时：打平显示，避免结果被折叠隐藏 -->
        <template v-if="isFiltering">
          <ChapterRow v-for="ch in filteredChapters" :key="ch.id" :ch="ch" :tx="tx" :is-current="isCurrentChapter(ch)"
            @click="novel.getOrCreateChapter(ch.outlineId)" />
        </template>

        <!-- 默认：按卷分组，可折叠 -->
        <template v-else>
          <div v-for="group in groupedChapters" :key="group.volumeId" class="mb-1">
            <button class="w-full flex items-center gap-1.5 px-2 py-2 rounded-[var(--radius-sm)] transition-all"
              :class="tx('hover:bg-white/[0.04] text-gray-500', 'hover:bg-black/[0.04] text-gray-500')"
              :style="s.themeDark ? { background: 'rgba(255,255,255,0.02)' } : { background: 'rgba(0,0,0,0.02)' }"
              @click="toggleVolume(group.volumeId)">
              <n-icon size="11" class="transition-transform shrink-0"
                :style="{ transform: isExpanded(group.volumeId) ? 'rotate(90deg)' : 'rotate(0deg)' }">
                <chevron-forward-outline />
              </n-icon>
              <span class="text-[11px] font-medium truncate flex-1 text-left">{{ group.volumeTitle }}</span>
              <span class="text-[9px] tabular-nums" :class="tx('text-gray-600', 'text-gray-400')">{{ group.doneCount
                }}/{{ group.items.length }}</span>
            </button>

            <div v-show="isExpanded(group.volumeId)" class="pl-1">
              <ChapterRow v-for="ch in group.items" :key="ch.id" :ch="ch" :tx="tx" :is-current="isCurrentChapter(ch)"
                @click="novel.getOrCreateChapter(ch.outlineId)" />
            </div>
          </div>
        </template>
      </div>

      <EmptyState v-else :icon="DocumentTextOutline"
        :title="search ? '无匹配章节' : '暂无章节'"
        :subtitle="search ? '' : '先在大纲面板创建章节'" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h } from "vue";
import { NInput, NIcon, NTooltip } from "naive-ui";
import { DocumentTextOutline, ChevronForwardOutline, FolderOutline, BookOutline } from "@vicons/ionicons5";
import { useNovelStore } from "../stores/novel";
import { useBooksStore } from "../stores/books";
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";
import EmptyState from "./EmptyState.vue";
import SectionHeader from "./SectionHeader.vue";
import SegmentedGroup from "./SegmentedGroup.vue";

const novel = useNovelStore();
const booksStore = useBooksStore();
const s = useSettingsStore();

const search = ref("");
const statusFilter = ref<string>("all");
const statusOptions = [
  { label: "全部", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "写作中", value: "writing" },
  { label: "完成", value: "done" },
];

interface ChapterItem {
  id: string;
  outlineId: string;
  title: string;
  volume: string;
  volumeId: string;
  wordCount: number;
  status: string;
  index: number;
}

const chapters = computed<ChapterItem[]>(() => {
  const volumes = novel.outlines.filter(o => !o.parentId);
  const leafOutlines = novel.outlines.filter(o => o.parentId);
  return leafOutlines.map((ol, idx) => {
    const ch = novel.chapters.find(c => c.outlineId === ol.id || c.id === ol.id);
    const vol = volumes.find(v => v.id === ol.parentId);
    const text = (ch?.content ?? "").replace(/<[^>]*>/g, "");
    const wordCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
      + text.replace(/[\u4e00-\u9fff]/g, "").split(/\s+/).filter(Boolean).length;
    return {
      id: ol.id, outlineId: ol.id, title: ol.title || "无标题",
      volume: vol?.title ?? "未分类", volumeId: vol?.id ?? "__uncategorized__",
      wordCount, status: ch?.status ?? "draft", index: idx + 1,
    };
  }).sort((a, b) => a.index - b.index);
});

function isCurrentChapter(ch: { id: string; outlineId: string }): boolean {
  const curId = novel.currentChapterId;
  if (!curId) return false;
  if (ch.id === curId || ch.outlineId === curId) return true;
  const curChapter = novel.chapters.find(c => c.id === curId);
  if (curChapter && (curChapter.outlineId === ch.id || curChapter.outlineId === ch.outlineId)) return true;
  return false;
}

const isFiltering = computed(() => !!search.value.trim() || statusFilter.value !== "all");

const filteredChapters = computed(() => {
  let list = chapters.value;
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(ch => ch.title.toLowerCase().includes(q) || ch.volume.toLowerCase().includes(q));
  }
  if (statusFilter.value !== "all") list = list.filter(ch => ch.status === statusFilter.value);
  return list;
});

// 按卷分组，保持卷在大纲中出现的原始顺序
const groupedChapters = computed(() => {
  const order: string[] = [];
  const map = new Map<string, { volumeId: string; volumeTitle: string; items: ChapterItem[] }>();
  for (const ch of chapters.value) {
    if (!map.has(ch.volumeId)) {
      map.set(ch.volumeId, { volumeId: ch.volumeId, volumeTitle: ch.volume, items: [] });
      order.push(ch.volumeId);
    }
    map.get(ch.volumeId)!.items.push(ch);
  }
  return order.map(id => {
    const g = map.get(id)!;
    return { ...g, doneCount: g.items.filter(c => c.status === "done").length };
  });
});

const expandedVolumes = ref<Set<string>>(new Set());
let expandedInitialized = false;
function isExpanded(volumeId: string): boolean {
  // 首次渲染默认全部展开
  if (!expandedInitialized) {
    groupedChapters.value.forEach(g => expandedVolumes.value.add(g.volumeId));
    expandedInitialized = true;
  }
  return expandedVolumes.value.has(volumeId);
}
function toggleVolume(volumeId: string) {
  if (expandedVolumes.value.has(volumeId)) expandedVolumes.value.delete(volumeId);
  else expandedVolumes.value.add(volumeId);
}

const statusCounts = computed(() => ({
  done: chapters.value.filter(c => c.status === "done").length,
  writing: chapters.value.filter(c => c.status === "writing").length,
  draft: chapters.value.filter(c => c.status === "draft").length,
}));

const progress = computed(() => {
  const total = chapters.value.length || 1;
  return {
    done: (statusCounts.value.done / total) * 100,
    writing: (statusCounts.value.writing / total) * 100,
  };
});

const totalWordCount = computed(() => chapters.value.reduce((sum, c) => sum + c.wordCount, 0));

function formatWordCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// 内联子组件：单个章节行，供分组视图和搜索打平视图共用
const ChapterRow = {
  props: { ch: { type: Object, required: true }, isCurrent: Boolean, tx: { type: Function, required: true } },
  emits: ["click"],
  setup(props: any, { emit }: any) {
    const statusMeta: Record<string, { bg: string; label: string }> = {
      done: { bg: "var(--status-success)", label: "已完成" },
      writing: { bg: "var(--status-warning)", label: "写作中" },
      draft: { bg: "var(--text-disabled)", label: "草稿" },
    };
    return () => h("div", {
      class: [
        "flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] cursor-pointer transition-all mb-0.5",
        !props.isCurrent && props.tx("hover:bg-white/[0.04] text-gray-400 hover:text-gray-300", "hover:bg-black/[0.04] text-gray-500 hover:text-gray-700"),
      ],
      style: props.isCurrent ? { backgroundColor: s.accentColor + '12', color: s.accentColor, boxShadow: `inset 3px 0 0 ${s.accentColor}` } : {},
      onClick: () => emit("click"),
    }, [
      h("span", { class: ["text-[10px] w-5 shrink-0 tabular-nums text-right", props.tx("text-gray-600", "text-gray-500")] }, props.ch.index),
      h("span", { class: "text-xs font-medium truncate flex-1 min-w-0" }, props.ch.title),
      h("span", { class: ["text-[10px] w-11 shrink-0 tabular-nums text-right", props.tx("text-gray-600", "text-gray-500")] }, formatWordCount(props.ch.wordCount)),
      h(NTooltip, { trigger: "hover" }, {
        trigger: () => h("span", {
          class: "w-1.5 h-1.5 rounded-full shrink-0",
          style: { backgroundColor: statusMeta[props.ch.status]?.bg || "var(--text-disabled)" },
        }),
        default: () => statusMeta[props.ch.status]?.label ?? "草稿",
      }),
    ]);
  },
};
</script>