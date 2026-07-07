<template>
  <div class="flex flex-col h-full">
    <!-- Guard: no workspace -->
    <EmptyState v-if="!booksStore.workspaceStatus.initialized" :icon="FolderOutline" title="还未设置工作区"
      subtitle="请先在主页面选择工作目录" />
    <!-- Guard: no book -->
    <EmptyState v-else-if="!booksStore.currentBookId" :icon="BookOutline" title="还没有作品" subtitle="请先创建或打开一本书" />

    <template v-else>
      <!-- Header -->
      <SectionHeader :icon="DocumentTextOutline" label="大纲" :count="outlines.length">
        <template #actions>
          <n-button size="small" quaternary @click="handleAddMenu('volume')" class="!w-7 !h-7">
            <template #icon><n-icon size="16"><AddOutline /></n-icon></template>
          </n-button>
        </template>
      </SectionHeader>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Empty -->
        <EmptyState v-if="treeData.length === 0" :icon="LayersOutline" title="还没有大纲" compact>
          <div class="w-48 h-16 rounded-[var(--radius-md)] border border-dashed flex items-center justify-center"
            :style="{ borderColor: 'var(--border-hairline)' }">
            <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px]">章节将出现在这里</span>
          </div>
          <n-button size="small" class="breathe" @click="handleAddMenu('volume')">创建第一卷</n-button>
        </EmptyState>

        <template v-for="vol in treeData" :key="vol.key">
          <!-- Volume -->
          <div class="mb-3">
            <div class="group flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded-[var(--radius-sm)]"
              :style="{ backgroundColor: 'var(--surface-1)' }">
              <!-- Collapse arrow -->
              <button :aria-expanded="!collapsedVolumes.has(vol.key)"
                class="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-transform duration-200"
                :class="collapsedVolumes.has(vol.key) ? '' : 'rotate-90'" :style="{ color: 'var(--text-tertiary)' }"
                @click="toggleVolume(vol.key)">
                <span class="text-[10px] leading-none">›</span>
              </button>
              <span :style="{ color: 'var(--text-primary)' }"
                class="text-[13px] font-semibold tracking-wider truncate flex-1">{{ vol.label }}</span>
              <span class="text-[9px] tabular-nums px-1.5 py-0.5 rounded-[var(--radius-sm)] shrink-0 font-medium"
                :style="volComplete(vol.key)
                  ? { backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }
                  : { backgroundColor: 'var(--surface-2)', color: 'var(--text-tertiary)' }">
                {{ volStats.get(vol.key)?.done ?? 0 }}/{{ volStats.get(vol.key)?.total ?? 0 }}
              </span>
              <button :style="{ color: 'var(--text-tertiary)' }"
                class="text-xs leading-none w-5 h-5 rounded transition-colors hover:text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                @click="openInlineNew(vol.key)">+</button>
              <button
                class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-5 h-5 rounded flex items-center justify-center shrink-0 hover:text-[var(--status-danger)] hover:bg-[rgba(239,68,68,0.1)]"
                :style="{ color: 'var(--text-tertiary)' }" @click.stop="openEdit(vol)" title="编辑或删除此卷">
                <n-icon size="12">
                  <CreateOutline />
                </n-icon>
              </button>
            </div>

            <!-- Chapters (collapsible) -->
            <div v-if="!collapsedVolumes.has(vol.key)" class="space-y-0.5 pl-3">
              <SurfaceCard v-for="(child, ci) in vol.children" :key="child.key" padding="none" interactive
                :selected="selectedId === child.outlineId" :class="[
                  'group',
                  dragIdx === ci ? 'opacity-30' : '',
                  dragOverIdx === ci ? '!border-[var(--border-accent)]' : '',
                ]" @mouseenter="dragIdx !== null && (dragOverIdx = ci)">
                <!-- Row -->
                <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" role="button" tabindex="0"
                  @click="toggleSelect(child.outlineId!)" @dblclick="openEdit(child)"
                  @keydown.enter="toggleSelect(child.outlineId!)"
                  @keydown.space.prevent="toggleSelect(child.outlineId!)"
                  @mousedown.prevent="onPointerDown(Number(ci), String(vol.key), $event)">
                  <!-- Status dot + Title -->
                  <StatusDot :level="statusLevel(child)" size="sm" />
                  <span :style="{ color: 'var(--text-primary)' }" class="text-[13px] font-medium truncate flex-1">{{
                    child.label }}</span>
                  <!-- Word count -->
                  <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] tabular-nums shrink-0">
                    {{ (chapterInfo.get(child.outlineId!)?.wordCount ?? 0).toLocaleString() }}
                  </span>
                  <!-- Quick actions -->
                  <div
                    class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-0.5 shrink-0 pointer-events-none group-hover:pointer-events-auto">
                    <n-tooltip trigger="hover" :delay="300">
                      <template #trigger>
                        <button :style="{ color: 'var(--accent)' }"
                          class="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-accent)]"
                          @click.stop="openChapter(child)">
                          <n-icon size="13">
                            <PencilOutline />
                          </n-icon>
                        </button>
                      </template>
                      开始写作
                    </n-tooltip>
                    <n-tooltip trigger="hover" :delay="300">
                      <template #trigger>
                        <button :style="{ color: 'var(--text-tertiary)' }"
                          class="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-2)]"
                          @click.stop="openEdit(child)">
                          <n-icon size="13">
                            <CreateOutline />
                          </n-icon>
                        </button>
                      </template>
                      编辑大纲
                    </n-tooltip>
                  </div>
                </div>

                <!-- Expanded -->
                <transition name="slide-fade">
                  <div v-if="selectedId === child.outlineId" :style="{ borderColor: 'var(--border-hairline)' }"
                    class="px-3 pb-3 border-t">
                    <div class="space-y-1.5 pt-2.5">
                      <!-- Goal -->
                      <div v-if="chapterMeta.get(child.outlineId!)?.goal"
                        :style="{ backgroundColor: 'var(--surface-accent)', color: 'var(--accent)' }"
                        class="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-[var(--radius-sm)]">
                        <n-icon size="12">
                          <FlagOutline />
                        </n-icon>
                        {{ chapterMeta.get(child.outlineId!)?.goal }}
                      </div>
                      <!-- Summary -->
                      <p v-if="chapterMeta.get(child.outlineId!)?.summary" :style="{ color: 'var(--text-secondary)' }"
                        class="text-[11px] leading-relaxed">{{ chapterMeta.get(child.outlineId!)?.summary }}</p>
                      <!-- Key events -->
                      <div v-if="(chapterMeta.get(child.outlineId!)?.keyEvents || []).length" class="space-y-1">
                        <div v-for="(ev, ei) in chapterMeta.get(child.outlineId!)?.keyEvents" :key="ei"
                          class="flex items-start gap-1.5">
                          <span :style="{ backgroundColor: 'var(--surface-2)', color: 'var(--text-tertiary)' }"
                            class="w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-medium shrink-0 mt-0.5">{{
                              ei +
                              1 }}</span>
                          <span :style="{ color: 'var(--text-secondary)' }" class="text-[11px]">{{ ev }}</span>
                        </div>
                      </div>
                      <!-- Foreshadow -->
                      <div
                        v-if="(chapterMeta.get(child.outlineId!)?.foreshadowIn) || (chapterMeta.get(child.outlineId!)?.foreshadowOut)"
                        class="flex flex-wrap gap-1">
                        <Tag v-if="chapterMeta.get(child.outlineId!)?.foreshadowIn" variant="info">
                          埋下 · {{ chapterMeta.get(child.outlineId!)?.foreshadowIn }}
                        </Tag>
                        <Tag v-if="chapterMeta.get(child.outlineId!)?.foreshadowOut" variant="success">
                          回收 · {{ chapterMeta.get(child.outlineId!)?.foreshadowOut }}
                        </Tag>
                      </div>
                    </div>
                    <div class="flex gap-2 mt-2.5">
                      <n-button size="small" quaternary @click.stop="openChapter(child)">开始写作</n-button>
                      <n-button size="small" quaternary @click.stop="openEdit(child)">编辑</n-button>
                      <n-button size="small" quaternary @click.stop="novel.discussOutline(child.outlineId!)">AI
                        讨论</n-button>
                    </div>
                  </div>
                </transition>
              </SurfaceCard>
            </div>

            <!-- Inline new-chapter input -->
            <div v-if="inlineNewVol === vol.key" class="pl-3 mt-0.5">
              <div class="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)]"
                :style="{ backgroundColor: 'var(--surface-1)' }">
                <StatusDot level="none" size="sm" />
                <input ref="inlineInputRef" v-model="inlineTitle"
                  class="flex-1 bg-transparent border-none outline-none text-[13px] font-medium"
                  :style="{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }"
                  :placeholder="'新章节标题，回车创建 · Esc 取消'" @keydown.enter.prevent="commitInlineChapter(vol.key)"
                  @keydown.escape="cancelInlineChapter" />
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Edit modal -->
      <n-modal v-model:show="editShow" preset="card" :bordered="false" style="width: 520px">
        <template #header>
          <div class="flex items-center gap-2">
            <span
              class="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-semibold text-white"
              :style="{ backgroundColor: s.accentColor }">
              <n-icon size="14">
                <LayersOutline v-if="editingNodeType === 'volume'" />
                <DocumentTextOutline v-else />
              </n-icon>
            </span>
            <span :style="{ color: 'var(--text-primary)' }" class="text-[15px] font-semibold">
              {{ editingId ? (editingNodeType === 'volume' ? '编辑卷' : '编辑章节') : (editingNodeType === 'volume' ? '新建卷' :
                '新建章节') }}
            </span>
            <span v-if="editingId" :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] ml-1">{{ editTitle
            }}</span>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Title (prominent input) -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label :style="{ color: 'var(--text-secondary)' }" class="text-[11px] font-medium">标题 <span
                  style="color: var(--status-danger); font-size: 9px">*必填</span></label>
              <span :style="{ color: 'var(--text-tertiary)' }" class="text-[9px] tabular-nums">{{ editTitle.length
              }}/30</span>
            </div>
            <n-input ref="titleInputRef" v-model:value="editTitle" size="medium" placeholder="章节或卷的名称" maxlength="30"
              class="text-[14px] font-medium" />
          </div>

          <!-- Parent volume (create only) -->
          <div v-if="!editingId">
            <label :style="{ color: 'var(--text-secondary)' }" class="text-[11px] font-medium block mb-1.5">
              所属卷 <span :style="{ color: 'var(--text-tertiary)' }" class="text-[9px] font-normal">选填</span>
            </label>
            <n-select v-model:value="editParentId" :options="volumeOptions" size="small" placeholder="留空则创建为新卷"
              clearable />
          </div>

          <!-- Goal & Summary -->
          <div>
            <label :style="{ color: 'var(--text-secondary)' }" class="text-[11px] font-medium block mb-1.5">核心任务</label>
            <n-input v-model:value="editGoal" size="small" placeholder="一句话概括本章要完成的事" />
          </div>
          <div>
            <label :style="{ color: 'var(--text-secondary)' }" class="text-[11px] font-medium block mb-1.5">内容摘要</label>
            <n-input v-model:value="editSummary" type="textarea" size="small" placeholder="简要描述本章内容"
              :autosize="{ minRows: 2, maxRows: 4 }" />
          </div>

          <!-- Advanced options -->
          <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
            <button
              class="w-full text-xs flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2 transition-colors hover:bg-[var(--surface-2)]"
              :style="{ color: 'var(--text-tertiary)' }" @click="showMore = !showMore">
              <span class="flex items-center gap-1.5">
                <span class="text-[13px] transition-transform duration-200"
                  :class="showMore ? 'rotate-90' : ''">›</span>
                {{ showMore ? '收起高级选项' : '高级选项' }}
              </span>
              <span v-if="!showMore" :style="{ color: 'var(--text-tertiary)' }" class="text-[9px]">事件 · 伏笔</span>
            </button>

            <div v-if="showMore" class="space-y-3 mt-3 p-0 rounded-[var(--radius-md)]">
              <!-- Key events -->
              <div>
                <label :style="{ color: 'var(--status-warning)' }"
                  class="flex items-center gap-1 text-[11px] font-medium mb-2">
                  <n-icon size="12">
                    <FlashOutline />
                  </n-icon> 关键事件
                </label>
                <div v-if="editKeyEvents.length === 0" :style="{ color: 'var(--text-tertiary)' }"
                  class="text-[11px] py-2 text-center">
                  暂无事件，点击下方按钮添加
                </div>
                <div class="space-y-2">
                  <div v-for="(ev, ei) in editKeyEvents" :key="ei" class="flex items-center gap-1.5 group/ev">
                    <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] font-medium shrink-0">{{ ei + 1
                      }}.</span>
                    <n-input v-model:value="editKeyEvents[ei]" size="small" :placeholder="'事件 ' + (ei + 1)"
                      class="flex-1" />
                    <button :style="{ color: 'var(--text-tertiary)' }"
                      class="text-xs w-5 h-5 rounded transition-colors opacity-0 group-hover/ev:opacity-100 shrink-0 hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--status-danger)]"
                      @click="removeKeyEvent(ei)">✕</button>
                  </div>
                </div>
                <button
                  class="w-full text-xs mt-2 px-3 py-1.5 rounded-[var(--radius-md)] border border-dashed transition-colors hover:bg-[var(--surface-1)]"
                  :style="{ color: 'var(--text-tertiary)', borderColor: 'var(--border-hairline)' }"
                  @click="addKeyEvent">+
                  添加事件</button>
              </div>

              <!-- Foreshadow -->
              <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
                <label :style="{ color: 'var(--text-secondary)' }"
                  class="text-[11px] font-medium block mb-2">伏笔管理</label>
                <div>
                  <label :style="{ color: 'var(--text-secondary)' }" class="text-[10px] block mb-1">新埋伏笔</label>
                  <n-input v-model:value="editForeshadowIn" size="small" placeholder="本章埋下的伏笔" />
                </div>
                <div class="mt-2">
                  <label :style="{ color: 'var(--text-secondary)' }" class="text-[10px] block mb-1">回收伏笔</label>
                  <n-input v-model:value="editForeshadowOut" size="small" placeholder="本章回收的伏笔" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <n-button v-if="editingId" size="small" quaternary :type="deleteCtrl.armed.value ? 'error' : 'default'"
                :class="deleteCtrl.armed.value ? 'animate-pulse' : ''" @click="deleteCtrl.trigger">
                <template #icon><n-icon size="14">
                    <TrashOutline />
                  </n-icon></template>
                {{ deleteCtrl.armed.value ? '确认删除' : '删除' }}
              </n-button>
              <span v-if="editingId && !deleteCtrl.armed.value" :style="{ color: 'var(--text-tertiary)' }"
                class="text-[9px]">{{
                  editingNodeHasChildren ? '将同时删除所有子章节' : '点击后需二次确认' }}</span>
            </div>
            <div class="flex gap-2">
              <n-button size="small" quaternary @click="editShow = false">取消</n-button>
              <n-button size="small" type="primary" :disabled="!editTitle.trim()" @click="handleSave">
                {{ editingId ? '保存修改' : (editingNodeType === 'volume' ? '创建卷' : '创建章节') }}
              </n-button>
            </div>
          </div>
        </template>
      </n-modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { NButton, NInput, NIcon, NModal, NSelect, NTooltip } from "naive-ui";
