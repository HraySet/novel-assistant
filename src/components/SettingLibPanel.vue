<template>
  <div class="flex flex-col h-full">
    <!-- === Workspace Guard === -->
    <EmptyState v-if="!booksStore.workspaceStatus.initialized"
      :icon="FolderOutline" title="还未设置工作区" subtitle="先在设置中选择一个目录" />
    <EmptyState v-else-if="!booksStore.currentBookId"
      :icon="BookOutline" title="还没有作品" subtitle="点击左上角书图标创建" />

    <template v-else>
      <!-- Header -->
      <SectionHeader :icon="CubeOutline" label="设定库" :count="lib.totalEntries">
        <template #actions>
          <n-button size="small" quaternary @click="lib.openNewEntry()" class="!w-7 !h-7">
            <template #icon><n-icon size="16"><AddOutline /></n-icon></template>
          </n-button>
        </template>
      </SectionHeader>

      <!-- Search -->
      <n-input v-model:value="lib.searchQuery" size="small" placeholder="搜索设定..." clearable class="mb-2 shrink-0" />

      <!-- Category tabs -->
      <div class="flex gap-1 mb-3 flex-wrap shrink-0">
        <button v-for="cat in lib.categories" :key="cat.id"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all"
          :style="lib.selectedCategoryId === cat.id
            ? { backgroundColor: 'var(--accent)', color: '#fff' }
            : { backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }"
          @click="lib.selectCategory(cat.id)">
          <n-icon size="13"><component :is="categoryIcon(cat.id)" /></n-icon>
          <span>{{ cat.name }}</span>
          <span :style="{ opacity: lib.selectedCategoryId === cat.id ? 0.7 : 0.5 }" class="text-[10px]">({{ lib.categoryStats[cat.id] ?? 0 }})</span>
        </button>
      </div>

      <!-- Entries -->
      <div class="flex-1 overflow-y-auto pr-1 space-y-1.5">
        <EmptyState v-if="lib.filteredEntries.length === 0"
          :icon="CubeOutline" :title="lib.searchQuery ? '无匹配设定' : '暂无设定条目'"
          :subtitle="lib.searchQuery ? '' : '创建你的第一个设定'"
          :action-label="lib.searchQuery ? undefined : '添加设定'"
          @action="lib.searchQuery ? undefined : lib.openNewEntry()" />

        <SurfaceCard v-for="entry in lib.filteredEntries" :key="entry.id"
          padding="sm" interactive
          class="cursor-pointer group"
          @dblclick="lib.openEditEntry(entry.id)">
          <!-- 跨分类搜索时显示所属分类 -->
          <div v-if="lib.searchQuery && entry.categoryId !== lib.selectedCategoryId" class="mb-1.5">
            <Tag variant="neutral">{{ categoryLabel(entry.categoryId) }}</Tag>
          </div>
          <div class="flex items-center gap-2 mb-1">
            <span :style="{ color: 'var(--text-primary)' }" class="text-sm font-medium truncate flex-1">{{ entry.name }}</span>
            <button class="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[11px] shrink-0 transition-opacity w-5 h-5 rounded flex items-center justify-center"
              :class="delConfirm(entry.id).armed.value ? 'text-red-400 animate-pulse' : tx('hover:bg-red-500/10 text-gray-400 hover:text-red-400', 'hover:bg-red-500/10 text-gray-500 hover:text-red-500')"
              @click.stop="delConfirm(entry.id).trigger">{{ delConfirm(entry.id).armed.value ? '确认删除' : '✕' }}</button>
          </div>
          <!-- Notes preview -->
          <p v-if="entry.notes" :style="{ color: 'var(--text-tertiary)' }" class="text-[11px] leading-relaxed line-clamp-2 mb-1">{{ entry.notes }}</p>
          <!-- Fields preview -->
          <div v-if="Object.keys(entry.fields).length" class="flex flex-wrap gap-1 mb-1">
            <span v-for="(val, key) in firstFields(entry.fields, 3)" :key="key"
              :style="{ backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }"
              class="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] truncate max-w-[160px]">{{ key }}: {{ val }}</span>
            <span v-if="Object.keys(entry.fields).length > 3" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">
              +{{ Object.keys(entry.fields).length - 3 }}
            </span>
          </div>
          <!-- Tags -->
          <div v-if="entry.tags.length" class="flex gap-1 flex-wrap">
            <Tag v-for="t in entry.tags.slice(0, 4)" :key="t" variant="accent">{{ t }}</Tag>
          </div>
        </SurfaceCard>
      </div>

      <!-- Entry editor modal -->
      <n-modal v-model:show="lib.showEditor" preset="card" :bordered="false" style="width: 520px; max-height: 85vh">
        <template #header>
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-semibold text-white"
              :style="{ backgroundColor: s.accentColor }">
              <n-icon size="14"><CubeOutline /></n-icon>
            </span>
            <span :style="{ color: 'var(--text-primary)' }" class="text-[15px] font-semibold">
              {{ lib.editingEntry ? '编辑设定' : '新建设定' }}
            </span>
          </div>
        </template>
        <div v-if="lib.showEditor" class="space-y-4">
          <!-- Name -->
          <div>
            <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-1.5">名称</label>
            <n-input v-model:value="_editName" size="small" placeholder="设定条目名称" />
          </div>
          <!-- Notes -->
          <div>
            <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-1.5">描述</label>
            <n-input v-model:value="_editNotes" type="textarea" size="small" placeholder="详细描述这个设定" :autosize="{ minRows: 2, maxRows: 4 }" />
          </div>

          <!-- Custom fields (key-value pairs) -->
          <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
            <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-2">自定义字段</label>
            <div class="space-y-2">
              <div v-for="(f, fi) in _editFields" :key="fi" class="flex items-center gap-1.5">
                <n-input v-model:value="_editFields[fi].key" size="small" placeholder="字段名" class="flex-1" />
                <span :style="{ color: 'var(--text-tertiary)' }" class="text-xs shrink-0">:</span>
                <n-input v-model:value="_editFields[fi].value" size="small" placeholder="值" class="flex-1" />
                <button :style="{ color: 'var(--text-tertiary)' }"
                  class="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors hover:text-[var(--status-danger)] hover:bg-[rgba(239,68,68,0.1)]"
                  @click="removeField(fi)">✕</button>
              </div>
            </div>
            <button class="w-full text-xs mt-2 px-3 py-1.5 rounded-[var(--radius-md)] border border-dashed transition-colors hover:bg-[var(--surface-1)]"
              :style="{ color: 'var(--text-tertiary)', borderColor: 'var(--border-hairline)' }"
              @click="addField">+ 添加字段</button>
          </div>

          <!-- Tags -->
          <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
            <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-2">标签</label>
            <n-dynamic-tags v-model:value="_editTags" size="small" />
          </div>
        </div>
        <template #footer>
          <div class="flex gap-2 justify-end">
            <n-button size="small" @click="lib.closeEditor()">取消</n-button>
            <n-button size="small" type="primary" @click="saveCurrent" :disabled="!_editName.trim()">保存</n-button>
          </div>
        </template>
      </n-modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { NButton, NInput, NIcon, NModal, NDynamicTags } from "naive-ui";
