<template>
  <n-modal v-model:show="lib.showEditor" preset="card" :bordered="false"
    :style="{ width: 'min(520px, 90vw)', maxHeight: '85vh' }"
    @update:show="(v: boolean) => { if (!v) requestClose(); }">
    <template #header>
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-semibold"
          :style="{ backgroundColor: 'var(--accent)', color: selectedTabTextColor }">
          <n-icon size="14"><CubeOutline /></n-icon>
        </span>
        <span :style="{ color: 'var(--text-primary)' }" class="text-[15px] font-semibold">
          {{ lib.editingEntry ? '编辑设定' : '新建设定' }}
        </span>
      </div>
    </template>

    <div v-if="lib.showEditor" class="space-y-4">
      <!-- Category selector (new entry only) -->
      <div v-if="!lib.editingEntry" class="flex flex-wrap gap-1.5">
        <button v-for="cat in lib.categories" :key="cat.id"
          class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all"
          :style="_editCategoryId === cat.id
            ? { backgroundColor: 'var(--accent)', color: selectedTabTextColor }
            : { backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }"
          @click="switchEditCategory(cat.id)">
          <n-icon size="12"><component :is="categoryIcon(cat.id)" /></n-icon>
          <span>{{ cat.name }}</span>
        </button>
      </div>

      <div>
        <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-1.5">名称</label>
        <n-input v-model:value="_editName" size="small" placeholder="设定条目名称" />
      </div>

      <div>
        <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-1.5">描述</label>
        <n-input v-model:value="_editNotes" type="textarea" size="small" placeholder="整体设定说明、灵感来源、待办事项…"
          :autosize="{ minRows: 2, maxRows: 4 }" />
      </div>

      <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
        <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-2">
          自定义字段 <span :style="{ opacity: 0.6 }" class="font-normal">— 结构化属性，如"等级：金丹期"</span>
        </label>
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
          :style="{ color: 'var(--text-tertiary)', borderColor: 'var(--border-hairline)' }" @click="addField">+ 添加字段</button>
      </div>

      <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
        <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-2">标签</label>
        <n-dynamic-tags v-model:value="_editTags" size="small" />
      </div>

      <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
        <label :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] block mb-2">关联</label>
        <div class="space-y-2">
          <n-select v-model:value="_editChapterRef" :options="chapterOptions" placeholder="关联章节（选填）" clearable size="small" />
          <n-select v-model:value="_editCharacterRefs" :options="characterOptions" placeholder="关联角色（选填）" multiple clearable size="small" />
        </div>
      </div>
    </div>

    <template #footer>
      <ModalFooter
        :disabled="!_editName.trim()"
        @confirm="saveCurrent"
        @cancel="requestClose"
      />
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from "vue";
import { NInput, NIcon, NModal, NDynamicTags, NSelect } from "naive-ui";
import {
  CubeOutline, LayersOutline, FlashOutline, FlagOutline, MapOutline, CalendarOutline,
} from "@vicons/ionicons5";
import { useSettingLibStore } from "../stores/settingslib";
import { useSettingsStore } from "../stores/settings";
import { useNovelStore } from "../stores/novel";
import { readableTextColor } from "../composables/useTheme";
import ModalFooter from "./ModalFooter.vue";

const lib = useSettingLibStore();
const s = useSettingsStore();
const novelStore = useNovelStore();

const selectedTabTextColor = computed(() => readableTextColor(s.accentColor));

const CATEGORY_ICONS: Record<string, any> = {
  cat_realm: LayersOutline, cat_skill: FlashOutline, cat_faction: FlagOutline,
  cat_location: MapOutline, cat_item: CubeOutline, cat_timeline: CalendarOutline,
};
function categoryIcon(catId: string) { return CATEGORY_ICONS[catId] ?? CubeOutline; }

const CATEGORY_DEFAULT_FIELDS: Record<string, string[]> = {
  cat_realm: ["等级", "规则", "突破条件", "对应实力"],
  cat_skill: ["品级", "属性", "修炼要求", "功法口诀"],
  cat_faction: ["领袖", "总部", "敌对势力", "势力范围"],
  cat_location: ["类型", "特产", "居民", "危险等级"],
  cat_item: ["品阶", "材料", "炼制方法", "持有者"],
  cat_timeline: ["时间点", "相关人物", "影响"],
};

const chapterOptions = computed(() =>
  novelStore.chapters.map(ch => ({ label: ch.title || "(无标题)", value: ch.id }))
);
const characterOptions = computed(() =>
  novelStore.characters.map(c => ({ label: c.name, value: c.id }))
);

const _editName = ref("");
const _editNotes = ref("");
const _editCategoryId = ref("");
const _editFields = ref<{ key: string; value: string }[]>([]);
const _editTags = ref<string[]>([]);
const _editChapterRef = ref("");
const _editCharacterRefs = ref<string[]>([]);
const _editDirty = ref(false);

function switchEditCategory(catId: string) {
  _editCategoryId.value = catId;
  const template = CATEGORY_DEFAULT_FIELDS[catId];
  _editFields.value = template ? template.map(k => ({ key: k, value: "" })) : [];
}

let _suppressDirty = false;
watch(() => lib.showEditor, async (v) => {
  if (v) {
    _suppressDirty = true;
    const e = lib.editingEntry;
    _editName.value = e?.name ?? "";
    _editNotes.value = e?.notes ?? "";
    _editTags.value = e?.tags ? [...e.tags] : [];
    _editChapterRef.value = e?.chapterRef ?? "";
    _editCharacterRefs.value = e?.characterRefs ? [...e.characterRefs] : [];
    if (!e) {
      _editCategoryId.value = lib.selectedCategoryId;
      const template = CATEGORY_DEFAULT_FIELDS[_editCategoryId.value];
      _editFields.value = template ? template.map(k => ({ key: k, value: "" })) : [];
    } else {
      _editCategoryId.value = e.categoryId;
      _editFields.value = e.fields
        ? Object.entries(e.fields).map(([key, value]) => ({ key, value }))
        : [];
    }
    _editDirty.value = false;
    await nextTick();
    _suppressDirty = false;
  }
});

watch([_editName, _editNotes, _editFields, _editTags, _editChapterRef, _editCharacterRefs], () => {
  if (_suppressDirty) return;
  _editDirty.value = true;
}, { deep: true });

function requestClose() {
  if (_editDirty.value) {
    if (!window.confirm("有未保存的改动，确定放弃编辑？")) return;
  }
  lib.closeEditor();
}

function addField() { _editFields.value.push({ key: "", value: "" }); }
function removeField(index: number) { _editFields.value.splice(index, 1); }

function saveCurrent() {
  const e = lib.editingEntry;
  const fields: Record<string, string> = {};
  const dupes: string[] = [];
  for (const f of _editFields.value) {
    const k = f.key.trim();
    if (!k) continue;
    if (k in fields) dupes.push(k);
    fields[k] = f.value;
  }
  if (dupes.length) console.warn(`[设定库] 字段 "${dupes.join("、")}" 重复，已保留最后一个填写的值`);
  lib.saveEntry({
    id: e?.id,
    categoryId: _editCategoryId.value || lib.selectedCategoryId,
    name: _editName.value.trim(),
    fields,
    tags: _editTags.value.filter(t => t.trim()),
    chapterRef: _editChapterRef.value,
    characterRefs: _editCharacterRefs.value,
    notes: _editNotes.value.trim(),
  });
  _editDirty.value = false;
}
</script>
