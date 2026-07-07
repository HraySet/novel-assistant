<template>
  <!-- ====== Workspace + Book setup (plain HTML, no Naive UI needed) ====== -->
  <div v-if="!ready" class="h-screen flex items-center justify-center"
    :class="settingsStore.themeDark ? 'bg-[#0d0d16]' : 'bg-gray-50'">
    <div class="text-center max-w-sm px-8">
      <template v-if="!booksStore.workspaceStatus.initialized">
        <div class="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-5 text-3xl">📁</div>
        <h1 :class="settingsStore.themeDark ? 'text-white' : 'text-gray-800'" class="text-lg font-bold mb-2">设置工作区</h1>
        <p :class="settingsStore.themeDark ? 'text-gray-400' : 'text-gray-500'" class="text-sm mb-6">选择一个目录存放你的小说数据</p>
        <button :class="settingsStore.themeDark ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'"
          class="px-8 py-3 rounded-xl text-base font-medium transition-colors disabled:opacity-50"
          :disabled="setupLoading" @click="doPickWorkspace">
          {{ setupLoading ? '...' : '选择目录' }}
        </button>
        <p v-if="setupError" class="text-red-400 text-xs mt-3">{{ setupError }}</p>
      </template>
      <template v-else-if="booksStore.books.length === 0">
        <div class="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-5 text-3xl">📖</div>
        <h1 :class="settingsStore.themeDark ? 'text-white' : 'text-gray-800'" class="text-lg font-bold mb-2">创建第一本书</h1>
        <p :class="settingsStore.themeDark ? 'text-gray-500' : 'text-gray-400'" class="text-xs mb-1">工作区：</p>
        <p :class="settingsStore.themeDark ? 'text-gray-400' : 'text-gray-500'" class="text-[11px] mb-4 break-all">{{ booksStore.workspaceStatus.path }}</p>
        <div class="flex flex-col gap-3 w-64 mx-auto mt-4">
          <input v-model="setupBookTitle"
            :class="settingsStore.themeDark
              ? 'bg-white/5 border border-white/10 text-white placeholder:text-gray-600'
              : 'bg-black/[0.02] border border-black/10 text-gray-800 placeholder:text-gray-400'"
            class="w-full px-4 py-3 rounded-xl text-base outline-none focus:border-purple-500 transition-colors"
            placeholder="书名" @keyup.enter="doCreateBook" />
          <button
            :class="settingsStore.themeDark ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'"
            class="px-8 py-3 rounded-xl text-base font-medium transition-colors disabled:opacity-50"
            :disabled="!setupBookTitle.trim()" @click="doCreateBook">开始</button>
        </div>
      </template>
    </div>
  </div>

  <!-- ====== Main Layout ====== -->
  <n-config-provider v-else :theme="settingsStore.themeDark ? darkTheme : undefined" :theme-overrides="settingsStore.themeDark ? themeOverrides : undefined">
    <div
      class="h-screen flex transition-colors duration-300 overflow-hidden"
      :style="{ background: settingsStore.bgColor }"
      :class="settingsStore.themeDark ? 'dark-layout' : 'light-layout'"
    >
      <div v-if="settingsStore.layoutMode !== 'focus'" class="w-12 shrink-0 flex flex-col items-center py-3 gap-2 border-r"
        :style="{ borderColor: 'var(--border-hairline)' }">
        <div class="mb-1"><BookSwitcher /></div>
        <n-tooltip v-for="t in tools" :key="t.key" placement="right">
          <template #trigger>
            <button class="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              :class="activeTool === t.key
                ? (settingsStore.themeDark ? 'bg-white/10 text-white ring-1 ring-purple-500/50' : 'bg-black/10 text-gray-800 ring-1 ring-purple-500/50')
                : txc('text-gray-500 hover:text-gray-300 hover:bg-white/5', 'text-gray-400 hover:text-gray-600 hover:bg-black/5')"
              @click="toggleTool(t.key)"><n-icon size="18"><component :is="t.icon" /></n-icon></button>
          </template>
          {{ t.label }}
        </n-tooltip>
        <div class="flex-1" />
        <n-tooltip placement="right">
          <template #trigger>
            <button class="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              :class="txc('text-gray-500 hover:text-gray-300 hover:bg-white/5', 'text-gray-400 hover:text-gray-600 hover:bg-black/5')"
              @click="showSettings = !showSettings"><n-icon size="16"><settings-outline /></n-icon></button>
          </template>
          设置
        </n-tooltip>
      </div>

      <div v-if="showLeftPanel" class="flex flex-col overflow-hidden shrink-0"
        :class="txc('border-r border-white/10', 'border-r border-black/5')" :style="{ width: '300px' }">
        <div class="flex-1 overflow-y-auto p-3">
          <OutlinePanel v-if="activeLeftTab === 'outline'" />
          <CharacterPanel v-else-if="activeLeftTab === 'characters'" />
          <ChapterList v-else-if="activeLeftTab === 'chapters'" />
          <SettingLibPanel v-else-if="activeLeftTab === 'settingslib'" />
        </div>
      </div>

      <main class="flex-1 overflow-hidden flex flex-col min-w-0 relative">
        <div v-if="showSettings" class="absolute inset-0 z-20 flex" :class="txc('bg-[#12121a]', 'bg-white')">
          <div class="w-56 shrink-0 border-r p-4" :class="txc('border-white/10','border-black/5')">
            <SettingsNav :section="settingsSection" @update:model-value="(v: string) => settingsSection = v as any" />
          </div>
          <div class="flex-1 overflow-y-auto"><SettingsContent :section="settingsSection" /></div>
          <button class="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-xl" @click="showSettings = false">✕</button>
        </div>
        <EditorPanel :focus-mode="settingsStore.layoutMode === 'focus'" />
      </main>

      <div v-if="showRightPanel" class="flex flex-col overflow-hidden shrink-0 border-l"
        :style="{ borderColor: 'var(--border-hairline)', width: '300px' }">
        <div class="flex shrink-0 border-b" :style="{ borderColor: 'var(--border-hairline)' }">
          <button class="flex-1 py-2 text-xs font-medium transition-colors"
            :style="activeRightTab === 'context' ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' } : { color: 'var(--text-tertiary)' }"
            @click="activeRightTab = 'context'">上下文</button>
          <button class="flex-1 py-2 text-xs font-medium transition-colors"
            :style="activeRightTab === 'chat' ? { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' } : { color: 'var(--text-tertiary)' }"
            @click="activeRightTab = 'chat'">AI 对话</button>
        </div>
        <div class="flex-1 overflow-hidden">
          <QuickContext v-if="activeRightTab === 'context'" />
          <ChatPanel v-else />
        </div>
      </div>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, watch } from "vue";