import {
  AddOutline, CubeOutline, FolderOutline, BookOutline,
  LayersOutline, FlashOutline, FlagOutline, MapOutline, CalendarOutline,
} from "@vicons/ionicons5";
import { useSettingLibStore } from "../stores/settingslib";
import { useBooksStore } from "../stores/books";
import { useSettingsStore } from "../stores/settings";
import SectionHeader from "./SectionHeader.vue";
import EmptyState from "./EmptyState.vue";
import SurfaceCard from "./SurfaceCard.vue";
import Tag from "./Tag.vue";
import { useConfirmDelete } from "../composables/useConfirmDelete";

const lib = useSettingLibStore();
const booksStore = useBooksStore();
const s = useSettingsStore();
const tx = (d: string, l: string) => s.themeDark ? d : l;

// ── 分类图标映射 ──

const CATEGORY_ICONS: Record<string, any> = {
  cat_realm: LayersOutline,
  cat_skill: FlashOutline,
  cat_faction: FlagOutline,
  cat_location: MapOutline,
  cat_item: CubeOutline,
  cat_timeline: CalendarOutline,
};
function categoryIcon(catId: string) {
  return CATEGORY_ICONS[catId] ?? CubeOutline;
}

// ── 确认删除（缓存实例，条目删除时自动清理）──

const _delCache = new Map<string, ReturnType<typeof useConfirmDelete>>();
function delConfirm(id: string) {
  if (!_delCache.has(id)) {
    _delCache.set(id, useConfirmDelete(() => lib.deleteEntry(id)));
  }
  return _delCache.get(id)!;
}

// 条目变化时清理已不存在的确认实例
watch(() => lib.entries, () => {
  const existingIds = new Set(lib.entries.map(e => e.id));
  for (const id of _delCache.keys()) {
    if (!existingIds.has(id)) {
      _delCache.get(id)?.dispose();
      _delCache.delete(id);
    }
  }
}, { deep: true });

// ── 条目列表辅助 ──

function categoryLabel(catId: string): string {
  const cat = lib.categories.find(c => c.id === catId);
  return cat ? cat.name : "";
}

function firstFields(fields: Record<string, string>, n: number): Record<string, string> {
  const keys = Object.keys(fields).slice(0, n);
  const result: Record<string, string> = {};
  for (const k of keys) result[k] = fields[k];
  return result;
}

// ── 编辑器本地状态 ──

const _editName = ref("");
const _editNotes = ref("");
const _editFields = ref<{ key: string; value: string }[]>([]);
const _editTags = ref<string[]>([]);

watch(() => lib.showEditor, (v) => {
  if (v) {
    const e = lib.editingEntry;
    _editName.value = e?.name ?? "";
    _editNotes.value = e?.notes ?? "";
    _editTags.value = e?.tags ? [...e.tags] : [];
    // 将 fields Record 转为可编辑数组
    _editFields.value = e?.fields
      ? Object.entries(e.fields).map(([key, value]) => ({ key, value }))
      : [];
  }
});

function addField() {
  _editFields.value.push({ key: "", value: "" });
}

function removeField(index: number) {
  _editFields.value.splice(index, 1);
}

function saveCurrent() {
  const e = lib.editingEntry;
  // 将编辑数组转回 Record
  const fields: Record<string, string> = {};
  for (const f of _editFields.value) {
    const k = f.key.trim();
    if (k) fields[k] = f.value;
  }
  lib.saveEntry({
    id: e?.id,
    categoryId: e?.categoryId ?? lib.selectedCategoryId,
    name: _editName.value.trim(),
    fields,
    tags: _editTags.value.filter(t => t.trim()),
    chapterRef: e?.chapterRef ?? "",
    characterRefs: e?.characterRefs ?? [],
    notes: _editNotes.value.trim(),
  });
}
</script>
