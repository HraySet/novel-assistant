<template>
  <WorkspaceGuard>
    <div class="flex flex-col h-full">
      <!-- Header -->
      <SectionHeader :icon="PeopleOutline" label="角色" :count="characters.length">
        <template #actions>
          <n-button size="small" quaternary @click="openAdd" class="!w-7 !h-7">
            <template #icon><n-icon size="16"><AddOutline /></n-icon></template>
          </n-button>
        </template>
      </SectionHeader>

      <!-- 搜索 + 定位筛选，角色多时快速定位 -->
      <div v-if="characters.length > 4" class="mb-2 shrink-0 space-y-1.5">
        <n-input v-model:value="search" size="small" placeholder="搜索角色..." clearable />
        <div v-if="roleTags.length > 1" class="flex gap-1 flex-wrap">
          <button v-for="tag in roleTags" :key="tag"
            class="px-2 py-0.5 rounded-md text-[10px] font-medium transition-all border"
            :style="roleFilter === tag ? { borderColor: s.accentColor + '60', backgroundColor: s.accentColor + '20', color: s.accentColor } : {}"
            :class="roleFilter !== tag ? tx('border-white/[0.06] text-gray-500 hover:border-white/15', 'border-black/[0.06] text-gray-400 hover:border-black/15') : ''" @click="roleFilter = tag">{{ tag }}</button>
        </div>
      </div>

      <!-- Character list -->
      <div class="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        <EmptyState v-if="characters.length === 0 && !search && roleFilter === '全部'"
          :icon="PeopleOutline" title="还没有角色" subtitle="创建第一个角色开始构建你的故事"
          action-label="新建角色" @action="openAdd" />

        <EmptyState v-else-if="filteredCharacters.length === 0 && characters.length > 0"
          :icon="SearchOutline" title="没有找到匹配的角色" compact />

        <SurfaceCard v-for="(char, idx) in filteredCharacters" :key="char.id"
          padding="none" interactive lift
          :selected="selectedId === char.id"
          :class="['group', dragIdx === idx ? 'opacity-30' : '', dragOverIdx === idx ? '!border-[var(--border-accent)]' : '']"
          @mouseenter="dragIdx !== null && (dragOverIdx = idx)">
          <!-- Card header -->
          <div class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none" @click="toggleSelect(char.id)" @dblclick="openEdit(char)">
            <span class="cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -ml-0.5"
              :class="tx('text-gray-500 hover:text-gray-300', 'text-gray-400 hover:text-gray-600')"
              @mousedown.prevent.stop="onPointerDown(idx, $event)">
              <n-icon size="13"><reorder-two-outline /></n-icon>
            </span>

            <!-- 头像：首字 + 定位色底，替代纯色点，识别度更高 -->
            <span
              class="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
              :style="{ backgroundColor: roleColor(char.role) }">{{ char.name.charAt(0) }}</span>

            <span :class="tx('text-gray-200', 'text-gray-700')" class="text-sm font-medium truncate flex-1">{{ char.name
              }}</span>
            <span class="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
              :style="{ color: roleColor(char.role), backgroundColor: roleColor(char.role) + '1a' }">{{ char.role ||
              '未设定'
              }}</span>
            <n-tooltip trigger="hover">
              <template #trigger>
                <button
                  class="text-gray-600 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5"
                  @click.stop="openEdit(char)">
                  <n-icon size="13"><create-outline /></n-icon>
                </button>
              </template>
              编辑
            </n-tooltip>
          </div>

          <!-- Expanded details -->
          <div v-if="selectedId === char.id" :style="{ borderColor: 'var(--border-hairline)' }"
            class="px-3 pb-3 border-t">
            <div class="space-y-2 pt-2.5">
              <div v-if="char.personality" class="flex items-start gap-1.5">
                <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] shrink-0 mt-0.5">性格</span>
                <span :style="{ color: 'var(--text-secondary)' }" class="text-xs leading-relaxed">{{ char.personality
                  }}</span>
              </div>
              <div v-if="char.appearance" class="flex items-start gap-1.5">
                <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] shrink-0 mt-0.5">外貌</span>
                <span :style="{ color: 'var(--text-secondary)' }" class="text-xs leading-relaxed">{{ char.appearance
                  }}</span>
              </div>
              <div v-if="char.notes" class="flex items-start gap-1.5">
                <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] shrink-0 mt-0.5">备注</span>
                <span :style="{ color: 'var(--text-secondary)' }" class="text-xs leading-relaxed">{{ char.notes
                  }}</span>
              </div>
              <div v-if="!char.personality && !char.appearance && !char.notes"
                :class="tx('text-gray-600', 'text-gray-500')" class="text-xs">
                暂无详细信息，点击编辑添加
              </div>
            </div>
            <div class="flex gap-2 mt-2.5">
              <n-button size="small" quaternary @click.stop="openEdit(char)">编辑</n-button>
              <n-button size="small" quaternary @click.stop="store.discussCharacter(char.id)">AI 讨论</n-button>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <!-- Edit modal -->
      <n-modal v-model:show="modalShow" preset="card" :bordered="false" style="width: 460px; max-height: 85vh">
        <template #header>
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-[var(--radius-md)] flex items-center justify-center text-sm font-semibold text-white"
              :style="{ backgroundColor: s.accentColor }">
              <n-icon size="14"><PeopleOutline /></n-icon>
            </span>
            <span :style="{ color: 'var(--text-primary)' }" class="text-[15px] font-semibold">
              {{ editingId ? '编辑角色' : '新建角色' }}
            </span>
          </div>
        </template>
        <div class="space-y-3">
          <div>
            <label :class="tx('text-gray-400', 'text-gray-600')" class="text-[10px] block mb-1.5">角色名</label>
            <n-input v-model:value="form.name" size="small" placeholder="输入角色名称" />
          </div>

          <div>
            <div :class="tx('text-gray-500', 'text-gray-500')" class="text-xs mb-2">定位</div>
            <div class="flex gap-1.5 flex-wrap mb-2">
              <button v-for="r in roleSuggestions" :key="r"
                class="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-all border"
                :style="form.role === r ? { borderColor: s.accentColor + '60', backgroundColor: s.accentColor + '20', color: s.accentColor, boxShadow: `0 0 0 3px ${s.accentColor}25` } : {}"
                :class="form.role !== r ? tx('border-white/[0.06] text-gray-500 hover:border-white/15 hover:text-gray-300', 'border-black/[0.06] text-gray-400 hover:border-black/15 hover:text-gray-600') : ''"
                @click="form.role = form.role === r ? '' : r">{{ r }}</button>
            </div>
            <n-input v-model:value="form.role" size="small" placeholder="或自定义定位" />
          </div>

          <div>
            <label :class="tx('text-gray-400', 'text-gray-600')" class="text-[10px] block mb-1.5">性格</label>
            <n-input v-model:value="form.personality" type="textarea" size="small" placeholder="描述角色的性格特点"
              :autosize="{ minRows: 2, maxRows: 4 }" />
          </div>
          <div>
            <label :class="tx('text-gray-400', 'text-gray-600')" class="text-[10px] block mb-1.5">外貌</label>
            <n-input v-model:value="form.appearance" type="textarea" size="small" placeholder="描述角色的外貌特征"
              :autosize="{ minRows: 2, maxRows: 4 }" />
          </div>
          <div>
            <label :class="tx('text-gray-400', 'text-gray-600')" class="text-[10px] block mb-1.5">备注</label>
            <n-input v-model:value="form.notes" type="textarea" size="small" placeholder="背景故事、补充信息"
              :autosize="{ minRows: 2, maxRows: 5 }" />
          </div>

          <!-- AI 生成角色 -->
          <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t pt-3">
            <button v-if="!aiGenShow"
              class="flex items-center gap-1.5 text-xs transition-colors rounded px-1 py-0.5"
              :style="{ color: 'var(--accent)' }"
              :class="tx('hover:bg-white/[0.04]', 'hover:bg-black/[0.04]')"
              @click="aiGenShow = true; aiGenPrompt = ''; aiGenError = ''">
              <n-icon size="14"><FlashOutline /></n-icon> AI 生成角色
            </button>
            <div v-else class="space-y-2">
              <div class="flex items-center gap-1">
                <n-icon size="12" :style="{ color: 'var(--accent)' }"><FlashOutline /></n-icon>
                <span :style="{ color: 'var(--text-secondary)' }" class="text-[10px] font-medium">描述你需要的角色，AI 将自动填写信息</span>
              </div>
              <n-input v-model:value="aiGenPrompt" type="textarea" size="small"
                placeholder="例如：一个修仙世界的天才少女，外表冷漠但内心重情义..."
                :autosize="{ minRows: 2, maxRows: 3 }" />
              <div class="flex gap-2">
                <n-button size="small" :loading="aiGenerating" @click="generateCharacter"
                  :disabled="!aiGenPrompt.trim() || aiGenerating">生成</n-button>
                <n-button size="small" quaternary @click="aiGenShow = false">取消</n-button>
              </div>
              <p v-if="aiGenError" class="text-[10px] text-red-400">{{ aiGenError }}</p>
            </div>
          </div>
        </div>
        <template #footer>
          <ModalFooter
            align="between"
            :confirm-label="editingId ? '保存' : '创建'"
            :disabled="!form.name.trim()"
            @confirm="handleSave"
            @cancel="modalShow = false"
          >
            <template #left>
              <DeleteButton :ctrl="deleteCtrl" :show="!!editingId" />
            </template>
          </ModalFooter>
        </template>
      </n-modal>
    </div>
  </WorkspaceGuard>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { NButton, NIcon, NInput, NModal, NTooltip } from "naive-ui";
