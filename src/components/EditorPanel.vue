<template>
  <div class="flex flex-col h-full">
    <EmptyState v-if="!booksStore.workspaceStatus.initialized"
      :icon="FolderOutline" title="还未设置工作区" subtitle="先在设置中选择一个目录" />
    <EmptyState v-else-if="!booksStore.currentBookId"
      :icon="BookOutline" title="还没有作品" subtitle="点击左上角书图标创建" />

    <template v-else>
    <!-- Stats bar -->
    <StatsBar v-if="!props.focusMode" class="mx-6 mt-4 shrink-0" />

    <!-- Empty state -->
    <div v-if="!currentChapter" class="flex-1 flex flex-col items-center justify-center px-8">
      <WritingCalendar class="w-full max-w-xs mb-6" />
      <p :style="{ color: 'var(--text-tertiary)' }" class="text-sm">选择左侧大纲中的一个章节开始写作</p>
    </div>

    <!-- Writing area -->
    <div v-else class="flex-1 flex flex-col overflow-hidden px-12 py-6">
      <div class="flex-1 flex flex-col overflow-hidden rounded-2xl border shadow-sm"
        :style="{ background: cardBg, borderColor: 'var(--border-hairline)' }">
        <div class="flex-1 overflow-y-auto px-10 py-8">
          <!-- Outline reference card -->
          <OutlineRefCard class="mb-4" />

      <!-- Title -->
      <div class="mb-5 shrink-0">
        <input v-model="title"
          :style="{ color: 'var(--text-primary)', borderColor: 'var(--border-hairline)', '--tw-ring-color': settingsStore.accentColor }"
          class="w-full text-2xl font-bold bg-transparent border-b pb-2 outline-none transition-colors focus:outline-none focus:ring-1 focus:ring-inset placeholder:text-[var(--text-disabled)]"
          placeholder="章节标题"
          @input="(e: Event) => store.updateChapterTitle(currentChapter!.id, (e.target as HTMLInputElement).value)" />
      </div>

      <!-- Toolbar -->
      <div v-if="!props.focusMode"
        :style="{ borderColor: 'var(--border-hairline)' }"
        class="flex items-center gap-1 mb-4 pb-3 border-b shrink-0">
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleBold().run()"
          :type="editor?.isActive('bold') ? 'primary' : 'default'" class="!font-bold !text-xs">B</n-button>
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleItalic().run()"
          :type="editor?.isActive('italic') ? 'primary' : 'default'" class="!italic !text-xs">I</n-button>
        <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
          :type="editor?.isActive('heading', { level: 1 }) ? 'primary' : 'default'" class="!text-xs">H1</n-button>
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
          :type="editor?.isActive('heading', { level: 2 }) ? 'primary' : 'default'" class="!text-xs">H2</n-button>
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
          :type="editor?.isActive('heading', { level: 3 }) ? 'primary' : 'default'" class="!text-xs">H3</n-button>
        <span class="w-px h-4 mx-1" :class="tx('bg-white/10','bg-black/10')" />
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleBulletList().run()"
          :type="editor?.isActive('bulletList') ? 'primary' : 'default'" class="!text-xs">
          <n-icon size="14"><list-outline /></n-icon>
        </n-button>
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleOrderedList().run()"
          :type="editor?.isActive('orderedList') ? 'primary' : 'default'" class="!text-xs">1.</n-button>
        <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />
        <n-button quaternary size="small" @click="editor?.chain().focus().toggleBlockquote().run()"
          :type="editor?.isActive('blockquote') ? 'primary' : 'default'" class="!text-xs">"</n-button>

        <div class="flex-1" />

        <!-- Save -->
        <span v-if="saveError" class="text-[10px] text-red-400 mr-2 truncate max-w-[160px]">{{ saveError }}</span>
        <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] tabular-nums mr-3">{{ wordCount.toLocaleString() }} 字</span>
        <n-tooltip>
          <template #trigger>
            <n-button quaternary size="small" @click="saveNow"
              :type="saveStatus === 'saved' ? 'success' : 'default'"
              :loading="saveStatus === 'saving'" class="!text-xs">
              {{ saveStatus === 'saved' ? '已保存' : '保存' }}
            </n-button>
          </template>
          Ctrl+S
        </n-tooltip>
      </div>

          <!-- Editor -->
          <div class="flex-1" @mouseup="onTextSelect">
            <editor-content :editor="editor" class="outline-none" />
          </div>
        </div>
      </div>
    </div>

    <!-- AI inline floating menu -->
    <Teleport to="body">
      <div v-if="showAiMenu" class="fixed z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md"
        :class="tx('bg-slate-800/95 border border-white/[0.08]', 'bg-white/95 border border-black/[0.08]')"
        :style="{ left: aiMenuPos.x + 'px', top: aiMenuPos.y + 'px' }">
        <button class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1" :style="{ backgroundColor: settingsStore.accentColor, color: '#fff' }" @click="aiAction('continue')">
          <n-icon size="14"><CreateOutline /></n-icon> 续写</button>
        <button class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
          :style="{ color: 'var(--text-secondary)' }"
          :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')" @click="aiAction('polish')">
          <n-icon size="14"><FlashOutline /></n-icon> 润色</button>
        <button class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
          :style="{ color: 'var(--text-secondary)' }"
          :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')" @click="aiAction('discuss')">
          <n-icon size="14"><ChatbubblesOutline /></n-icon> 讨论</button>
        <button class="px-2 py-1.5 rounded-lg text-xs transition-colors"
          :style="{ color: 'var(--text-tertiary)' }"
          :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')" @click="showAiMenu = false">✕</button>
      </div>
    </Teleport>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { NButton, NInput, NIcon, NDivider, NTooltip } from "naive-ui";
