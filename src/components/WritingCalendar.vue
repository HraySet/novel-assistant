<template>
  <div :class="tx('bg-white/[0.03] border-white/[0.06]', 'bg-black/[0.02] border-black/[0.06]')" class="p-4 rounded-xl border">
    <div class="flex items-center justify-between mb-3">
      <span :class="tx('text-gray-400', 'text-gray-500')" class="text-[10px] uppercase tracking-wider font-medium">码字日历</span>
      <span :class="tx('text-gray-600', 'text-gray-400')" class="text-[10px]">近 12 周</span>
    </div>

    <div class="flex gap-0.5">
      <!-- Day labels -->
      <div class="flex flex-col gap-0.5 mr-1 pt-[16px]">
        <span v-for="d in ['一','','三','','五','','日']" :key="d" :class="tx('text-gray-600', 'text-gray-400')" class="text-[8px] h-3 leading-none">{{ d }}</span>
      </div>

      <!-- Grid columns -->
      <div class="flex gap-0.5 overflow-x-auto">
        <div v-for="(col, ci) in calendarColumns" :key="ci" class="flex flex-col gap-0.5">
          <div v-for="(day, di) in col" :key="di"
            class="w-3 h-3 rounded-sm transition-colors duration-200 hover:scale-125 hover:z-10 relative group"
            :class="getCellClass(day.count)"
            :title="day.date ? `${day.date}: ${day.count.toLocaleString()} 字` : ''">
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStatsStore } from "../stores/stats";
import { useSettingsStore } from "../stores/settings";

const stats = useStatsStore();
const s = useSettingsStore();
const tx = (d: string, l: string) => s.themeDark ? d : l;

interface DayCell { date: string; count: number; dayOfWeek: number }

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