import {
  AddOutline,
  CreateOutline,
  FlashOutline,
  PeopleOutline,
  ReorderTwoOutline,
  SearchOutline,
} from "@vicons/ionicons5";
import { useNovelStore, type Character } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { useConfirmDelete } from "../composables/useConfirmDelete";
import { useDragReorder } from "../composables/useDragReorder";
import { roleColor, tx } from "../composables/useTheme";
import { buildAiHeaders, isClaudeProvider, getAiEndpoint, getAiModel, parseResponseText } from "../composables/useAiApi";
import SectionHeader from "./SectionHeader.vue";
import EmptyState from "./EmptyState.vue";
import SurfaceCard from "./SurfaceCard.vue";
import WorkspaceGuard from "./WorkspaceGuard.vue";
import DeleteButton from "./DeleteButton.vue";
import ModalFooter from "./ModalFooter.vue";

const store = useNovelStore();
const s = useSettingsStore();
const characters = computed(() => store.characters);

const selectedId = ref<string | null>(null);
function toggleSelect(id: string) { selectedId.value = selectedId.value === id ? null : id; }

// ── 搜索 / 筛选 ──

const search = ref("");
const roleFilter = ref("全部");

const roleTags = computed(() => {
  const set = new Set<string>();
  characters.value.forEach(c => { if (c.role) set.add(c.role); });
  return ["全部", ...Array.from(set)];
});

