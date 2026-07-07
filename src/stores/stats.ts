import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useBooksStore } from "./books";

export interface DailyRecord {
  date: string;
  wordCount: number;
  chaptersEdited: string[];
}

export interface WritingSession {
  startTime: number;
  elapsedMs: number;
  isRunning: boolean;
}

interface StatsData {
  records: DailyRecord[];
  snapshots: Record<string, number>;
  goal: number;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadStats(bookId: string): Promise<StatsData> {
  try {
    const json = await invoke<string>("read_book_file", { bookId, subdir: "", filename: "stats.json" });
    return JSON.parse(json);
  } catch {
    return { records: [], snapshots: {}, goal: 4000 };
  }
}

async function saveStats(bookId: string, data: StatsData) {
  try {
    await invoke("write_book_file", { bookId, subdir: "", filename: "stats.json", content: JSON.stringify(data, null, 2) });
  } catch (e) { console.error("Failed to save stats:", e); }
}

export const useStatsStore = defineStore("stats", () => {
  const booksStore = useBooksStore();
  const dailyRecords = ref<DailyRecord[]>([]);
  const chapterSnapshots = ref<Record<string, number>>({});
  const dailyGoal = ref(4000);

  const session = ref<WritingSession>({ startTime: 0, elapsedMs: 0, isRunning: false });
  let sessionTimer: ReturnType<typeof setInterval> | null = null;

  const todayRecord = computed(() => {
    const today = todayString();
    return dailyRecords.value.find(r => r.date === today) ?? null;
  });

  const todayWords = computed(() => todayRecord.value?.wordCount ?? 0);

  const todayGoalPercent = computed(() => {
    if (dailyGoal.value <= 0) return 0;
    return Math.min(Math.round((todayWords.value / dailyGoal.value) * 100), 100);
  });

  const todayGoalMet = computed(() => todayWords.value >= dailyGoal.value);

  const streakDays = computed(() => {
    let streak = 0;
    const sorted = [...dailyRecords.value].sort((a, b) => b.date.localeCompare(a.date));
    const today = todayString();
    for (let i = 0; i < sorted.length; i++) {
      const expected = new Date();
      expected.setDate(expected.getDate() - i);
      const es = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`;
      if (sorted[i].date === es && sorted[i].wordCount > 0) streak++;
      else if (i === 0 && sorted[i].date !== today) break;
      else break;
    }
    return streak;
  });

  const calendarData = computed(() => {
    const days: { date: string; count: number; dayOfWeek: number }[] = [];
    const now = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const record = dailyRecords.value.find(r => r.date === ds);
      days.push({ date: ds, count: record?.wordCount ?? 0, dayOfWeek: d.getDay() });
    }
    return days;
  });

  const sessionElapsed = computed(() => {
    if (!session.value.isRunning) return session.value.elapsedMs;
    return session.value.elapsedMs + (Date.now() - session.value.startTime);
  });

  const sessionFormatted = computed(() => {
    const ms = sessionElapsed.value;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}小时${minutes}分`;
    return `${minutes}分钟`;
  });

  const totalWordsAllTime = computed(() =>
    dailyRecords.value.reduce((sum, r) => sum + r.wordCount, 0)
  );

  watch(() => booksStore.currentBookId, async (newId, oldId) => {
    if (!newId || newId === oldId) return;
    if (oldId) {
      await saveStats(oldId, { records: dailyRecords.value, snapshots: chapterSnapshots.value, goal: dailyGoal.value });
    }
    const data = await loadStats(newId);
    dailyRecords.value = data.records;
    chapterSnapshots.value = data.snapshots;
    dailyGoal.value = data.goal;
  }, { immediate: true });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch([dailyRecords, chapterSnapshots, dailyGoal], () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const bid = booksStore.currentBookId;
      if (bid) saveStats(bid, { records: dailyRecords.value, snapshots: chapterSnapshots.value, goal: dailyGoal.value });
    }, 1000);
  }, { deep: true });

  function syncChapterSnapshot(chapterId: string, wordCount: number) {
    if (!(chapterId in chapterSnapshots.value)) chapterSnapshots.value[chapterId] = wordCount;
  }

  function recordChapterEdit(chapterId: string, newWordCount: number) {
    if (!(chapterId in chapterSnapshots.value)) { chapterSnapshots.value[chapterId] = newWordCount; return; }
    const prev = chapterSnapshots.value[chapterId];
    const delta = newWordCount - prev;
    chapterSnapshots.value[chapterId] = newWordCount;
    if (delta !== 0) {
      const today = todayString();
      const existing = dailyRecords.value.find(r => r.date === today);
      if (existing) {
        existing.wordCount = Math.max(0, existing.wordCount + delta);
        if (!existing.chaptersEdited.includes(chapterId)) existing.chaptersEdited.push(chapterId);
      } else {
        dailyRecords.value.push({ date: today, wordCount: Math.max(0, delta), chaptersEdited: [chapterId] });
      }
    }
  }

  function setDailyGoal(goal: number) { dailyGoal.value = goal; }

  function startSession() {
    if (session.value.isRunning) return;
    session.value.startTime = Date.now();
    session.value.isRunning = true;
    sessionTimer = setInterval(() => { session.value = { ...session.value }; }, 1000);
  }

  function pauseSession() {
    if (!session.value.isRunning) return;
    session.value.elapsedMs += Date.now() - session.value.startTime;
    session.value.isRunning = false;
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  }

  function resetSession() {
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
    session.value = { startTime: 0, elapsedMs: 0, isRunning: false };
  }

  function toggleSession() { if (session.value.isRunning) pauseSession(); else startSession(); }

  return {
    dailyRecords, dailyGoal, todayRecord, todayWords,
    todayGoalPercent, todayGoalMet, streakDays, calendarData,
    session, sessionElapsed, sessionFormatted, totalWordsAllTime,
    recordChapterEdit, syncChapterSnapshot, setDailyGoal,
    startSession, pauseSession, resetSession, toggleSession,
  };
});