import { ListOutline, FolderOutline, BookOutline, CreateOutline, FlashOutline, ChatbubblesOutline } from "@vicons/ionicons5";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { useNovelStore } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { useBooksStore } from "../stores/books";
import { useStatsStore } from "../stores/stats";
import StatsBar from "./StatsBar.vue";
import WritingCalendar from "./WritingCalendar.vue";
import OutlineRefCard from "./OutlineRefCard.vue";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{ focusMode?: boolean }>();

const store = useNovelStore();
const settingsStore = useSettingsStore();
const booksStore = useBooksStore();
const statsStore = useStatsStore();

const tx = (d: string, l: string) => settingsStore.themeDark ? d : l;
const cardBg = computed(() => {
  const bg = settingsStore.bgColor;
  if (settingsStore.themeDark) {
    // Dark: slightly lighter than bg for contrast
    if (bg === "#12121a") return "#1a1a24";
    if (bg === "#0f1729") return "#131d30";
    if (bg === "#0a1916") return "#0e1f1b";
    if (bg === "#1a1410") return "#201a16";
    if (bg === "#141418") return "#1a1a1e";
    return "#1a1a24";
  }
  // Light: slightly off-white card on colored bg
  if (bg === "#ffffff" || bg === "#fffbf0" || bg === "#fff5f7" || bg === "#faf5ff" || bg === "#f0f7ff" || bg === "#f0fdf6") return "#ffffff";
  return "#ffffff";
});
const typewriterMode = computed(() => settingsStore.typewriterMode);
const focusLineMode = computed(() => settingsStore.focusLineMode);
const editorFontSize = computed(() => settingsStore.editorFontSize);

const title = ref("");
const saveStatus = ref<"idle" | "saving" | "saved">("idle");
const saveError = ref("");
const currentChapter = computed(() => store.currentChapter);

// ── Plain text ↔ HTML conversion ──

function htmlToPlain(html: string): string {
  // Simple conversion: strip tags, normalize whitespace
  let text = html
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function plainToHtml(text: string): string {
  if (!text || !text.trim()) return "<p></p>";
  // Split by double newlines for paragraphs
  const blocks = text.split(/\n\n+/);
  return blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("### ")) return `<h3>${trimmed.slice(4)}</h3>`;
    if (trimmed.startsWith("## ")) return `<h2>${trimmed.slice(3)}</h2>`;
    if (trimmed.startsWith("# ")) return `<h1>${trimmed.slice(2)}</h1>`;
    if (trimmed.startsWith("> ")) return `<blockquote>${trimmed.slice(2)}</blockquote>`;
    // Handle list items: lines starting with "- " or "1. "
    if (trimmed.split("\n").every(l => l.trim().startsWith("- "))) {
      return `<ul>${trimmed.split("\n").map(l => `<li>${l.trim().slice(2)}</li>`).join("")}</ul>`;
    }
    return `<p>${trimmed}</p>`;
  }).join("");
}

// ── Word count ──

const wordCount = computed(() => {
  if (!editor.value) return 0;
  const text = editor.value.getText();
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.replace(/[\u4e00-\u9fff]/g, "").split(/\s+/).filter(Boolean).length;
  return chinese + other;
});

// ── Tiptap editor ──

const editor = useEditor({
  content: currentChapter.value?.content ? plainToHtml(currentChapter.value.content) : "<p></p>",
  extensions: [StarterKit],
  onUpdate: ({ editor: ed }) => {
    const id = store.currentChapterId;
    if (id) {
      // 统一以纯文本存入 store，避免 HTML/plain 格式混乱
      store.updateChapterContent(id, htmlToPlain(ed.getHTML()));
      autoSave();
    }
  },
  editorProps: { attributes: { class: "outline-none" } },
});

