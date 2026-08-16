<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 space-y-8">
      <!-- ========== 写作 ========== -->
      <section v-if="section === 'writing'">
        <SectionHeader :icon="PenLine" title="写作" desc="每日字数目标与编辑器偏好" />
        <div class="space-y-3">
          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">每日目标字数</span>
            <div class="flex gap-2 flex-wrap items-center">
              <SegmentedGroup
                :options="[2000, 3000, 4000, 6000, 10000].map(n => ({ value: n, label: n.toLocaleString() }))"
                :model-value="form.wordTargetPreset.value"
                size="md"
                @update:model-value="form.setWordTarget($event as number)"
              />
              <input v-model="form.customTarget.value" placeholder="自定义" class="setting-input w-24"
                @keyup.enter="form.setCustomTarget" @blur="form.setCustomTarget" />
            </div>
          </SurfaceCard>

          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">全书总字数</span>
            <div class="text-2xl font-semibold text-text-primary" style="font-variant-numeric: tabular-nums;">
              {{ totalWords.toLocaleString() }}
            </div>
            <div class="text-xs text-text-muted mt-1">所有章节字数总和</div>
          </SurfaceCard>

          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">写作分析</span>
            <div class="flex gap-8 mb-4">
              <div>
                <div class="text-xl font-semibold text-text-primary" style="font-variant-numeric: tabular-nums;">{{ todaySpeed.toLocaleString() }}</div>
                <div class="text-xs text-text-muted mt-1">今日速度（字/小时）</div>
              </div>
              <div>
                <div class="text-xl font-semibold text-text-primary" style="font-variant-numeric: tabular-nums;">{{ avgDaily.toLocaleString() }}</div>
                <div class="text-xs text-text-muted mt-1">日均字数</div>
              </div>
              <div>
                <div class="text-xl font-semibold text-text-primary" style="font-variant-numeric: tabular-nums;">{{ activeDays }}</div>
                <div class="text-xs text-text-muted mt-1">累计写作天数</div>
              </div>
            </div>
            <span class="text-xs font-medium text-text-secondary block mb-2">近 7 天</span>
            <div class="flex items-end gap-2 h-24">
              <div
                v-for="d in last7"
                :key="d.date"
                class="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                :title="`${d.label}：${d.count.toLocaleString()} 字`"
              >
                <span class="text-[9px] text-text-muted leading-none">{{ d.count > 0 ? d.count : '' }}</span>
                <div
                  class="w-full rounded-sm stat-bar"
                  :style="{ height: barHeight(d.count), background: d.count > 0 ? 'var(--color-accent)' : 'var(--color-bg-surface-hover)' }"
                />
                <span class="text-[9px] text-text-muted leading-none">{{ d.label }}</span>
              </div>
            </div>
          </SurfaceCard>

          <!-- 码字日历（近 12 周热力图） -->
          <WritingCalendar />

          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">编辑器排版</span>
            <div class="flex items-center gap-3 mb-3">
              <span class="text-xs text-text-secondary w-8 shrink-0">字号</span>
              <input
                type="range"
                min="14"
                max="24"
                step="1"
                class="setting-slider flex-1"
                :value="store.editorFontSize"
                @input="store.setEditorFontSize(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="text-xs text-text-secondary w-12 text-right shrink-0" style="font-variant-numeric: tabular-nums">{{ store.editorFontSize }}px</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-text-secondary w-8 shrink-0">行距</span>
              <input
                type="range"
                min="1.5"
                max="2.2"
                step="0.1"
                class="setting-slider flex-1"
                :value="store.editorLineHeight"
                @input="store.setEditorLineHeight(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="text-xs text-text-secondary w-12 text-right shrink-0" style="font-variant-numeric: tabular-nums">{{ store.editorLineHeight.toFixed(1) }}</span>
            </div>
            <p class="text-[10px] text-text-muted mt-2">即时预览生效，可在编辑器中查看效果</p>
          </SurfaceCard>

          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">编辑器选项</span>
            <div class="space-y-3">
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" :checked="store.typewriterMode" @change="store.toggleTypewriter()" class="toggle" />
                <div>
                  <div class="text-sm text-text-primary">打字机模式</div>
                  <div class="text-xs text-text-muted">光标始终居中</div>
                </div>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" :checked="store.focusLineMode" @change="store.toggleFocusLine()" class="toggle" />
                <div>
                  <div class="text-sm text-text-primary">聚焦行</div>
                  <div class="text-xs text-text-muted">高亮当前行，其余变暗</div>
                </div>
              </label>
              <div class="pt-3 mt-1" style="border-top: 1px solid var(--color-border)">
                <span class="text-xs font-medium text-text-secondary block mb-2">正文宽度</span>
                <SegmentedGroup
                  :options="widthOpts.map(w => ({ value: w, label: w }))"
                  :model-value="store.editorWidth"
                  size="md"
                  @update:model-value="store.setEditorWidth($event as string)"
                />
              </div>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <!-- ========== 快捷键 ========== -->
      <section v-if="section === 'writing'">
        <SurfaceCard class="p-4">
          <span class="text-xs font-medium text-text-secondary block mb-3">快捷键</span>
          <div class="grid grid-cols-2 gap-2">
            <div v-for="k in shortcuts" :key="k.key" class="flex items-center justify-between text-xs">
              <span class="text-text-secondary">{{ k.label }}</span>
              <code class="kbd">{{ k.key }}</code>
            </div>
          </div>
        </SurfaceCard>
      </section>

      <!-- ========== 主题 ========== -->
      <section v-if="section === 'theme'">
        <SectionHeader :icon="Palette" title="主题" desc="自定义界面配色方案" />

        <!-- 当前主题预览 -->
        <SurfaceCard class="p-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="flex-1"><span class="text-sm font-medium text-text-primary">当前主题</span></div>
            <div class="flex items-center gap-2">
              <span class="current-swatch" :style="{ background: store.bgColor, borderColor: store.themeDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)' }">
                <span class="current-swatch-text" :style="{ color: store.themeText?.primary ?? (store.themeDark ? '#e4e4e7' : '#3f3f46') }">Aa 正文</span>
                <span class="current-swatch-accent" :style="{ background: store.accentColor }" />
              </span>
              <span class="text-xs text-text-secondary">{{ store.themeDark ? '深色' : '浅色' }}</span>
            </div>
          </div>
        </SurfaceCard>

        <span class="text-xs font-medium text-text-secondary block mb-3">深色主题</span>
        <div class="grid grid-cols-3 gap-2 mb-6">
          <button
            v-for="p in darkPresets"
            :key="p.name"
            class="preset-card"
            :class="{ 'preset-card--active': store.accentColor === p.value && store.themeDark }"
            :style="{ background: p.bg }"
            @click="store.applyColorPreset(p)"
          >
            <span class="preset-text" :style="{ color: p.text.primary }">Aa 正文</span>
            <span class="preset-accent" :style="{ background: p.value }" />
            <span class="preset-name" :style="{ color: p.text.secondary }">{{ p.name }}</span>
            <span v-if="store.accentColor === p.value && store.themeDark" class="preset-check" :style="{ background: p.value }">✓</span>
          </button>
        </div>

        <span class="text-xs font-medium text-text-secondary block mb-3 mt-6">浅色主题</span>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="p in lightPresets"
            :key="p.name"
            class="preset-card"
            :class="{ 'preset-card--active': store.accentColor === p.value && !store.themeDark }"
            :style="{ background: p.bg }"
            @click="store.applyColorPreset(p)"
          >
            <span class="preset-text" :style="{ color: p.text.primary }">Aa 正文</span>
            <span class="preset-accent" :style="{ background: p.value }" />
            <span class="preset-name" :style="{ color: p.text.secondary }">{{ p.name }}</span>
            <span v-if="store.accentColor === p.value && !store.themeDark" class="preset-check" :style="{ background: p.value }">✓</span>
          </button>
        </div>
      </section>

      <!-- ========== AI 接口 ========== -->
      <section v-if="section === 'ai'">
        <SectionHeader :icon="Cpu" title="AI 接口" desc="配置大模型连接参数" />

        <div class="space-y-3">
          <!-- 状态 -->
          <SurfaceCard class="p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center"
                :class="store.aiApiKey ? 'bg-success-bg' : 'bg-warning-bg'">
                <CircleCheck v-if="store.aiApiKey" :size="18" class="text-success" />
                <AlertCircle v-else :size="18" class="text-warning" />
              </div>
              <div class="flex-1">
                <span class="text-sm font-medium" :class="store.aiApiKey ? 'text-success' : 'text-warning'">
                  {{ store.aiApiKey ? '已配置' : '未配置 API Key' }}
                </span>
                <div class="text-xs text-text-muted" v-if="store.aiApiKey">
                  {{ store.aiProvider }} · {{ store.aiModel }}
                </div>
              </div>
              <button class="btn-sm" @click="form.testConnection" :disabled="form.testing.value">
                {{ form.testing.value ? '测试中…' : '测试' }}
              </button>
            </div>
            <div v-if="form.testResult.value" class="mt-3 text-xs flex items-center gap-1" :class="form.testOk.value ? 'text-success' : 'text-danger'">
              <CircleCheck v-if="form.testOk.value" :size="13" />
              <XCircle v-else :size="13" />
              <span>{{ form.testResult.value }}</span>
            </div>
          </SurfaceCard>

          <!-- 服务商 -->
          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-3">服务商</span>
            <SegmentedGroup
              :options="aiProviders.map(p => ({ value: p.key, label: p.label }))"
              :model-value="store.aiProvider"
              size="md"
              @update:model-value="store.applyPreset($event as 'openai' | 'claude' | 'deepseek')"
            />
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div>
                <span class="text-xs font-medium text-text-secondary block mb-1.5">接口地址</span>
                <input v-model="store.aiEndpoint" class="setting-input w-full" />
              </div>
              <div>
                <span class="text-xs font-medium text-text-secondary block mb-1.5">API Key</span>
                <input v-model="store.aiApiKey" type="password" class="setting-input w-full" placeholder="sk-..." />
              </div>
            </div>
          </SurfaceCard>

          <!-- 模型选择 -->
          <SurfaceCard class="p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-medium text-text-secondary">模型</span>
              <button class="btn-sm" @click="form.fetchModels" :disabled="!store.aiEndpoint || form.fetching.value">
                {{ form.fetching.value ? '获取中…' : '获取模型列表' }}
              </button>
            </div>
            <div v-if="form.modelList.value.length" class="flex flex-wrap gap-2">
              <button v-for="m in form.modelList.value" :key="m"
                class="model-pill"
                :class="{ 'model-pill--active': store.aiModel === m }"
                @click="store.aiModel = m">
                {{ m }}
              </button>
            </div>
            <div v-else class="text-xs text-text-muted">
              {{ store.aiApiKey ? '点击"获取模型列表"加载可用模型' : '请先配置 API Key' }}
            </div>
          </SurfaceCard>

          <!-- 采样温度 -->
          <SurfaceCard class="p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-medium text-text-secondary">采样温度（随机性）</span>
              <span class="text-xs text-text-secondary" style="font-variant-numeric: tabular-nums">{{ store.aiTemperature.toFixed(1) }}</span>
            </div>
            <input
              type="range" min="0" max="2" step="0.1" class="setting-slider w-full"
              :value="store.aiTemperature"
              @input="store.aiTemperature = Number(($event.target as HTMLInputElement).value)"
            />
            <p class="text-[10px] text-text-muted mt-1.5">0 = 严谨稳定，2 = 天马行空；创意写作建议 0.7-1.2</p>
          </SurfaceCard>

          <!-- 快捷操作提示词（按 label 覆盖内置值） -->
          <SurfaceCard class="p-4">
            <span class="text-xs font-medium text-text-secondary block mb-2">快捷操作提示词（留空则用内置默认）</span>
            <div class="space-y-2">
              <details v-for="a in quickActions" :key="a.label" class="prompt-item">
                <summary class="prompt-summary">
                  <span>{{ a.label }}</span>
                  <span v-if="store.aiQuickPrompts[a.label]" class="inline-flex" title="已自定义"><StatusDot level="mid" size="sm" :glow="false" /></span>
                  <span class="text-[10px] text-text-muted truncate flex-1">{{ store.aiQuickPrompts[a.label] || a.hint }}</span>
                </summary>
                <textarea
                  class="setting-input w-full mt-2 prompt-textarea"
                  rows="4"
                  :value="store.aiQuickPrompts[a.label] ?? ''"
                  :placeholder="a.prompt"
                  @change="onPromptChange(a.label, $event)"
                />
                <button v-if="store.aiQuickPrompts[a.label]" class="btn-sm mt-1" @click="store.resetAiQuickPrompt(a.label)">
                  恢复默认
                </button>
              </details>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { PenLine, Palette, Cpu, CircleCheck, AlertCircle, XCircle } from "lucide-vue-next";
