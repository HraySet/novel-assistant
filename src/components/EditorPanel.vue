 <template>
  <WorkspaceGuard>
    <div class="flex flex-col h-full">
      <!-- Stats bar -->
      <StatsBar v-if="!props.focusMode" class="mx-6 mt-4 shrink-0" />

      <!-- Daily goal progress -->
      <div v-if="!props.focusMode && currentChapter" class="mx-6 mt-2 shrink-0 flex items-center gap-2">
        <div class="flex-1 h-1.5 rounded-full overflow-hidden" :style="{ background: 'var(--border-soft)' }">
          <div class="h-full rounded-full transition-all duration-500"
            :style="{ width: goalProgressPct + '%', background: settingsStore.accentColor }" />
        </div>
        <button class="text-[10px] tabular-nums shrink-0 hover:underline" :style="{ color: 'var(--text-tertiary)' }"
          @click="editingGoal = true" v-if="!editingGoal">
          {{ statsStore.todayWords.toLocaleString() }} / {{ statsStore.dailyGoal.toLocaleString() }} 字
        </button>
        <input v-else v-model.number="statsStore.dailyGoal" type="number" min="0" step="100"
          class="w-16 text-[10px] bg-transparent border-b outline-none text-right"
          :style="{ color: 'var(--text-secondary)', borderColor: 'var(--border-hairline)' }" @blur="editingGoal = false"
          @keyup.enter="editingGoal = false" autofocus />
      </div>

      <!-- Empty state -->
      <div v-if="!currentChapter" class="flex-1 flex flex-col items-center justify-center px-8">
        <WritingCalendar class="w-full max-w-xs mb-6" />
        <p :style="{ color: 'var(--text-tertiary)' }" class="text-sm">选择左侧大纲中的一个章节开始写作</p>
      </div>

      <!-- Writing area -->
      <div v-else class="flex-1 flex flex-col overflow-hidden px-12 py-6">
        <div class="flex-1 flex flex-col overflow-hidden rounded-2xl border shadow-sm"
          :style="{ background: cardBg, borderColor: 'var(--border-hairline)' }">
          <div class="flex-1 overflow-y-auto px-10 py-8 relative">
            <!-- Outline reference card -->
            <OutlineRefCard class="mb-4" />

            <!-- Title -->
            <div class="mb-5 shrink-0">
              <input v-model="title"
                :style="{ color: 'var(--text-primary)', borderColor: 'var(--border-hairline)', '--tw-ring-color': settingsStore.accentColor }"
                class="w-full text-2xl font-bold bg-transparent border-b pb-2 outline-none transition-colors focus:outline-none focus:ring-1 focus:ring-inset placeholder:text-(--text-disabled)"
                placeholder="章节标题"
                @input="(e: Event) => store.updateChapterTitle(currentChapter!.id, (e.target as HTMLInputElement).value)" />
            </div>

            <!-- Toolbar -->
            <div v-if="!props.focusMode" :style="{ borderColor: 'var(--border-hairline)' }"
              class="flex items-center gap-1 mb-4 pb-3 border-b shrink-0">
              <n-button quaternary size="small" @click="editor?.chain().focus().undo().run()"
                :disabled="!editor?.can().undo()" class="text-xs!" title="撤销 (Ctrl+Z)">
                <n-icon size="14">
                  <ArrowUndoOutline />
                </n-icon>
              </n-button>
              <n-button quaternary size="small" @click="editor?.chain().focus().redo().run()"
                :disabled="!editor?.can().redo()" class="text-xs!" title="重做 (Ctrl+Y)">
                <n-icon size="14">
                  <ArrowRedoOutline />
                </n-icon>
              </n-button>
              <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('heading', { level: 1 }) }"
                class="text-xs!">H1</n-button>
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('heading', { level: 2 }) }"
                class="text-xs!">H2</n-button>
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('heading', { level: 3 }) }"
                class="text-xs!">H3</n-button>
              <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleBulletList().run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('bulletList') }" class="text-xs!">
                <n-icon size="14"><list-outline /></n-icon>
              </n-button>
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleOrderedList().run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('orderedList') }" class="text-xs!">1.</n-button>
              <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />
              <n-button quaternary size="small" @click="editor?.chain().focus().toggleBlockquote().run()"
                :class="{ 'toolbar-btn-active': editor?.isActive('blockquote') }" class="text-xs!">"</n-button>
              <span class="w-px h-4 mx-1" :style="{ backgroundColor: 'var(--border-soft)' }" />

              <!-- Version history -->
              <div class="relative">
                <n-button quaternary size="small" class="text-xs!" @click="showHistory = !showHistory" title="历史版本">
                  <n-icon size="14">
                    <TimeOutline />
                  </n-icon>
                </n-button>
                <div v-if="showHistory"
                  class="absolute z-40 top-8 left-0 w-56 max-h-72 overflow-y-auto rounded-[var(--radius-sm)] shadow-xl border py-1"
                  :class="tx('bg-slate-800/95 border-white/8', 'bg-white/95 border-black/8')">
                  <div v-if="!currentSnapshots.length" class="px-3 py-2 text-xs"
                    :style="{ color: 'var(--text-tertiary)' }">暂无历史快照</div>
                  <button v-for="snap in currentSnapshots" :key="snap.timestamp"
                    class="w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5"
                    :class="tx('hover:bg-white/5', 'hover:bg-black/5')" @click="restoreSnapshot(snap)">
                    <span :style="{ color: 'var(--text-secondary)' }">{{ formatSnapTime(snap.timestamp) }}</span>
                    <span class="truncate" :style="{ color: 'var(--text-tertiary)' }">{{ snap.preview }}</span>
                  </button>
                </div>
              </div>

              <div class="flex-1" />

              <!-- Save -->
              <span v-if="saveError" class="text-[10px] text-red-400 mr-2 truncate max-w-40">{{ saveError }}</span>
              <span :style="{ color: 'var(--text-tertiary)' }" class="text-[10px] tabular-nums mr-3">{{
                wordCount.toLocaleString() }} 字</span>
              <n-tooltip>
                <template #trigger>
                  <n-button quaternary size="small" @click="saveNow" class="text-xs! save-btn">
                    <Transition name="fade" mode="out-in">
                      <span v-if="saveStatus === 'saving'" key="saving" class="flex items-center gap-1">
                        <n-icon size="13">
                          <TimeOutline />
                        </n-icon> 保存中
                      </span>
                      <span v-else-if="saveStatus === 'saved'" key="saved" class="flex items-center gap-1"
                        :style="{ color: settingsStore.accentColor }">
                        <n-icon size="13">
                          <CheckmarkCircleOutline />
                        </n-icon> 已保存
                      </span>
                      <span v-else key="idle">保存</span>
                    </Transition>
                  </n-button>
                </template>
                Ctrl+S
              </n-tooltip>
            </div>

            <!-- Editor -->
            <div class="flex-1 relative" @mouseup="onTextSelect">
              <editor-content :editor="editor" class="outline-none" />

              <!-- Cursor "continue writing" trigger (no selection needed) -->
              <button v-if="showContinueBtn && !showAiMenu"
                class="absolute bottom-2 right-2 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium shadow-md transition-opacity"
                :style="{ backgroundColor: settingsStore.accentColor, color: '#fff' }" @click="continueFromCursor">
                <n-icon size="13">
                  <CreateOutline />
                </n-icon> 续写
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- AI inline floating menu -->
      <Teleport to="body">
        <Transition name="ai-menu">
          <div v-if="showAiMenu"
            class="ai-inline-menu fixed z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md"
            :class="tx('bg-slate-800/95 border border-white/8', 'bg-white/95 border border-black/8')"
            :style="{ left: aiMenuPos.x + 'px', top: aiMenuPos.y + 'px' }">
            <button class="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors flex items-center gap-1"
              :style="{ backgroundColor: settingsStore.accentColor, color: '#fff' }" @click="aiAction('continue')">
              <n-icon size="14">
                <CreateOutline />
              </n-icon> 续写</button>
            <button class="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors flex items-center gap-1"
              :style="{ color: 'var(--text-secondary)' }"
              :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')"
              @click="aiAction('polish')">
              <n-icon size="14">
                <FlashOutline />
              </n-icon> 润色</button>
            <button class="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors flex items-center gap-1"
              :style="{ color: 'var(--text-secondary)' }"
              :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')"
              @click="aiAction('discuss')">
              <n-icon size="14">
                <ChatbubblesOutline />
              </n-icon> 讨论</button>
            <button class="px-2 py-1.5 rounded-[var(--radius-sm)] text-xs transition-colors" :style="{ color: 'var(--text-tertiary)' }"
              :class="tx('hover:bg-white/5 hover:text-gray-200', 'hover:bg-black/5 hover:text-gray-700')"
              @click="showAiMenu = false">✕</button>
          </div>
        </Transition>
      </Teleport>
    </div>
  </WorkspaceGuard>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { NButton, NInput, NIcon, NDivider, NTooltip } from "naive-ui";