// Watch chapter changes
watch(() => store.currentChapterId, (newId) => {
  if (editor.value && newId) {
    const ch = store.chapters.find(c => c.id === newId);
    if (ch && editor.value.getHTML() !== (ch.content ? plainToHtml(ch.content) : "<p></p>")) {
      editor.value.commands.setContent(ch.content ? plainToHtml(ch.content) : "<p></p>");
    }
    if (ch) {
      const text = ch.content || "";
      const wc = (text.match(/[\u4e00-\u9fff]/g) || []).length
        + text.replace(/[\u4e00-\u9fff]/g, "").split(/\s+/).filter(Boolean).length;
      statsStore.syncChapterSnapshot(newId, wc);
    }
    title.value = ch?.title ?? "";
  }
});

watch(() => store.chapterUpdateSignal, () => {
  const chId = store.currentChapterId;
  if (editor.value && chId) {
    const ch = store.chapters.find(c => c.id === chId);
    if (ch) editor.value.commands.setContent(ch.content ? plainToHtml(ch.content) : "<p></p>");
  }
});

// Dynamic styles
watch([typewriterMode, focusLineMode, editorFontSize, () => editor.value], () => {
  if (!editor.value) return;
  const dom = editor.value.view.dom as HTMLElement;
  dom.classList.toggle("typewriter-mode", typewriterMode.value);
  dom.classList.toggle("focusline-on", focusLineMode.value);
  dom.style.fontSize = editorFontSize.value === "小" ? "14px" : editorFontSize.value === "大" ? "18px" : "";
}, { immediate: true });

// ── Save ──

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedContent = "";

function autoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => doSave(), 2000);
}

async function saveNow() {
  await doSave();
}

async function doSave() {
  saveError.value = "";
  try {
    const ch = currentChapter.value;
    if (!ch || !editor.value) return;
    const plain = htmlToPlain(editor.value.getHTML());
    // store 中统一存纯文本（onUpdate 已写入，此处确保落盘前一致）
    store.updateChapterContent(ch.id, plain);
    saveStatus.value = "saving";
    const bid = booksStore.currentBookId;
    if (!bid) throw new Error("未选择作品");
    await store.saveChapterFile(bid, { ...ch, content: plain || "" });
    saveStatus.value = "saved";
    lastSavedContent = plain;
    const wc = wordCount.value;
    statsStore.recordChapterEdit(ch.id, wc);
    setTimeout(() => { if (saveStatus.value === "saved") saveStatus.value = "idle"; }, 1500);
  } catch (e: any) {
    saveStatus.value = "idle";
    saveError.value = e?.message || String(e);
  }
}

// ── AI inline menu ──

const showAiMenu = ref(false);
const aiMenuPos = ref({ x: 0, y: 0 });
const selectedText = ref("");

function onTextSelect(e: MouseEvent) {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      showAiMenu.value = false;
      return;
    }
    selectedText.value = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    aiMenuPos.value = {
      x: Math.min(rect.left + rect.width / 2 - 120, window.innerWidth - 260),
      y: rect.top - 50,
    };
    showAiMenu.value = true;
  }, 50);
}

function aiAction(action: string) {
  store.setChatQuote(`对以下文本进行${action === 'continue' ? '续写' : action === 'polish' ? '润色' : '分析'}：\n\n${selectedText.value}`);
  showAiMenu.value = false;
  selectedText.value = "";
}

// ── Keyboard ──

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    saveNow();
  }
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".fixed.z-50")) showAiMenu.value = false;
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onClickOutside);
  editor.value?.destroy();
});
</script>

<style>
.ProseMirror { line-height: 2; caret-color: #a78bfa; max-width: 820px; margin: 0 auto; }
.dark-layout .ProseMirror { color: #cbd5e1; }
.light-layout .ProseMirror { color: #1e293b; }

.ProseMirror p { margin-bottom: 0.6em; font-size: 15px; }
.ProseMirror h1 { font-size: 1.4rem; font-weight: 700; margin: 1.2em 0 0.4em; }
.ProseMirror h2 { font-size: 1.2rem; font-weight: 600; margin: 1em 0 0.3em; }
.ProseMirror h3 { font-size: 1.05rem; font-weight: 600; margin: 0.8em 0 0.2em; }
.dark-layout .ProseMirror h1, .dark-layout .ProseMirror h2, .dark-layout .ProseMirror h3 { color: #e2e8f0; }
.light-layout .ProseMirror h1, .light-layout .ProseMirror h2, .light-layout .ProseMirror h3 { color: #1e293b; }

.ProseMirror blockquote {
  border-left: 2px solid #a78bfa; padding: 0.3em 1em; margin: 0.6em 0;
  background: rgba(167,139,250,0.04); border-radius: 0 4px 4px 0;
}
.dark-layout .ProseMirror blockquote { color: #94a3b8; }
.light-layout .ProseMirror blockquote { color: #64748b; }

.ProseMirror ul, .ProseMirror ol { padding-left: 1.5em; margin: 0.4em 0; }
.ProseMirror li { margin-bottom: 0.15em; }
.ProseMirror:focus { outline: none; }
.ProseMirror p.is-editor-empty:first-child::before {
  color: rgba(128,128,128,0.3); content: attr(data-placeholder);
  float: left; height: 0; pointer-events: none;
}
</style>