import { useSettingsStore } from "../stores/settings";
import { useSettingsForm } from "../composables/useSettingsForm";
import { useFileStore } from "../stores/file";
import { useStatsStore } from "../stores/stats";
import type { FileNode } from "../types/file";
import SurfaceCard from "./SurfaceCard.vue";
import StatusDot from "./StatusDot.vue";
import SectionHeader from "./SectionHeader.vue";
import SegmentedGroup from "./SegmentedGroup.vue";
import WritingCalendar from "./WritingCalendar.vue";
import { QUICK_ACTIONS } from "../composables/aiQuickActions";

defineProps<{ section: string }>();
const store = useSettingsStore();
const form = useSettingsForm();
const fileStore = useFileStore();
const stats = useStatsStore();

// 全书总字数：遍历文件树求和（不含目录）
const totalWords = computed(() => {
  let sum = 0;
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) walk(n.children);
      } else {
        sum += n.wordCount ?? 0;
      }
    }
  };
  walk(fileStore.tree);
  return sum;
});
const darkPresets = computed(() => store.colorPresets.filter(p => p.dark));
const lightPresets = computed(() => store.colorPresets.filter(p => !p.dark));
const widthOpts = ["窄", "中", "宽"];

// 快捷操作提示词编辑（覆盖内置默认）
const quickActions = QUICK_ACTIONS;
function onPromptChange(label: string, e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  if (value.trim()) {
    store.setAiQuickPrompt(label, value)
  } else {
    store.resetAiQuickPrompt(label)
  }
}