import {
  CreateOutline, FlashOutline, ChatbubblesOutline,
  ArrowUndoOutline, ArrowRedoOutline, TimeOutline, CheckmarkCircleOutline,
} from "@vicons/ionicons5";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { useNovelStore } from "../stores/novel";
import { useSettingsStore } from "../stores/settings";
import { useBooksStore } from "../stores/books";
import { useStatsStore } from "../stores/stats";
import { tx } from "../composables/useTheme";
import WorkspaceGuard from "./WorkspaceGuard.vue";
import StatsBar from "./StatsBar.vue";
import WritingCalendar from "./WritingCalendar.vue";
import OutlineRefCard from "./OutlineRefCard.vue";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{ focusMode?: boolean }>();
const emit = defineEmits<{ (e: "toggle-focus-mode"): void }>();

const store = useNovelStore();
const settingsStore = useSettingsStore();
const booksStore = useBooksStore();
const statsStore = useStatsStore();
const cardBg = computed(() => {
  const bg = settingsStore.bgColor;
  // Parse hex and derive a slightly adjusted surface color
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const factor = settingsStore.themeDark ? 1.06 : 0.97;
  const adj = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
});
const typewriterMode = computed(() => settingsStore.typewriterMode);
const focusLineMode = computed(() => settingsStore.focusLineMode);
const editorFontSize = computed(() => settingsStore.editorFontSize);