const filteredCharacters = computed(() => {
  let list = characters.value;
  if (roleFilter.value !== "全部") list = list.filter(c => c.role === roleFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q));
  }
  return list;
});

// ── Edit modal ──

const modalShow = ref(false);
const editingId = ref<string | null>(null);
const deleteCtrl = useConfirmDelete(() => {
  if (!editingId.value) return;
  store.deleteCharacter(editingId.value);
  if (selectedId.value === editingId.value) selectedId.value = null;
  modalShow.value = false;
});
const form = reactive({ name: "", role: "", personality: "", appearance: "", notes: "" });

const roleSuggestions = ["主角", "反派", "导师", "恋人", "挚友", "宿敌", "神秘人", "路人", "家人"];

// ── AI 生成角色 ──
const aiGenShow = ref(false);
const aiGenPrompt = ref("");
const aiGenerating = ref(false);
const aiGenError = ref("");

async function generateCharacter() {
  const desc = aiGenPrompt.value.trim();
  if (!desc) return;
  aiGenError.value = "";
  aiGenerating.value = true;
  try {
    const apiKey = s.aiApiKey;
    if (!apiKey) throw new Error("请先在设置中配置 AI API Key");

    const prompt = `你是一个小说角色设计助手。请根据以下描述生成角色信息，以严格的JSON格式返回（不要包含markdown代码块标记）：
{
  "name": "角色名（2-4个字的中文名）",
  "role": "定位（如主角、反派、导师、恋人等）",
  "personality": "性格特点（一句话描述）",
  "appearance": "外貌特征（一句话描述）",
  "notes": "背景补充（1-2句话）"
}

用户描述：${desc}

只返回JSON，不要其他文字。`;

    const isClaude = isClaudeProvider();
    const body: any = {
      model: getAiModel(),
      messages: [{ role: "user", content: prompt }],
    };
    if (isClaude) { body.max_tokens = 1024; body.system = "你是一个角色设计助手，只返回JSON格式。"; }

    const res = await fetch(`${getAiEndpoint()}/chat/completions`, {
      method: "POST", headers: buildAiHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API错误 ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    let text = parseResponseText(data, isClaude);
    if (!text) throw new Error("AI 未返回内容");

    // 去除可能的 markdown 代码块
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(text);

    if (parsed.name) form.name = parsed.name;
    if (parsed.role) form.role = parsed.role;
    if (parsed.personality) form.personality = parsed.personality;
    if (parsed.appearance) form.appearance = parsed.appearance;
    if (parsed.notes) form.notes = parsed.notes;

    aiGenShow.value = false;
  } catch (e: any) {
    aiGenError.value = e?.message || String(e);
  } finally {
    aiGenerating.value = false;
  }
}

function openAdd() {
  editingId.value = null;
  form.name = ""; form.role = ""; form.personality = ""; form.appearance = ""; form.notes = "";
  deleteCtrl.reset();
  modalShow.value = true;
}
function openEdit(char: Character) {
  editingId.value = char.id;
  form.name = char.name; form.role = char.role; form.personality = char.personality;
  form.appearance = char.appearance; form.notes = char.notes;
  deleteCtrl.reset();
  modalShow.value = true;
}
function handleSave() {
  if (!form.name.trim()) return;
  if (editingId.value) {
    const char = characters.value.find(c => c.id === editingId.value);
    if (char) {
      char.name = form.name.trim(); char.role = form.role;
      char.personality = form.personality.trim(); char.appearance = form.appearance.trim();
      char.notes = form.notes.trim();
    }
  } else {
    store.addCharacter({
      name: form.name.trim(), role: form.role,
      personality: form.personality.trim(), appearance: form.appearance.trim(),
      notes: form.notes.trim(),
    });
  }
  modalShow.value = false;
}

const { dragIdx, dragOverIdx, onPointerDown } = useDragReorder(
  (from, to) => store.reorderCharacter(from, to),
);
</script>