// ── 写作分析 ──
const todaySpeed = computed(() => {
  const hours = stats.todaySessionMs / 3600000
  if (hours <= 0 || stats.todayWords === 0) return 0
  return Math.round(stats.todayWords / hours)
})
const activeDays = computed(() => stats.dailyRecords.filter((r) => r.wordCount > 0).length)
const avgDaily = computed(() => {
  const rs = stats.dailyRecords.filter((r) => r.wordCount > 0)
  return rs.length ? Math.round(rs.reduce((s, r) => s + r.wordCount, 0) / rs.length) : 0
})
const last7 = computed(() => {
  const out: { date: string; label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const rec = stats.dailyRecords.find((r) => r.date === ds)
    out.push({ date: ds, label: `${d.getMonth() + 1}/${d.getDate()}`, count: rec?.wordCount ?? 0 })
  }
  return out
})
const last7Max = computed(() => Math.max(100, ...last7.value.map((d) => d.count)))
function barHeight(count: number): string {
  if (count <= 0) return '2px'
  return `${Math.max(8, Math.round((count / last7Max.value) * 64))}px`
}
const aiProviders = [
  { key: "openai" as const, label: "OpenAI" },
  { key: "claude" as const, label: "Claude" },
  { key: "deepseek" as const, label: "DeepSeek" },
];
const shortcuts = [
  { key: 'Ctrl+B', label: '切换文件树' },
  { key: 'Ctrl+J', label: '切换 AI 面板' },
  { key: 'Ctrl+P', label: '搜索文件' },
  { key: 'Ctrl+,', label: '打开设置' },
  { key: 'Ctrl+Shift+A', label: '全屏 AI 对话' },
  { key: 'Ctrl+Shift+F', label: '专注模式' },
  { key: 'Esc', label: '关闭弹窗' },
];
</script>