// ── Accent color → CSS variable, so caret / blockquote / toolbar all follow theme ──
watch(() => settingsStore.accentColor, (c) => {
  if (c) document.documentElement.style.setProperty("--accent-color", c);
}, { immediate: true });

const title = ref("");
const saveStatus = ref<"idle" | "saving" | "saved">("idle");
const saveError = ref("");
const currentChapter = computed(() => store.currentChapter);

// ── Plain text ↔ HTML conversion ──
// 注意：加粗/斜体等行内样式不会保留（本工具最终导出纯 txt 用于投稿，
// 富文本样式对最终产物无意义，故有意丢弃）。
// 有序/无序列表的“语义”会保留：有序列表转成 “1. / 2. / 3. ” 编号，
// 无序列表转成 “- ” 项目符号。

function htmlToPlain(html: string): string {
  let text = html
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n\n')
    .replace(/<ol>([\s\S]*?)<\/ol>/gi, (_match, inner) => {
      let i = 0;
      const items = String(inner).replace(/<li>([\s\S]*?)<\/li>/gi, (_m: string, item: string) => {
        i += 1;
        return `${i}. ${item}\n`;
      });
      return items + '\n';
    })
    .replace(/<ul>([\s\S]*?)<\/ul>/gi, (_match, inner) => {
      const items = String(inner).replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n');
      return items + '\n';
    })
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
  const blocks = text.split(/\n\n+/);
  return blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("### ")) return `<h3>${trimmed.slice(4)}</h3>`;
    if (trimmed.startsWith("## ")) return `<h2>${trimmed.slice(3)}</h2>`;
    if (trimmed.startsWith("# ")) return `<h1>${trimmed.slice(2)}</h1>`;
    if (trimmed.startsWith("> ")) return `<blockquote>${trimmed.slice(2)}</blockquote>`;

    const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);

    const isOrdered = lines.length > 0 && lines.every(l => /^\d+\.\s/.test(l));
    if (isOrdered) {
      return `<ol>${lines.map(l => `<li>${l.replace(/^\d+\.\s/, "")}</li>`).join("")}</ol>`;
    }

    const isUnordered = lines.length > 0 && lines.every(l => l.startsWith("- "));
    if (isUnordered) {
      return `<ul>${lines.map(l => `<li>${l.slice(2)}</li>`).join("")}</ul>`;
    }

    return `<p>${trimmed}</p>`;
  }).join("");
}