import {
  AddOutline,
  DocumentTextOutline,
  TrashOutline,
  FolderOutline,
  BookOutline,
  LayersOutline,
  FlagOutline,
  FlashOutline,
  PencilOutline,
  CreateOutline,
} from "@vicons/ionicons5";
import { useNovelStore, type OutlineNode, type TreeNode } from "../stores/novel";
import { useBooksStore } from "../stores/books";
import { useSettingsStore } from "../stores/settings";
import { useConfirmDelete } from "../composables/useConfirmDelete";
import SurfaceCard from "./SurfaceCard.vue";
import SectionHeader from "./SectionHeader.vue";
import StatusDot from "./StatusDot.vue";
import Tag from "./Tag.vue";
import EmptyState from "./EmptyState.vue";

const novel = useNovelStore();
const booksStore = useBooksStore();
const s = useSettingsStore();

// ── Constants ──
const WORD_THRESHOLDS = { done: 100, warning: 500, good: 2000 } as const;

// ── Computed: lookup maps ──

/** O(1) lookup for OutlineNode metadata (goal, summary, keyEvents, foreshadowIn, foreshadowOut) */
const chapterMeta = computed(() => {
  const map = new Map<string, OutlineNode>();
  for (const o of novel.outlines) map.set(o.id, o);
  return map;
});

