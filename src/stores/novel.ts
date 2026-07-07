import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useBooksStore } from "./books";

// ── Types ──

export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  appearance: string;
  notes: string;
}

export interface OutlineNode {
  id: string;
  parentId: string | null;
  title: string;
  summary: string;
  goal: string;
  keyEvents: string[];
  characterRefs: string[];
  foreshadowIn: string;
  foreshadowOut: string;
  sortOrder: number;
}

export interface Chapter {
  id: string;
  outlineId: string;
  title: string;
  content: string;
  filename: string;
  status: "draft" | "writing" | "done";
}

export interface TreeNode {
  key: string;
  label: string;
  children?: TreeNode[];
  isLeaf?: boolean;
  outlineId?: string;
}

// ── Markdown parsers ──

function parseOutlineMd(md: string): { volumes: OutlineNode[]; chapters: OutlineNode[] } {
  const volumes: OutlineNode[] = [];
  const chapters: OutlineNode[] = [];
  const lines = md.split("\n");

  let currentVolume: OutlineNode | null = null;
  let currentChapter: OutlineNode | null = null;
  let currentKey: string | null = null;
  let vi = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (currentChapter) { chapters.push(currentChapter); currentChapter = null; }
      if (currentVolume) volumes.push(currentVolume);
      const title = line.slice(3).trim();
      currentVolume = {
        id: `vol_${vi}`, parentId: null, title,
        summary: "", goal: "", keyEvents: [], characterRefs: [],
        foreshadowIn: "", foreshadowOut: "", sortOrder: vi,
      };
      currentKey = null;
      vi++;
      continue;
    }
    if (line.startsWith("### ")) {
      if (currentChapter) chapters.push(currentChapter);
      const title = line.slice(4).trim();
      const ci = chapters.filter(c => c.parentId === currentVolume?.id).length;
      currentChapter = {
        id: currentVolume ? `ch_${currentVolume.sortOrder}_${ci}` : `ch_${ci}`,
        parentId: currentVolume?.id ?? null, title,
        summary: "", goal: "", keyEvents: [], characterRefs: [],
        foreshadowIn: "", foreshadowOut: "", sortOrder: ci,
      };
      currentKey = null;
      continue;
    }
    const propMatch = line.match(/^- (\w+):\s*(.*)/);
    if (propMatch) {
      const key = propMatch[1];
      const value = propMatch[2];
      const target = currentChapter || currentVolume;
      if (!target) continue;
      currentKey = key;
      if (key === "goal") target.goal = value;
      else if (key === "summary") target.summary = value;
      else if (key === "foreshadowIn") target.foreshadowIn = value;
      else if (key === "foreshadowOut") target.foreshadowOut = value;
      else if (key === "characterRefs") {
        target.characterRefs = value ? value.split(",").map(s => s.trim()).filter(Boolean) : [];
      } else if (key === "keyEvents" && value) {
        target.keyEvents = [value];
      }
      continue;
    }
    const subMatch = line.match(/^  - (.*)/);
    if (subMatch && currentKey === "keyEvents") {
      const target = currentChapter || currentVolume;
      if (target) target.keyEvents.push(subMatch[1]);
      continue;
    }
  }
  if (currentChapter) chapters.push(currentChapter);
  if (currentVolume) volumes.push(currentVolume);
  return { volumes, chapters };
}