// ── Word count (shared helper so all three call-sites stay in sync) ──

function countWords(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.replace(/[\u4e00-\u9fff]/g, "").split(/\s+/).filter(Boolean).length;
  return chinese + other;
}

const wordCount = computed(() => {
  if (!editor.value) return 0;
  return countWords(editor.value.getText());
});

// ── Daily word-count goal ──
// Persisted via statsStore — dailyGoal, todayWords, and chapter snapshots all live in stats.json.
const editingGoal = ref(false);

const goalProgressPct = computed(() => {
  if (!statsStore.dailyGoal) return 0;
  return Math.min(100, Math.round((statsStore.todayWords / statsStore.dailyGoal) * 100));
});

// ── Tiptap editor ──

const editor = useEditor({
  content: currentChapter.value?.content ? plainToHtml(currentChapter.value.content) : "<p></p>",
  extensions: [StarterKit],
  onUpdate: ({ editor: ed }) => {
    const id = store.currentChapterId;
    if (id) {
      store.updateChapterContent(id, htmlToPlain(ed.getHTML()));
      autoSave();
    }
    updateContinueBtnVisibility();
  },
  onSelectionUpdate: () => updateContinueBtnVisibility(),
  editorProps: { attributes: { class: "outline-none" } },
});

// Watch chapter changes
watch(() => store.currentChapterId, (newId) => {
  // Flush any pending autosave for the chapter we're leaving before swapping content.
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; doSave(); }

  if (editor.value && newId) {
    const ch = store.chapters.find(c => c.id === newId);
    if (ch && editor.value.getHTML() !== (ch.content ? plainToHtml(ch.content) : "<p></p>")) {
      editor.value.commands.setContent(ch.content ? plainToHtml(ch.content) : "<p></p>");
    }
    if (ch) {
      const wc = countWords(ch.content || "");
      statsStore.syncChapterSnapshot(newId, wc);
    }
    title.value = ch?.title ?? "";
    showHistory.value = false;
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
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await doSave();
}

async function doSave() {
  saveError.value = "";
  try {
    const ch = currentChapter.value;
    if (!ch || !editor.value) return;
    const plain = htmlToPlain(editor.value.getHTML());
    store.updateChapterContent(ch.id, plain);
    saveStatus.value = "saving";
    const bid = booksStore.currentBookId;
    if (!bid) throw new Error("未选择作品");
    await store.saveChapterFile(bid, { ...ch, content: plain || "" });
    saveStatus.value = "saved";

    // Record a lightweight snapshot if content actually changed meaningfully.
    if (plain !== lastSavedContent) {
      pushSnapshot(ch.id, plain);
    }
    lastSavedContent = plain;

    const wc = wordCount.value;
    statsStore.recordChapterEdit(ch.id, wc);
    setTimeout(() => { if (saveStatus.value === "saved") saveStatus.value = "idle"; }, 1500);
  } catch (e: any) {
    saveStatus.value = "idle";
    saveError.value = e?.message || String(e);
  }
}

// ── File-based version snapshots ──
// Snapshots are stored as timestamped .txt files under {bookId}/快照/{chapterId}/.
// Migrates legacy localStorage data on first run, then removes it.
type Snapshot = { timestamp: number; content: string; preview: string };
const MAX_SNAPSHOTS = 20;
const MIN_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const snapshotStore = ref<Record<string, Snapshot[]>>({});
const showHistory = ref(false);
const snapshotMigrationDone = ref(false);

const currentSnapshots = computed(() => {
  const id = store.currentChapterId;
  if (!id) return [];
  return snapshotStore.value[id] || [];
});

async function loadSnapshots(chapterId: string) {
  const bid = booksStore.currentBookId;
  if (!bid) return;
  try {
    const files = await invoke<string[]>("list_book_files", { bookId: bid, subdir: `快照/${chapterId}` });
    const snaps: Snapshot[] = [];
    for (const f of files) {
      const ts = parseInt(f.replace(".txt", ""));
      if (isNaN(ts)) continue;
      try {
        const content = await invoke<string>("read_book_file", { bookId: bid, subdir: `快照/${chapterId}`, filename: f });
        const preview = content.replace(/\n+/g, " ").slice(0, 40) || "(空)";
        snaps.push({ timestamp: ts, content, preview });
      } catch { /* skip corrupt file */ }
    }
    snaps.sort((a, b) => a.timestamp - b.timestamp);
    snapshotStore.value = { ...snapshotStore.value, [chapterId]: snaps.slice(-MAX_SNAPSHOTS) };
  } catch {
    snapshotStore.value = { ...snapshotStore.value, [chapterId]: [] };
  }
}

async function migrateSnapshotsFromLocalStorage() {
  if (snapshotMigrationDone.value) return;
  snapshotMigrationDone.value = true;
  const raw = localStorage.getItem("chapter-snapshots-v1");
  if (!raw) return;
  const bid = booksStore.currentBookId;
  if (!bid) return;
  try {
    const old: Record<string, Snapshot[]> = JSON.parse(raw);
    for (const [chapterId, snaps] of Object.entries(old)) {
      for (const snap of snaps) {
        try {
          await invoke("write_book_file", { bookId: bid, subdir: `快照/${chapterId}`, filename: `${snap.timestamp}.txt`, content: snap.content });
        } catch { /* skip if already exists */ }
      }
    }
    localStorage.removeItem("chapter-snapshots-v1");
  } catch { /* ignore corrupt localStorage */ }
}

async function pushSnapshot(chapterId: string, content: string) {
  const list = snapshotStore.value[chapterId] || [];
  const last = list[list.length - 1];
  if (last && Date.now() - last.timestamp < MIN_SNAPSHOT_INTERVAL_MS) return;

  const preview = content.replace(/\n+/g, " ").slice(0, 40) || "(空)";
  const ts = Date.now();
  const snap: Snapshot = { timestamp: ts, content, preview };

  const bid = booksStore.currentBookId;
  if (bid) {
    try {
      await invoke("write_book_file", { bookId: bid, subdir: `快照/${chapterId}`, filename: `${ts}.txt`, content });
      // Prune oldest file if we're over the cap
      if (list.length >= MAX_SNAPSHOTS) {
        const oldest = list[0];
        try {
          await invoke("delete_book_file", { bookId: bid, subdir: `快照/${chapterId}`, filename: `${oldest.timestamp}.txt` });
        } catch { /* best effort */ }
      }
    } catch (e) { console.error("Failed to save snapshot:", e); }
  }

  const next = [...list, snap].slice(-MAX_SNAPSHOTS);
  snapshotStore.value = { ...snapshotStore.value, [chapterId]: next };
}

function restoreSnapshot(snap: Snapshot) {
  const ch = currentChapter.value;
  if (!ch || !editor.value) return;
  editor.value.commands.setContent(plainToHtml(snap.content));
  store.updateChapterContent(ch.id, snap.content);
  showHistory.value = false;
  autoSave();
}

function formatSnapTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── AI inline menu ──

const showAiMenu = ref(false);
const aiMenuPos = ref({ x: 0, y: 0 });
const selectedText = ref("");
const showContinueBtn = ref(false);

function updateContinueBtnVisibility() {
  if (!editor.value) { showContinueBtn.value = false; return; }
  const { from, to } = editor.value.state.selection;
  const hasSelection = from !== to;
  const hasContent = editor.value.getText().trim().length > 0;
  showContinueBtn.value = !hasSelection && hasContent && editor.value.isFocused;
}

function onTextSelect(e: MouseEvent) {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      showAiMenu.value = false;
      updateContinueBtnVisibility();
      return;
    }
    selectedText.value = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    aiMenuPos.value = {
      x: Math.min(Math.max(8, rect.left + rect.width / 2 - 120), window.innerWidth - 260),
      y: Math.max(8, rect.top - 50),
    };
    showAiMenu.value = true;
  }, 50);
}