/** O(1) lookup for chapter word count (Chinese chars). Missing key → no chapter yet. */
interface ChapterInfo { wordCount: number }
const chapterInfo = computed(() => {
  const map = new Map<string, ChapterInfo>();
  for (const ch of novel.chapters) {
    const cn = ((ch.content || "").match(/[\u4e00-\u9fff]/g) || []).length;
    map.set(ch.outlineId, { wordCount: cn });
  }
  return map;
});

/** O(1) per-volume done/total stats */
const volStats = computed(() => {
  const map = new Map<string, { done: number; total: number }>();
  for (const vol of treeData.value) {
    const children = vol.children || [];
    const total = children.length;
    const done = children.filter((c) => {
      const info = chapterInfo.value.get(c.outlineId!);
      return info && info.wordCount > WORD_THRESHOLDS.done;
    }).length;
    map.set(vol.key, { done, total });
  }
  return map;
});

/** 一卷是否已全部完成（用于给完成度徽章换成强调色，作为小小的完工奖励） */
function volComplete(key: string): boolean {
  const stat = volStats.value.get(key);
  return !!stat && stat.total > 0 && stat.done === stat.total;
}

const outlines = computed(() => novel.outlines);
const treeData = computed(() => novel.outlineTree as TreeNode[]);

const selectedId = ref<string | null>(null);

