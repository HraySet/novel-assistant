<template>
  <div :class="tx('bg-white/3 border-white/6', 'bg-black/2 border-black/6')" class="p-4 rounded-xl border">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider font-medium text-text-secondary">码字日历</span>
        <span v-if="stats.streakDays > 0"
          class="text-[10px] px-1.5 py-0.5 rounded-full leading-none text-[var(--color-accent)] bg-[var(--color-accent-bg)]">
          连续 {{ stats.streakDays }} 天
        </span>
      </div>
      <span class="text-[10px] text-text-muted">近 12 周</span>
    </div>

    <div class="flex gap-0.5">
      <!-- Day labels：全周展示，非重点日更淡，节奏均匀 -->
      <div class="flex flex-col gap-0.5 mr-1 pt-4">
        <span v-for="(d, i) in WEEK_LABELS" :key="i"
          :class="[i % 2 === 1 ? 'opacity-40' : '', 'text-text-muted']"
          class="text-[10px] h-3.5 leading-none">{{ d }}</span>
      </div>

      <!-- Grid columns -->
      <div class="flex gap-0.5 overflow-x-auto">
        <div v-for="(col, ci) in calendarColumns" :key="ci" class="flex flex-col gap-0.5">
          <div v-for="(day, di) in col" :key="di"
            class="w-3.5 h-3.5 rounded-[3px] transition-all duration-200 hover:ring-1 hover:ring-[var(--color-accent-border)] hover:z-10 relative group"
            :class="[day.date && day.count > 0 ? 'cursor-pointer' : '']"
            :style="cellStyle(day)"
            :title="day.date ? `${day.date}: ${day.count.toLocaleString()} 字` : ''"
            @click="day.date && day.count > 0 && selectDay(day)">
            <!-- Tooltip on hover -->
            <div v-if="day.date && day.count > 0" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] shadow-[var(--shadow-popover)]">
              {{ day.date.slice(5) }} · {{ day.count.toLocaleString() }} 字
            </div>
          </div>
          <!-- Month label -->
          <span v-if="col[0] && isMonthLabel(col[0].date)" class="text-[10px] mt-0.5 text-text-muted">
            {{ monthLabel(col[0].date) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Legend：样例值由阈值常量派生，调整阈值图例自动同步 -->
    <div class="flex items-center gap-1.5 mt-3">
      <span class="text-[10px] text-text-muted">少</span>
      <div v-for="sample in legendSamples" :key="sample" class="w-3.5 h-3.5 rounded-[3px]" :style="getCellStyle(sample)" />
      <span class="text-[10px] text-text-muted">多</span>
    </div>

    <!-- 选中日期详情 -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0">
      <div v-if="selectedDay" class="mt-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-text-primary">{{ selectedDay.date }}</span>
          <button class="text-[10px] leading-none text-text-muted hover:text-text-primary" @click="selectedDay = null">✕</button>
        </div>
        <div class="text-xs mt-1 text-text-secondary">
          写了 <span class="font-semibold text-text-primary">{{ selectedDay.count.toLocaleString() }}</span> 字
        </div>
        <div v-if="selectedDay.chapters.length" class="text-[10px] mt-1 text-text-muted">
          改了：{{ selectedDay.chapters.join('、') }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStatsStore } from "../stores/stats";
import { tx } from "../composables/useTheme";

const stats = useStatsStore();

/** 色阶阈值：格子着色与图例样例共用，调整这里两处自动同步 */
const HEAT_THRESHOLDS = [300, 1000, 3000, 6000] as const;
const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface DayCell { date: string; count: number; dayOfWeek: number }

interface SelectedDay {
  date: string;
  count: number;
  chapters: string[];
}

const selectedDay = ref<SelectedDay | null>(null);

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function selectDay(day: DayCell) {
  const record = stats.dailyRecords.find(r => r.date === day.date);
  selectedDay.value = {
    date: day.date,
    count: day.count,
    chapters: (record?.chaptersEdited ?? []).map(basename),
  };
}

/**
 * 格子样式：热力色由主题强调色派生（--heat-1..5，useDesignTokens 注入），
 * 深浅主题自适应；今天用强调色描边。
 */
function getCellStyle(count: number): Record<string, string> {
  if (count < 0) return { opacity: "0" };
  if (count === 0) return { background: "var(--color-bg-surface-hover)" };
  if (count < HEAT_THRESHOLDS[0]) return { background: "var(--heat-1)" };
  if (count < HEAT_THRESHOLDS[1]) return { background: "var(--heat-2)" };
  if (count < HEAT_THRESHOLDS[2]) return { background: "var(--heat-3)" };
  if (count < HEAT_THRESHOLDS[3]) return { background: "var(--heat-4)" };
  return { background: "var(--heat-5)" };
}

function cellStyle(day: DayCell): Record<string, string> {
  const style = getCellStyle(day.count);
  if (day.date && isToday(day.date)) {
    style.boxShadow = "0 0 0 1px var(--color-accent)";
  }
  return style;
}

/** 图例样例值：0 + 各阈值区间中点 + 上限 */
const legendSamples = computed(() => {
  const t = HEAT_THRESHOLDS;
  return [
    0,
    Math.round(t[0] / 2),
    Math.round((t[0] + t[1]) / 2),
    Math.round((t[1] + t[2]) / 2),
    Math.round((t[2] + t[3]) / 2),
    t[3],
  ];
});

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isToday(date: string): boolean {
  return date === todayStr();
}

function isMonthLabel(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.split("-");
  return d[2] === "01" || (+d[2] <= 7);
}

function monthLabel(dateStr: string): string {
  const m = dateStr.split("-")[1];
  const months = ["", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  return months[+m] || "";
}

const calendarColumns = computed(() => {
  const raw = stats.calendarData as DayCell[];
  const cols: DayCell[][] = [];
  let currentCol: DayCell[] = [];
  for (let i = 0; i < raw.length; i++) {
    const day = raw[i];
    const adj = day.dayOfWeek === 0 ? 6 : day.dayOfWeek - 1;
    if (adj === 0 && currentCol.length > 0) { cols.push(currentCol); currentCol = []; }
    while (currentCol.length < adj) { currentCol.push({ date: "", count: -1, dayOfWeek: currentCol.length }); }
    currentCol.push(day);
  }
  if (currentCol.length > 0) cols.push(currentCol);
  return cols;
});
</script>