import { darkTheme, type GlobalThemeOverrides } from "naive-ui";
import { NConfigProvider, NIcon, NTooltip } from "naive-ui";
import { PeopleOutline, ListOutline, DocumentTextOutline, CubeOutline, SettingsOutline, ChatbubblesOutline, InformationCircleOutline } from "@vicons/ionicons5";
import { useSettingsStore } from "./stores/settings";
import { useBooksStore } from "./stores/books";
import { useNovelStore } from "./stores/novel";
import { useDesignTokens } from "./composables/useDesignTokens";
import EditorPanel from "./components/EditorPanel.vue";
import CharacterPanel from "./components/CharacterPanel.vue";
import OutlinePanel from "./components/OutlinePanel.vue";
import ChapterList from "./components/ChapterList.vue";
import SettingLibPanel from "./components/SettingLibPanel.vue";
import ChatPanel from "./components/ChatPanel.vue";
import QuickContext from "./components/QuickContext.vue";
import BookSwitcher from "./components/BookSwitcher.vue";
import SettingsNav from "./components/SettingsNav.vue";
import SettingsContent from "./components/SettingsContent.vue";

const settingsStore = useSettingsStore();
const booksStore = useBooksStore();
const novelStore = useNovelStore();
useDesignTokens();
const showSettings = ref(false);
watch(showSettings, (v) => { if (v) activeTool.value = null; });
const settingsSection = ref<"general" | "writing" | "theme" | "ai" | "about">("general");
const txc = (dark: string, light: string) => settingsStore.themeDark ? dark : light;

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const a = settingsStore.accentColor; const b = settingsStore.bgColor;
  return {
    common: { primaryColor: a, primaryColorHover: a + "dd", primaryColorPressed: a + "bb", primaryColorSuppl: a, bodyColor: b, cardColor: b, modalColor: b, popoverColor: b, inputColor: b },
    Button: { colorPrimary: a, colorHoverPrimary: a + "dd", colorPressedPrimary: a + "bb" },
    Input: { borderFocus: a, loadingColor: a },
    Select: { peers: { InternalSelection: { borderFocus: a } } },
  };
});