function aiAction(action: string) {
  store.setChatQuote(`对以下文本进行${action === 'continue' ? '续写' : action === 'polish' ? '润色' : '分析'}：\n\n${selectedText.value}`);
  showAiMenu.value = false;
  selectedText.value = "";
}

// Continue writing from the cursor position, without requiring a selection —
// uses the tail of the existing text as context.
function continueFromCursor() {
  if (!editor.value) return;
  const text = editor.value.getText();
  const context = text.slice(-300).trim();
  store.setChatQuote(`请根据下面的结尾内容继续往下写：\n\n...${context}`);
}

// ── Keyboard ──

function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    saveNow();
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    emit("toggle-focus-mode");
  }
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".ai-inline-menu")) showAiMenu.value = false;
  if (!target.closest(".relative")) showHistory.value = false;
}

onMounted(async () => {
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onClickOutside);
  // Migrate from legacy localStorage, then load file-based snapshots
  await migrateSnapshotsFromLocalStorage();
  const chId = store.currentChapterId;
  if (chId) await loadSnapshots(chId);
});

// Reload snapshots when switching chapters
watch(() => store.currentChapterId, async (newId) => {
  if (newId) {
    await migrateSnapshotsFromLocalStorage();
    await loadSnapshots(newId);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onClickOutside);
  if (saveTimer) { clearTimeout(saveTimer); doSave(); }
  editor.value?.destroy();
});
</script>

