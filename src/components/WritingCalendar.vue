<template>
  <div :class="tx('bg-white/3 border-white/6', 'bg-black/2 border-black/6')" class="p-4 rounded-xl border">
    <div class="flex items-center justify-between mb-3">
      <span :class="tx('text-gray-400', 'text-gray-500')" class="text-[10px] uppercase tracking-wider font-medium">码字日历</span>
      <span :class="tx('text-gray-600', 'text-gray-400')" class="text-[10px]">近 12 周</span>
    </div>

    <div class="flex gap-0.5">
      <!-- Day labels -->
      <div class="flex flex-col gap-0.5 mr-1 pt-4">
        <span v-for="d in ['一','','三','','五','','日']" :key="d" :class="tx('text-gray-600', 'text-gray-400')" class="text-[8px] h-3 leading-none">{{ d }}</span>
      </div>

      <!-- Grid columns -->
      <div class="flex gap-0.5 overflow-x-auto">
        <div v-for="(col, ci) in calendarColumns" :key="ci" class="flex flex-col gap-0.5">
          <div v-for="(day, di) in col" :key="di"
            class="w-3 h-3 rounded-sm transition-colors duration-200 hover:scale-125 hover:z-10 relative group"
            :class="[getCellClass(day.count), day.date && day.count > 0 ? 'cursor-pointer' : '']"
            :title="day.date ? `${day.date}: ${day.count.toLocaleString()} 字` : ''"
            @click="day.date && day.count > 0 && selectDay(day)">
            <!-- Tooltip on hover -->
            <div v-if="day.date && day.count > 0" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20"
              :class="tx('bg-[#1e1e32] text-gray-200 border border-white/10', 'bg-white text-gray-700 border border-black/10')">
              {{ day.date.slice(5) }} · {{ day.count.toLocaleString() }} 字
            </div>
          </div>
          <!-- Month label -->
          <span v-if="col[0] && isMonthLabel(col[0].date)" :class="tx('text-gray-500', 'text-gray-400')" class="text-[8px] mt-0.5">
            {{ monthLabel(col[0].date) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="flex items-center gap-1.5 mt-3">
      <span :class="tx('text-gray-600', 'text-gray-400')" class="text-[8px]">少</span>
      <div class="w-3 h-3 rounded-sm" :class="getCellClass(0)" />
      <div class="w-3 h-3 rounded-sm" :class="getCellClass(1)" />
      <div class="w-3 h-3 rounded-sm" :class="getCellClass(500)" />
      <div class="w-3 h-3 rounded-sm" :class="getCellClass(2000)" />
      <div class="w-3 h-3 rounded-sm" :class="getCellClass(5000)" />
      <span :class="tx('text-gray-600', 'text-gray-400')" class="text-[8px]">多</span>
    </div>

    <!-- 选中日期详情 -->
    <div v-if="selectedDay" class="mt-3 p-3 rounded-lg border"
      :class="tx('border-white/10 bg-white/5', 'border-black/10 bg-black/5')">
      <div class="flex items-center justify-between">
        <span :class="tx('text-gray-200', 'text-gray-700')" class="text-xs font-medium">{{ selectedDay.date }}</span>
        <button class="text-[10px] leading-none"
          :class="tx('text-gray-500 hover:text-gray-300', 'text-gray-400 hover:text-gray-600')"
          @click="selectedDay = null">✕</button>
      </div>
      <div :class="tx('text-gray-300', 'text-gray-600')" class="text-xs mt-1">
        写了 <span class="font-semibold">{{ selectedDay.count.toLocaleString() }}</span> 字
      </div>
      <div v-if="selectedDay.chapters.length" :class="tx('text-gray-400', 'text-gray-500')" class="text-[10px] mt-1">
        改了：{{ selectedDay.chapters.join('、') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useStatsStore } from "../stores/stats";
import { useSettingsStore } from "../stores/settings";
import { tx } from "../composables/useTheme";

const stats = useStatsStore();
const s = useSettingsStore();

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

function getCellClass(count: number): string {
  if (count < 0) return "opacity-0";
  const d = s.themeDark;
  if (count === 0) return d ? "bg-white/[0.04]" : "bg-black/[0.04]";
  if (count < 300) return d ? "bg-emerald-500/25" : "bg-emerald-500/20";
  if (count < 1000) return d ? "bg-emerald-500/45" : "bg-emerald-500/40";
  if (count < 3000) return d ? "bg-emerald-500/65" : "bg-emerald-500/60";
  if (count < 6000) return d ? "bg-emerald-500/85" : "bg-emerald-500/80";
  return d ? "bg-emerald-400" : "bg-emerald-500";
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
</script>