function toggleSelect(id: string) { selectedId.value = selectedId.value === id ? null : id; }
function openChapter(child: TreeNode) { if (child.outlineId) novel.getOrCreateChapter(child.outlineId); }

/** Map word count to StatusDot level */
function statusLevel(child: TreeNode): "none" | "low" | "mid" | "high" {
  const ci = chapterInfo.value.get(child.outlineId!);
  if (!ci || ci.wordCount === 0) return "none";
  if (ci.wordCount > WORD_THRESHOLDS.good) return "high";
  if (ci.wordCount > WORD_THRESHOLDS.warning) return "mid";
  return "low";
}

// ── Volume collapse ──
const collapsedVolumes = ref<Set<string>>(new Set());
function toggleVolume(key: string) {
  const next = new Set(collapsedVolumes.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  collapsedVolumes.value = next;
}

// ── Edit ──
const editShow = ref(false);
const editingId = ref<string | null>(null);
const editTitle = ref("");
const editParentId = ref<string | null>(null);
const editSummary = ref("");
const editGoal = ref("");
const editKeyEvents = ref<string[]>([]);
const editForeshadowIn = ref("");
const editForeshadowOut = ref("");
const showMore = ref(false);

// ── Inline new chapter ──
const inlineNewVol = ref<string | null>(null);
const inlineTitle = ref("");
const inlineInputRef = ref<HTMLInputElement | null>(null);

const volumeOptions = computed(() => outlines.value.filter(o => !o.parentId).map(o => ({ label: o.title, value: o.id })));

/** 当前编辑的节点是否包含子节点（卷或父章节），用于删除时的警告文案 */
const editingNodeHasChildren = computed(() => {
  if (!editingId.value) return false;
  return outlines.value.some(o => o.parentId === editingId.value);
});

/** 当前编辑/创建的是卷还是章节 */
const editingNodeType = computed<'volume' | 'chapter'>(() => {
  if (editingId.value) {
    const node = outlines.value.find(o => o.id === editingId.value);
    return node && !node.parentId ? 'volume' : 'chapter';
  }
  return editParentId.value ? 'chapter' : 'volume';
});

// ── Delete confirm ──
const deleteCtrl = useConfirmDelete(() => {
  if (!editingId.value) return;
  novel.deleteOutlineNode(editingId.value);
  editShow.value = false;
  editingId.value = null;
});

function openEdit(child: TreeNode) {
  const o = outlines.value.find(o => o.id === child.outlineId);
  if (!o) return;
  editingId.value = o.id; editTitle.value = o.title; editParentId.value = o.parentId;
  editSummary.value = o.summary; editGoal.value = o.goal;
  editKeyEvents.value = [...(o.keyEvents || [])];
  editForeshadowIn.value = o.foreshadowIn; editForeshadowOut.value = o.foreshadowOut;
  deleteCtrl.reset(); showMore.value = false; editShow.value = true;
}

function handleAddMenu(_key?: string) {
  editingId.value = null; editTitle.value = "";
  editParentId.value = null;  // 建卷时 parentId 始终 null
  editSummary.value = ""; editGoal.value = ""; editKeyEvents.value = [];
  editForeshadowIn.value = ""; editForeshadowOut.value = "";
  deleteCtrl.reset(); showMore.value = false; editShow.value = true;
}

function openInlineNew(volKey: string) {
  inlineNewVol.value = volKey;
  inlineTitle.value = "";
  nextTick(() => {
    inlineInputRef.value?.focus();
  });
}

function cancelInlineChapter() {
  inlineNewVol.value = null;
  inlineTitle.value = "";
}

function commitInlineChapter(volKey: string) {
  const title = inlineTitle.value.trim();
  if (!title) return;
  novel.addOutlineNode({
    parentId: volKey,
    title,
    summary: "",
    goal: "",
    keyEvents: [],
    characterRefs: [],
    foreshadowIn: "",
    foreshadowOut: "",
  });
  inlineNewVol.value = null;
  inlineTitle.value = "";
}

function addKeyEvent() { editKeyEvents.value.push(""); }
function removeKeyEvent(i: number) { editKeyEvents.value.splice(i, 1); }

function handleSave() {
  if (!editTitle.value.trim()) return;
  if (editingId.value) {
    const node = outlines.value.find(o => o.id === editingId.value);
    if (node) {
      node.title = editTitle.value.trim(); node.parentId = editParentId.value;
      node.summary = editSummary.value.trim(); node.goal = editGoal.value.trim();
      node.keyEvents = editKeyEvents.value.filter(Boolean);
      node.foreshadowIn = editForeshadowIn.value.trim();
      node.foreshadowOut = editForeshadowOut.value.trim();
    }
  } else {
    novel.addOutlineNode({
      parentId: editParentId.value, title: editTitle.value.trim(),
      summary: editSummary.value.trim(), goal: editGoal.value.trim(),
      keyEvents: editKeyEvents.value.filter(Boolean), characterRefs: [],
      foreshadowIn: editForeshadowIn.value.trim(), foreshadowOut: editForeshadowOut.value.trim(),
    });
  }
  editShow.value = false; editingId.value = null;
}

// ── Auto-focus title input when modal opens ──
const titleInputRef = ref<InstanceType<typeof NInput> | null>(null);
watch(editShow, (v) => {
  if (v) {
    nextTick(() => {
      titleInputRef.value?.focus();
    });
  }
});

// ── Drag ──
const dragIdx = ref<number | null>(null);
const dragOverIdx = ref<number | null>(null);
let dragVolKey: string | null = null;
function onPointerDown(idx: number, volKey: string, e: MouseEvent) {
  const startY = e.clientY; const startIdx = idx; dragVolKey = volKey; let moved = false;
  const onMove = (ev: MouseEvent) => { if (Math.abs(ev.clientY - startY) > 5) { moved = true; dragIdx.value = startIdx; document.body.style.cursor = "grabbing"; } };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    if (moved && dragOverIdx.value !== null && dragOverIdx.value !== startIdx && dragVolKey) {
      const vol = treeData.value.find(v => v.key === dragVolKey);
      if (vol?.children) {
        const from = vol.children[startIdx]; const to = vol.children[dragOverIdx.value];
        if (from && to) {
          const fn = outlines.value.find(o => o.id === from.outlineId);
          const tn = outlines.value.find(o => o.id === to.outlineId);
          if (fn && tn) { const tmp = fn.sortOrder; fn.sortOrder = tn.sortOrder; tn.sortOrder = tmp; }
        }
      }
    }
    dragIdx.value = null; dragOverIdx.value = null; dragVolKey = null;
  };
  document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
}
</script>

<style scoped>
/* ── Slide-fade transition for expand/collapse ── */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Breathe animation for empty state CTA ── */
@keyframes breathe {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.3);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(var(--accent-rgb), 0);
  }
}

.breathe {
  animation: breathe 2s ease-in-out infinite;
}
</style>