<style scoped>
/* ── 主题预设预览卡片 ── */
.preset-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease;
}

.preset-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-popover);
  border-color: rgba(127, 127, 127, 0.6);
}

.preset-card--active {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.preset-text { font-size: 12px; font-weight: 600; line-height: 1.4; }

.preset-accent {
  width: 26px;
  height: 4px;
  border-radius: 999px;
}

.preset-name { font-size: 11px; font-weight: 500; }

.preset-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--color-text-on-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* ── 当前主题预览 ── */
.current-swatch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
}

.current-swatch-accent {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.prompt-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.prompt-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
  background: var(--color-bg-page);
}

.prompt-summary:hover { background: var(--color-bg-surface-hover); }

.prompt-summary::-webkit-details-marker { display: none; }

.prompt-summary > span:first-child { font-weight: 600; flex-shrink: 0; }

/* 近 7 天柱状图：数据实时变化时柱子平滑生长而不是瞬移 */
.stat-bar { transition: height 0.3s ease; }
.prompt-textarea { display: block; resize: vertical; min-height: 84px; }
.setting-input {
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  padding: 6px 10px; font-size: 13px; font-family: inherit;
  background: var(--color-bg-page); color: var(--color-text-primary); outline: none;
}
.setting-input:focus { border-color: var(--color-accent-border); }
.setting-input::placeholder { color: var(--color-text-muted); }

.btn-sm {
  padding: 5px 12px; border-radius: var(--radius-sm);
  font-family: inherit; font-size: 12px;
  color: var(--color-text-secondary); background: transparent;
  border: 1px solid var(--color-border); cursor: pointer;
  white-space: nowrap;
}
.btn-sm:hover:not(:disabled) { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }
.btn-sm:disabled { opacity: 0.4; cursor: default; }

.toggle {
  width: 16px; height: 16px; accent-color: var(--color-accent); cursor: pointer; flex-shrink: 0;
}

.kbd {
  font-size: 10px; font-family: var(--font-mono);
  padding: 1px 5px; border-radius: 3px;
  background: var(--color-bg-surface); color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}
/* 模型选择 pill：与 SegmentedGroup 同一套单选视觉（class 驱动状态，hover/focus/active 齐备）；
   字号用 12px 是因为模型 ID 通常较长 */
.model-pill {
  padding: 4px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background-color: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.model-pill:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--color-text-primary);
  border-color: var(--color-border-strong);
}
.model-pill:active { filter: brightness(0.95); }
.model-pill:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}
.model-pill--active {
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
  border-color: var(--color-accent);
}
.model-pill--active:hover {
  background-color: var(--color-accent);
  color: var(--color-text-on-accent);
}
</style>
