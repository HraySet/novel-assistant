import { defineStore, acceptHMRUpdate } from 'pinia'
import { computed, ref } from 'vue'
import { readJson, writeJson } from '../core/storage'
import {
  describeDailyUsage,
  emptyDaily,
  mergeDailyUsage,
  todayKey,
  type AiUsage,
  type DailyUsage,
} from '../core/usage'

/**
 * AI 用量账本（只记当天，参考「小肥鱼」插件的粒度：看一眼今天用了多少）。
 *
 * - 持久化在 localStorage：同一天内重启应用不丢；跨天自动从零开始
 * - 记录时机：每次 streamChat 正常返回（含用户中止）后由调用方调用 record()
 * - 服务商没返回 usage 时照记次数、不编造 token（UI 会如实标注）
 */
const STORAGE_KEY = 'ai-usage-daily'

export const useUsageStore = defineStore('usage', () => {
  const stored = readJson<DailyUsage | null>(STORAGE_KEY, null)
  const daily = ref<DailyUsage>(
    stored && stored.date === todayKey() ? stored : emptyDaily(todayKey()),
  )

  /** 并入一次调用。放在 streamChat 返回之后调用；请求抛错（没消耗）时不要调用 */
  function record(usage: AiUsage | null) {
    daily.value = mergeDailyUsage(daily.value, usage, todayKey())
    writeJson(STORAGE_KEY, daily.value)
  }

  const summary = computed(() => describeDailyUsage(daily.value))

  return { daily, record, summary }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUsageStore, import.meta.hot))
}