function serializeOutlineMd(volumes: OutlineNode[], chapters: OutlineNode[]): string {
  const lines: string[] = ["# 大纲", ""];
  for (const vol of volumes.sort((a, b) => a.sortOrder - b.sortOrder)) {
    lines.push(`## ${vol.title}`);
    if (vol.summary) lines.push(`- summary: ${vol.summary}`);
    if (vol.goal) lines.push(`- goal: ${vol.goal}`);
    lines.push("");
    const volChapters = chapters
      .filter(c => c.parentId === vol.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const ch of volChapters) {
      lines.push(`### ${ch.title}`);
      if (ch.goal) lines.push(`- goal: ${ch.goal}`);
      if (ch.summary) lines.push(`- summary: ${ch.summary}`);
      if (ch.keyEvents.length > 0) {
        lines.push("- keyEvents:");
        ch.keyEvents.forEach(e => lines.push(`  - ${e}`));
      }
      if (ch.characterRefs.length > 0) {
        lines.push(`- characterRefs: ${ch.characterRefs.join(", ")}`);
      }
      if (ch.foreshadowIn) lines.push(`- foreshadowIn: ${ch.foreshadowIn}`);
      if (ch.foreshadowOut) lines.push(`- foreshadowOut: ${ch.foreshadowOut}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function parseCharacterMd(md: string, id: string): Character {
  const lines = md.split("\n");
  const char: Character = { id, name: "", role: "", personality: "", appearance: "", notes: "" };
  let inNotes = false;
  const noteLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("# ")) { char.name = line.slice(2).trim(); continue; }
    if (inNotes) { noteLines.push(line); continue; }
    const propMatch = line.match(/^- (\w+):\s*(.*)/);
    if (propMatch) {
      const key = propMatch[1];
      const value = propMatch[2];
      if (key === "role") char.role = value;
      else if (key === "personality") char.personality = value;
      else if (key === "appearance") char.appearance = value;
      continue;
    }
    if (line.trim() === "" && char.name) { inNotes = true; continue; }
  }
  char.notes = noteLines.join("\n").trim();
  if (!char.name && lines.length > 0) char.name = lines[0].replace(/^#\s*/, "").trim();
  return char;
}

function serializeCharacterMd(c: Character): string {
  const lines = [`# ${c.name}`];
  if (c.role) lines.push(`- role: ${c.role}`);
  if (c.personality) lines.push(`- personality: ${c.personality}`);
  if (c.appearance) lines.push(`- appearance: ${c.appearance}`);
  if (c.notes) { lines.push(""); lines.push(c.notes); }
  return lines.join("\n");
}

// ── Store ──

export const useNovelStore = defineStore("novel", () => {
  const booksStore = useBooksStore();
  const characters = ref<Character[]>([]);
  const outlines = ref<OutlineNode[]>([]);
  const chapters = ref<Chapter[]>([]);
  const currentChapterId = ref<string | null>(null);
  const leftSidebarOpen = ref(true);
  const rightSidebarOpen = ref(true);
  const chatQuote = ref("");
  const chatAutoOpen = ref(false);
  const chapterUpdateSignal = ref(0);
  const loading = ref(false);

  const currentChapter = computed(() =>
    chapters.value.find((c) => c.id === currentChapterId.value) ?? null
  );

  const outlineTree = computed<TreeNode[]>(() => {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];
    for (const o of outlines.value) {
      const node: TreeNode = { key: o.id, label: o.title, children: [], isLeaf: false, outlineId: o.id };
      map.set(o.id, node);
    }
    for (const o of outlines.value) {
      const node = map.get(o.id)!;
      if (o.parentId && map.has(o.parentId)) {
        map.get(o.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    const markLeaves = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) markLeaves(n.children);
        else n.isLeaf = true;
      }
    };
    markLeaves(roots);
    return roots;
  });

  async function loadBook(bookId: string) {
    loading.value = true;
    try {
      const chapterFiles = await invoke<{ filename: string; size_bytes: number }[]>(
        "list_book_files", { bookId, subdir: "章节" }
      );
      const chapterPromises = chapterFiles.map(async (f, idx) => {
        try {
          const content = await invoke<string>("read_book_file", {
            bookId, subdir: "章节", filename: f.filename,
          });
          const title = f.filename.replace(/\.txt$/, "").replace(/^ch\d+-/, "");
          const outlineNode = outlines.value.find(o => o.title === title)
            || outlines.value.find(o => f.filename.includes(o.title));
          return {
            id: `ch_${idx}`, outlineId: outlineNode?.id ?? `ch_${idx}`,
            title, content, filename: f.filename, status: "draft" as const,
          };
        } catch { return null; }
      });
      const loadedChapters = (await Promise.all(chapterPromises)).filter(Boolean) as Chapter[];
      chapters.value = loadedChapters;

      try {
        const outlineMd = await invoke<string>("read_book_file", {
          bookId, subdir: "大纲", filename: "outline.md",
        });
        const { volumes, chapters: parsedChapters } = parseOutlineMd(outlineMd);
        outlines.value = [...volumes, ...parsedChapters];
        for (const ch of chapters.value) {
          const match = parsedChapters.find(o => o.title === ch.title);
          if (match) { ch.outlineId = match.id; ch.status = "draft"; }
        }
      } catch { outlines.value = []; }

      try {
        const charFiles = await invoke<{ filename: string }[]>(
          "list_book_files", { bookId, subdir: "角色" }
        );
        const charPromises = charFiles.map(async (f, idx) => {
          try {
            const md = await invoke<string>("read_book_file", {
              bookId, subdir: "角色", filename: f.filename,
            });
            return parseCharacterMd(md, `char_${idx}`);
          } catch { return null; }
        });
        characters.value = (await Promise.all(charPromises)).filter(Boolean) as Character[];
      } catch { characters.value = []; }
    } catch (e) {
      console.error("Failed to load book:", e);
    } finally {
      loading.value = false;
    }
  }

  watch(() => booksStore.currentBookId, (newId, oldId) => {
    if (!newId || newId === oldId) return;
    if (oldId) saveOutline(oldId);
    loadBook(newId);
  }, { immediate: true });

  async function saveOutline(bookId: string) {
    const vols = outlines.value.filter(o => !o.parentId);
    const chs = outlines.value.filter(o => o.parentId);
    const md = serializeOutlineMd(vols, chs);
    try {
      await invoke("write_book_file", { bookId, subdir: "大纲", filename: "outline.md", content: md });
    } catch (e) { console.error("Failed to save outline:", e); }
  }

  async function saveCharacter(bookId: string, char: Character) {
    const md = serializeCharacterMd(char);
    try {
      await invoke("write_book_file", { bookId, subdir: "角色", filename: `${char.name}.md`, content: md });
    } catch (e) { console.error("Failed to save character:", e); }
  }

  async function deleteCharacterFile(bookId: string, name: string) {
    try {
      await invoke("delete_book_file", { bookId, subdir: "角色", filename: `${name}.md` });
    } catch (e) { console.error("Failed to delete character:", e); }
  }

  async function saveChapterFile(bookId: string, ch: Chapter) {
    const idx = chapters.value.findIndex(c => c.id === ch.id);
    const filename = ch.filename || `ch${String(idx >= 0 ? idx + 1 : chapters.value.length + 1).padStart(3, "0")}-${ch.title}.txt`;
    ch.filename = filename;
    try {
      await invoke("write_book_file", { bookId, subdir: "章节", filename, content: ch.content || "" });
    } catch (e) { console.error("Failed to save chapter:", e); }
  }

  function addCharacter(c: Omit<Character, "id">) {
    const id = `char_${Date.now()}`;
    const char: Character = { ...c, id };
    characters.value.push(char);
    const bid = booksStore.currentBookId;
    if (bid) saveCharacter(bid, char);
  }

  function deleteCharacter(id: string) {
    const char = characters.value.find(c => c.id === id);
    characters.value = characters.value.filter(c => c.id !== id);
    const bid = booksStore.currentBookId;
    if (bid && char) deleteCharacterFile(bid, char.name);
  }

  function reorderCharacter(fromIdx: number, toIdx: number) {
    const arr = characters.value;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
  }

  function addOutlineNode(n: Omit<OutlineNode, "id" | "sortOrder">) {
    const siblings = outlines.value.filter(o => o.parentId === n.parentId);
    const maxOrder = siblings.reduce((m, o) => Math.max(m, o.sortOrder), -1);
    const id = n.parentId
      ? `ch_${(n.parentId).replace("vol_", "")}_${siblings.length}`
      : `vol_${outlines.value.filter(o => !o.parentId).length}`;
    outlines.value.push({ ...n, id, sortOrder: maxOrder + 1 });
    const bid = booksStore.currentBookId;
    if (bid) saveOutline(bid);
  }

  function deleteOutlineNode(id: string) {
    const toDelete = new Set<string>();
    const collect = (nodeId: string) => {
      toDelete.add(nodeId);
      outlines.value.filter(o => o.parentId === nodeId).forEach(o => collect(o.id));
    };
    collect(id);
    outlines.value = outlines.value.filter(o => !toDelete.has(o.id));
    chapters.value = chapters.value.filter(c => !toDelete.has(c.outlineId));
    if (toDelete.has(currentChapterId.value!)) currentChapterId.value = null;
    const bid = booksStore.currentBookId;
    if (bid) saveOutline(bid);
  }

  function selectChapter(id: string) { currentChapterId.value = id; }

  function getOrCreateChapter(outlineId: string): Chapter {
    let existing = chapters.value.find(c => c.outlineId === outlineId)
                || chapters.value.find(c => c.id === outlineId);
    if (existing) { currentChapterId.value = existing.id; return existing; }
    const outline = outlines.value.find(o => o.id === outlineId);
    const title = outline?.title ?? "新章节";
    const idx = chapters.value.length + 1;
    const filename = `ch${String(idx).padStart(3, "0")}-${title}.txt`;
    const ch: Chapter = { id: `ch_${idx}`, outlineId, title, content: "", filename, status: "draft" };
    chapters.value.push(ch);
    currentChapterId.value = ch.id;
    const bid = booksStore.currentBookId;
    if (bid) saveChapterFile(bid, ch);
    return ch;
  }

  function updateChapterContent(id: string, content: string) {
    const ch = chapters.value.find(c => c.id === id);
    if (ch) ch.content = content;
  }

  function updateChapterTitle(id: string, title: string) {
    const ch = chapters.value.find(c => c.id === id);
    if (ch) ch.title = title;
  }

  function setChatQuote(quote: string) { chatQuote.value = quote; chatAutoOpen.value = true; }

  function discussCharacter(id: string) {
    const c = characters.value.find(ch => ch.id === id);
    if (!c) return;
    const parts = [`请分析角色「${c.name}」`];
    if (c.role) parts.push(`定位：${c.role}`);
    if (c.personality) parts.push(`性格：${c.personality}`);
    if (c.appearance) parts.push(`外貌：${c.appearance}`);
    if (c.notes) parts.push(`备注：${c.notes}`);
    parts.push("\n请从角色塑造、剧情潜力、与其他角色的互动可能性等角度给出分析，并提供改进建议。");
    chatQuote.value = parts.join("\n");
    chatAutoOpen.value = true;
  }

  function discussOutline(id: string) {
    const o = outlines.value.find(ol => ol.id === id);
    if (!o) return;
    chatQuote.value = `讨论大纲「${o.title}」——${o.summary || "暂无摘要"}`;
    chatAutoOpen.value = true;
  }

  function clearChatQuote() { chatQuote.value = ""; chatAutoOpen.value = false; }
  function toggleLeftSidebar() { leftSidebarOpen.value = !leftSidebarOpen.value; }
  function toggleRightSidebar() { rightSidebarOpen.value = !rightSidebarOpen.value; }

  // ── Chat history ──

  const chatHistories = ref<Record<string, any[]>>({});

  function saveChatHistory(chapterId: string, messages: any[]) {
    chatHistories.value[chapterId] = messages;
    const bid = booksStore.currentBookId;
    if (bid) {
      invoke("write_book_file", {
        bookId: bid, subdir: "聊天", filename: `${chapterId}.json`,
        content: JSON.stringify(messages, null, 2),
      }).catch(() => {});
    }
  }

  async function loadChatHistory(chapterId: string): Promise<any[] | null> {
    if (chatHistories.value[chapterId]) return chatHistories.value[chapterId];

    const bid = booksStore.currentBookId;
    if (!bid) return null;

    try {
      const json = await invoke<string>("read_book_file", {
        bookId: bid, subdir: "聊天", filename: `${chapterId}.json`,
      });
      const parsed = JSON.parse(json);
      chatHistories.value[chapterId] = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  return {
    characters, outlines, chapters, currentChapterId,
    leftSidebarOpen, rightSidebarOpen, currentChapter, outlineTree,
    chatQuote, chatAutoOpen, chapterUpdateSignal, loading,
    loadBook,
    addCharacter, deleteCharacter, reorderCharacter,
    addOutlineNode, deleteOutlineNode,
    selectChapter, getOrCreateChapter, updateChapterContent, updateChapterTitle,
    setChatQuote, discussCharacter, discussOutline, clearChatQuote,
    toggleLeftSidebar, toggleRightSidebar,
    saveChapterFile, saveOutline, saveCharacter,
    saveChatHistory, loadChatHistory,
  };
});