type PanelKey = "outline" | "characters" | "chapters" | "settingslib" | "context" | "chat";
type LeftPanelKey = "outline" | "characters" | "chapters" | "settingslib";
const activeTool = ref<PanelKey | null>(null);
const activeLeftTab = ref<LeftPanelKey | null>(null);
const activeRightTab = ref<"context" | "chat">("chat");

// AI 讨论触发时自动切换到聊天面板
watch(() => novelStore.chatAutoOpen, (v) => {
  if (v) {
    activeRightTab.value = "chat";
    activeTool.value = "chat";
    showSettings.value = false;
  }
});

const tools: { key: PanelKey; label: string; icon: any }[] = [
  { key: "outline", label: "大纲", icon: markRaw(ListOutline) },
  { key: "characters", label: "角色", icon: markRaw(PeopleOutline) },
  { key: "chapters", label: "章节", icon: markRaw(DocumentTextOutline) },
  { key: "settingslib", label: "设定", icon: markRaw(CubeOutline) },
  { key: "context", label: "上下文", icon: markRaw(InformationCircleOutline) },
  { key: "chat", label: "AI 对话", icon: markRaw(ChatbubblesOutline) },
];

function toggleTool(key: string) {
  try {
    showSettings.value = false;
    if (key === "context" || key === "chat") {
      if (activeTool.value === key) { activeTool.value = null; }
      else { activeTool.value = key as any; activeRightTab.value = key as "context" | "chat"; }
    } else {
      activeTool.value = activeTool.value === key ? null : key as PanelKey;
      activeLeftTab.value = activeTool.value as LeftPanelKey | null;
    }
  } catch (e) {
    console.error("toggleTool error:", e);
    activeTool.value = null;
  }
}

const isCompact = computed(() => settingsStore.layoutMode === "compact");
const isClassic = computed(() => settingsStore.layoutMode === "classic");
const isLeftTool = (k: string | null) => k === "outline" || k === "characters" || k === "chapters" || k === "settingslib";
const isRightTool = (k: string | null) => k === "chat" || k === "context";
const showLeftPanel = computed(() => isCompact.value ? isLeftTool(activeTool.value) : isClassic.value);
const showRightPanel = computed(() =>
  settingsStore.layoutMode !== "focus" && (isClassic.value || isRightTool(activeTool.value))
);

// ── Setup guard ──

const ready = computed(() => booksStore.workspaceStatus.initialized && booksStore.books.length > 0);
const setupLoading = ref(false);
const setupBookTitle = ref("");
const setupError = ref("");

async function doPickWorkspace() {
  setupError.value = "";
  setupLoading.value = true;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({ directory: true, multiple: false, title: "选择工作区目录" });
    if (chosen) {
      const path = typeof chosen === "string" ? chosen : String(chosen);
      await booksStore.initWorkspace(path);
    }
  } catch (e: any) {
    setupError.value = e?.message || String(e);
    console.error("doPickWorkspace failed:", e);
  } finally { setupLoading.value = false; }
}

async function doCreateBook() {
  if (!setupBookTitle.value.trim()) return;
  await booksStore.createBook(setupBookTitle.value.trim());
}
</script>
