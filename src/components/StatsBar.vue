<template>
  <div class="flex items-center gap-4 px-4 py-1.5 shrink-0 text-xs"
    :class="s.themeDark ? 'text-gray-500' : 'text-gray-400'">
    <div class="flex items-center gap-2">
      <span>今日</span>
      <span class="font-semibold tabular-nums" :class="stats.todayGoalMet ? 'text-green-400' : tx('text-gray-300','text-gray-700')">
        {{ stats.todayWords.toLocaleString() }}
      </span>
      <span class="tabular-nums">/ {{ stats.dailyGoal.toLocaleString() }}</span>
      <div class="w-10 h-1 rounded-full overflow-hidden" :class="tx('bg-white/10','bg-black/10')">
        <div class="h-full rounded-full transition-all duration-500"
          :style="{ width: stats.todayGoalPercent + '%', backgroundColor: stats.todayGoalPercent >= 100 ? 'var(--status-success)' : stats.todayGoalPercent >= 60 ? 'var(--status-warning)' : 'var(--accent)' }" />
      </div>
    </div>

    <span class="opacity-30">·</span>

    <span>连续 <b class="tabular-nums" :class="stats.streakDays >= 7 ? 'text-amber-400' : ''">{{ stats.streakDays }}</b> 天</span>

    <span class="opacity-30">·</span>

    <button class="hover:opacity-80 transition-opacity flex items-center gap-1" @click="stats.toggleSession()">
      <span>{{ stats.session.isRunning ? '⏱' : '▶' }}</span>
      <span class="font-mono tabular-nums" :class="stats.session.isRunning ? 'text-purple-400' : ''">{{ stats.sessionFormatted }}</span>
    </button>

    <div class="flex-1" />

    <span class="opacity-50 tabular-nums">总计 {{ stats.totalWordsAllTime.toLocaleString() }} 字</span>
  </div>
</template>

<script setup lang="ts">
import { useStatsStore } from "../stores/stats";
import { useSettingsStore } from "../stores/settings";
const stats = useStatsStore();
const s = useSettingsStore();
const tx = (d: string, l: string) => s.themeDark ? d : l;
</script>
