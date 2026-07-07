<template>
  <div class="flex items-center gap-4 px-4 py-1.5 shrink-0 text-xs"
    :style="{ color: 'var(--text-tertiary)' }">
    <div class="flex items-center gap-2">
      <span>今日</span>
      <span class="font-semibold tabular-nums"
        :style="{ color: stats.todayGoalMet ? 'var(--status-success)' : 'var(--text-primary)' }">
        {{ stats.todayWords.toLocaleString() }}
      </span>
      <span class="tabular-nums">/ {{ stats.dailyGoal.toLocaleString() }}</span>
      <div class="w-10 h-1 rounded-full overflow-hidden" :style="{ background: 'var(--border-soft)' }">
        <div class="h-full rounded-full transition-all duration-500"
          :style="{ width: stats.todayGoalPercent + '%', backgroundColor: stats.todayGoalPercent >= 100 ? 'var(--status-success)' : stats.todayGoalPercent >= 60 ? 'var(--status-warning)' : 'var(--accent)' }" />
      </div>
    </div>

    <span class="opacity-30">·</span>

    <span>连续 <b class="tabular-nums" :class="stats.streakDays >= 7 ? 'text-amber-400' : ''">{{ stats.streakDays }}</b> 天</span>

    <span class="opacity-30">·</span>

    <button class="hover:opacity-80 transition-opacity flex items-center gap-1" :style="{ color: 'var(--text-tertiary)' }" @click="stats.toggleSession()">
      <span>{{ stats.session.isRunning ? '⏱' : '▶' }}</span>
      <span class="font-mono tabular-nums" :style="{ color: stats.session.isRunning ? 'var(--accent)' : 'var(--text-tertiary)' }">{{ stats.sessionFormatted }}</span>
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
</script>