<style>
.ProseMirror {
  line-height: 2;
  caret-color: var(--accent-color, #a78bfa);
  max-width: 820px;
  margin: 0 auto;
}

.dark-layout .ProseMirror {
  color: #cbd5e1;
}

.light-layout .ProseMirror {
  color: #1e293b;
}

.ProseMirror p {
  margin-bottom: 0.6em;
  font-size: 15px;
}

.ProseMirror h1 {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 1.2em 0 0.4em;
}

.ProseMirror h2 {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 1em 0 0.3em;
}

.ProseMirror h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0.8em 0 0.2em;
}

.dark-layout .ProseMirror h1,
.dark-layout .ProseMirror h2,
.dark-layout .ProseMirror h3 {
  color: #e2e8f0;
}

.light-layout .ProseMirror h1,
.light-layout .ProseMirror h2,
.light-layout .ProseMirror h3 {
  color: #1e293b;
}

.ProseMirror blockquote {
  border-left: 2px solid var(--accent-color, #a78bfa);
  padding: 0.3em 1em;
  margin: 0.6em 0;
  background: color-mix(in srgb, var(--accent-color, #a78bfa) 6%, transparent);
  border-radius: 0 4px 4px 0;
}

.dark-layout .ProseMirror blockquote {
  color: #94a3b8;
}

.light-layout .ProseMirror blockquote {
  color: #64748b;
}

.ProseMirror ul,
.ProseMirror ol {
  padding-left: 1.5em;
  margin: 0.4em 0;
}

.ProseMirror li {
  margin-bottom: 0.15em;
}

.ProseMirror:focus {
  outline: none;
}

.ProseMirror p.is-editor-empty:first-child::before {
  color: rgba(128, 128, 128, 0.3);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Toolbar active state follows the accent color instead of naive-ui's default primary blue */
.toolbar-btn-active {
  background: color-mix(in srgb, var(--accent-color, #a78bfa) 15%, transparent) !important;
  color: var(--accent-color, #a78bfa) !important;
  border-radius: 6px;
}

/* Save button label fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* AI inline menu enter/leave */
.ai-menu-enter-active,
.ai-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.ai-menu-enter-from,
.ai-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>