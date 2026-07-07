import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useBooksStore } from "./books";

export interface SettingCategory {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface SettingEntry {
  id: string;
  categoryId: string;
  name: string;
  fields: Record<string, string>;
  tags: string[];
  chapterRef: string;
  characterRefs: string[];
  notes: string;
  sortOrder: number;
  createdAt: string;
}

interface SettingsData {
  categories: SettingCategory[];
  entries: SettingEntry[];
}

const DEFAULT_CATEGORIES: SettingCategory[] = [
  { id: "cat_realm", name: "境界体系", icon: "🌍", sortOrder: 0 },
  { id: "cat_skill", name: "功法技能", icon: "⚔️", sortOrder: 1 },
  { id: "cat_faction", name: "势力宗门", icon: "🏛️", sortOrder: 2 },
  { id: "cat_location", name: "地名场景", icon: "🗺️", sortOrder: 3 },
  { id: "cat_item", name: "物品法宝", icon: "💎", sortOrder: 4 },
  { id: "cat_timeline", name: "时间线", icon: "📮", sortOrder: 5 },
];

function genId(): string { return crypto.randomUUID(); }

async function loadData(bookId: string): Promise<SettingsData> {
  try {
    const json = await invoke<string>("read_book_file", { bookId, subdir: "设定", filename: "settings.json" });
    return JSON.parse(json);
  } catch {
    return { categories: [...DEFAULT_CATEGORIES], entries: [] };
  }
}

async function saveData(bookId: string, data: SettingsData) {
  try {
    await invoke("write_book_file", { bookId, subdir: "设定", filename: "settings.json", content: JSON.stringify(data, null, 2) });
  } catch (e) { console.error("Failed to save settings:", e); }
}

export const useSettingLibStore = defineStore("settingslib", () => {
  const booksStore = useBooksStore();
  const categories = ref<SettingCategory[]>([...DEFAULT_CATEGORIES]);
  const entries = ref<SettingEntry[]>([]);
  const selectedCategoryId = ref<string>("cat_realm");
  const searchQuery = ref("");
  const editingEntry = ref<SettingEntry | null>(null);
  const showEditor = ref(false);

  const selectedCategory = computed(() =>
    categories.value.find(c => c.id === selectedCategoryId.value) ?? categories.value[0] ?? null
  );

  const filteredEntries = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    let list = q
      ? entries.value.filter(e =>
          e.name.toLowerCase().includes(q) ||
          e.tags.some(t => t.toLowerCase().includes(q)) ||
          Object.values(e.fields).some(v => v.toLowerCase().includes(q)) ||
          e.notes.toLowerCase().includes(q)
        )
      : entries.value;
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const categoryStats = computed(() => {
    const stats: Record<string, number> = {};
    for (const cat of categories.value) stats[cat.id] = entries.value.filter(e => e.categoryId === cat.id).length;
    return stats;
  });

  const totalEntries = computed(() => entries.value.length);

  watch(() => booksStore.currentBookId, async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    if (oldId) await saveData(oldId, { categories: categories.value, entries: entries.value });
    const data = await loadData(newId);
    categories.value = data.categories;
    entries.value = data.entries;
    selectedCategoryId.value = data.categories[0]?.id ?? "cat_realm";
    searchQuery.value = "";
  }, { immediate: true });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch([categories, entries], () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const bid = booksStore.currentBookId;
      if (bid) saveData(bid, { categories: categories.value, entries: entries.value });
    }, 500);
  }, { deep: true });

  function addCategory(name: string, icon: string) {
    const maxOrder = categories.value.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    categories.value.push({ id: genId(), name, icon, sortOrder: maxOrder + 1 });
  }

  function deleteCategory(id: string) {
    if (DEFAULT_CATEGORIES.some(c => c.id === id)) return;
    categories.value = categories.value.filter(c => c.id !== id);
    entries.value = entries.value.filter(e => e.categoryId !== id);
    if (selectedCategoryId.value === id) selectedCategoryId.value = categories.value[0]?.id ?? "";
  }

  function updateCategory(id: string, updates: Partial<Pick<SettingCategory, "name" | "icon">>) {
    const cat = categories.value.find(c => c.id === id);
    if (cat) Object.assign(cat, updates);
  }

  function reorderCategory(fromIdx: number, toIdx: number) {
    const arr = categories.value;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    arr.forEach((c, i) => (c.sortOrder = i));
  }

  function openNewEntry(categoryId?: string) {
    editingEntry.value = null;
    showEditor.value = true;
    if (categoryId) selectedCategoryId.value = categoryId;
  }

  function openEditEntry(id: string) {
    const entry = entries.value.find(e => e.id === id);
    if (entry) {
      editingEntry.value = { ...entry, fields: { ...entry.fields }, tags: [...entry.tags], characterRefs: [...entry.characterRefs] };
      showEditor.value = true;
    }
  }

  function closeEditor() { editingEntry.value = null; showEditor.value = false; }

  function saveEntry(data: {
    id?: string; categoryId: string; name: string;
    fields: Record<string, string>; tags: string[];
    chapterRef: string; characterRefs: string[]; notes: string;
  }) {
    if (data.id) {
      const entry = entries.value.find(e => e.id === data.id);
      if (entry) Object.assign(entry, data);
    } else {
      const maxOrder = entries.value.filter(e => e.categoryId === data.categoryId).reduce((m, e) => Math.max(m, e.sortOrder), -1);
      entries.value.push({ ...data, id: genId(), sortOrder: maxOrder + 1, createdAt: new Date().toISOString() });
    }
    closeEditor();
  }

  function deleteEntry(id: string) { entries.value = entries.value.filter(e => e.id !== id); }
  function selectCategory(id: string) { selectedCategoryId.value = id; }
  function setSearch(q: string) { searchQuery.value = q; }

  return {
    categories, entries, selectedCategoryId, selectedCategory,
    filteredEntries, categoryStats, totalEntries, searchQuery,
    editingEntry, showEditor,
    addCategory, deleteCategory, updateCategory, reorderCategory,
    openNewEntry, openEditEntry, closeEditor, saveEntry, deleteEntry,
    selectCategory, setSearch,
  };
});
