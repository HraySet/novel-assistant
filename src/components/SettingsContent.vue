<template>
  <div class="h-full overflow-y-auto">
    <div class="sticky top-0 z-10 px-6 py-4 border-b backdrop-blur-sm"
      :class="tx('bg-slate-950/90 border-white/[0.08]', 'bg-white/90 border-black/[0.08]')">
      <h2 class="text-lg font-bold" :class="tx('text-gray-100', 'text-gray-800')">设置</h2>
    </div>

    <div class="p-6 max-w-2xl space-y-8">
      <!-- === Workspace === -->
      <section v-if="section === 'general'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.accentColor + '15', color: store.accentColor }">
              <n-icon size="18"><FolderOutline /></n-icon>
            </div>
            <h3 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">工作区</h3>
          </div>
          <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs ml-[52px]">管理小说数据存储位置</p>
        </div>
        <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4 space-y-4">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium">当前工作区</span>
              <span v-if="booksStore.workspaceStatus.initialized" class="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">已连接</span>
              <span v-else class="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">未设置</span>
            </div>
            <div v-if="!booksStore.workspaceStatus.initialized" class="mb-3">
              <div class="flex flex-col items-center py-6 gap-3 rounded-lg" :class="tx('bg-white/[0.02]', 'bg-black/[0.02]')">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" :class="tx('bg-white/5', 'bg-black/5')">📁</div>
                <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs">选择一个目录作为小说数据的工作区</p>
              </div>
            </div>
            <div class="flex gap-2">
              <n-input :value="booksStore.workspaceStatus.path" placeholder="选择工作区目录..." class="flex-1" readonly />
              <n-button @click="form.pickFolder" type="primary" ghost>浏览</n-button>
            </div>
          </div>
          <div v-if="booksStore.books.length > 0">
            <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-2">作品列表</span>
            <div class="space-y-1">
              <div v-for="book in booksStore.books" :key="book.id"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border"
                :class="book.id === booksStore.currentBookId ? '' : 'border-transparent'"
                :style="book.id === booksStore.currentBookId ? { backgroundColor: store.accentColor + '15', borderColor: store.accentColor + '30' } : {}">
                <span class="text-sm truncate flex-1" :style="{ color: 'var(--text-primary)' }">{{ book.title }}</span>
                <span v-if="book.id === booksStore.currentBookId" class="text-[10px]" :style="{ color: store.accentColor }">当前</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- === Writing === -->
      <section v-if="section === 'writing'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.accentColor + '15', color: store.accentColor }">
              <n-icon size="18"><CreateOutline /></n-icon>
            </div>
            <h3 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">写作</h3>
          </div>
          <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs ml-[52px]">每日字数目标与编辑器偏好</p>
        </div>
        <div class="space-y-4">
          <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4">
            <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-3">每日目标字数</span>
            <div class="flex gap-2 flex-wrap mb-3 items-center">
              <SegmentedGroup
                :options="[2000, 3000, 4000, 6000, 10000].map(n => ({ value: n, label: n.toLocaleString() }))"
                :model-value="form.wordTargetPreset.value"
                size="md"
                @update:model-value="form.setWordTarget($event as number)"
              />
              <n-input v-model:value="form.customTarget.value" size="small" placeholder="自定义" class="w-24"
                @keyup.enter="form.setCustomTarget" @blur="form.setCustomTarget" />
            </div>
          </div>
          <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4">
            <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-3">编辑器字号</span>
            <SegmentedGroup
              :options="fontSizeOpts.map(s => ({ value: s, label: s }))"
              :model-value="form.fontSize.value"
              size="md"
              @update:model-value="form.setFontSize($event as string)"
            />
          </div>
          <!-- Layout mode -->
          <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4">
            <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-3">布局模式</span>
            <div class="grid grid-cols-3 gap-2">
              <button v-for="m in layoutModes" :key="m.key"
                class="py-3 rounded-xl border text-center transition-all"
                :class="store.layoutMode === m.key ? '' : tx('border-white/[0.06] bg-white/[0.02] text-gray-500 hover:border-white/[0.12]', 'border-black/[0.06] bg-black/[0.01] text-gray-400 hover:border-black/[0.12]')"
                :style="store.layoutMode === m.key ? { borderColor: store.accentColor + '80', backgroundColor: store.accentColor + '15', color: store.accentColor, boxShadow: '0 0 0 3px ' + store.accentColor + '25' } : {}"
                @click="store.setLayoutMode(m.key)">
                <div class="text-lg mb-1">{{ m.icon }}</div>
                <div class="text-xs font-medium">{{ m.label }}</div>
                <div class="text-[10px] opacity-60 mt-0.5">{{ m.desc }}</div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- === Theme === -->
      <section v-if="section === 'theme'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.accentColor + '15', color: store.accentColor }">
              <n-icon size="18"><ColorPaletteOutline /></n-icon>
            </div>
            <h3 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">主题</h3>
          </div>
          <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs ml-[52px]">自定义界面配色方案</p>
        </div>
        <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" :style="{ background: store.accentColor + '20', color: store.accentColor }">
              <n-icon size="18"><component :is="store.themeDark ? MoonOutline : SunnyOutline" /></n-icon>
            </div>
            <div class="flex-1"><span :style="{ color: 'var(--text-primary)' }" class="text-sm font-medium">当前主题</span></div>
            <div class="w-6 h-6 rounded-full border-2" :class="tx('border-white/20', 'border-black/20')" :style="{ background: store.accentColor }" />
          </div>
        </div>
        <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-3">深色主题</span>
        <div class="grid grid-cols-2 gap-2 mb-6">
          <button v-for="p in darkPresets" :key="p.name" class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
            :class="store.accentColor === p.value && store.themeDark ? '' : tx('border-white/[0.06] bg-white/[0.02]', 'border-black/[0.06] bg-black/[0.01]')"
            :style="store.accentColor === p.value && store.themeDark ? { borderColor: store.accentColor + '80', backgroundColor: store.accentColor + '15' } : {}"
            @click="store.applyColorPreset(p)">
            <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold" :style="{ background: p.value + '20', color: p.value }">Aa</div>
            <div class="text-left flex-1 min-w-0"><div :class="tx('text-gray-200', 'text-gray-700')" class="text-xs font-medium">{{ p.name }}</div></div>
            <div v-if="store.accentColor === p.value && store.themeDark" class="text-xs" :style="{ color: store.accentColor }">✓</div>
          </button>
        </div>
        <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-3 mt-6">浅色主题</span>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="p in lightPresets" :key="p.name" class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
            :class="store.accentColor === p.value && !store.themeDark ? '' : tx('border-white/[0.06] bg-white/[0.02]', 'border-black/[0.06] bg-black/[0.01]')"
            :style="store.accentColor === p.value && !store.themeDark ? { borderColor: store.accentColor + '80', backgroundColor: store.accentColor + '15' } : {}"
            @click="store.applyColorPreset(p)">
            <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold" :style="{ background: p.value + '20', color: p.value }">Aa</div>
            <div class="text-left flex-1 min-w-0"><div :class="tx('text-gray-200', 'text-gray-700')" class="text-xs font-medium">{{ p.name }}</div></div>
            <div v-if="store.accentColor === p.value && !store.themeDark" class="text-xs" :style="{ color: store.accentColor }">✓</div>
          </button>
        </div>
      </section>

      <!-- === AI === -->
      <section v-if="section === 'ai'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.accentColor + '15', color: store.accentColor }">
              <n-icon size="18"><HardwareChipOutline /></n-icon>
            </div>
            <h3 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">AI 接口</h3>
          </div>
          <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs ml-[52px]">配置大模型连接参数</p>
        </div>

        <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-5 space-y-4">
          <!-- 状态行 -->
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.aiApiKey ? 'color-mix(in srgb, var(--status-success) 10%, transparent)' : 'color-mix(in srgb, var(--status-warning) 10%, transparent)' }">
              <n-icon size="18" :style="{ color: store.aiApiKey ? 'var(--status-success)' : 'var(--status-warning)' }">
                <CheckmarkCircleOutline v-if="store.aiApiKey" />
                <AlertCircleOutline v-else />
              </n-icon>
            </div>
            <div class="flex-1">
              <span class="text-sm font-medium" :style="{ color: store.aiApiKey ? 'var(--status-success)' : 'var(--status-warning)' }">
                {{ store.aiApiKey ? '已配置' : '未配置' }}
              </span>
              <div :style="{ color: 'var(--text-tertiary)' }" class="text-xs">
                {{ store.aiApiKey ? `${store.aiProvider} · ${store.aiModel}` : '需要配置 API Key' }}
              </div>
            </div>
          </div>

          <!-- 分割线 -->
          <div :style="{ borderColor: 'var(--border-hairline)' }" class="border-t" />

          <!-- 服务商选择 -->
          <div>
            <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-2">服务商</span>
            <SegmentedGroup
              :options="aiProviders.map(p => ({ value: p.key, label: p.label }))"
              :model-value="store.aiProvider"
              size="md"
              @update:model-value="store.applyPreset($event as 'openai' | 'claude' | 'deepseek')"
            />
          </div>

          <!-- 接口地址 + Key -->
          <div class="grid grid-cols-1 gap-3">
            <div>
              <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-1.5">接口地址</span>
              <n-input v-model:value="store.aiEndpoint" size="small" />
            </div>
            <div>
              <span :style="{ color: 'var(--text-secondary)' }" class="text-xs font-medium block mb-1.5">API Key</span>
              <n-input v-model:value="store.aiApiKey" type="password" show-password-on="click" size="small" placeholder="sk-..." />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <n-button @click="form.testConnection" :loading="form.testing.value" size="small" secondary>测试连接</n-button>
            <n-button @click="form.fetchModels" :loading="form.fetching.value" size="small" secondary :disabled="!store.aiEndpoint">获取模型</n-button>
          </div>
          <div v-if="form.testResult.value" class="text-xs flex items-center gap-1"
            :style="{ color: form.testOk.value ? '#22c55e' : '#ef4444' }">
            <span>{{ form.testOk.value ? '✓' : '✗' }}</span><span>{{ form.testResult.value }}</span>
          </div>
        </div>
      </section>

      <!-- === About === -->
      <section v-if="section === 'about'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              :style="{ backgroundColor: store.accentColor + '15', color: store.accentColor }">
              <n-icon size="18"><InformationCircleOutline /></n-icon>
            </div>
            <h3 class="text-base font-semibold" :style="{ color: 'var(--text-primary)' }">关于</h3>
          </div>
          <p :style="{ color: 'var(--text-tertiary)' }" class="text-xs ml-[52px]">版本与技术信息</p>
        </div>
        <div :style="{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--border-hairline)' }" class="rounded-xl border p-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" :style="{ backgroundColor: store.accentColor + '15' }">📖</div>
            <div><div :style="{ color: 'var(--text-primary)' }" class="text-sm font-medium">Novel Assistant</div><div :class="tx('text-gray-500', 'text-gray-400')" class="text-xs">v0.2.0 · Tauri 2 · Vue 3</div></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NInput, NButton, NIcon } from "naive-ui";
import {
  FolderOutline,
  CreateOutline,
  ColorPaletteOutline,
  HardwareChipOutline,
  CheckmarkCircleOutline,
  AlertCircleOutline,
  InformationCircleOutline,
  MoonOutline,
  SunnyOutline,
} from "@vicons/ionicons5";
import { useSettingsStore } from "../stores/settings";
import { useBooksStore } from "../stores/books";
import { useSettingsForm } from "../composables/useSettingsForm";
import SegmentedGroup from "./SegmentedGroup.vue";

defineProps<{ section: string }>();
const store = useSettingsStore();
const booksStore = useBooksStore();
const form = useSettingsForm();
const tx = (d: string, l: string) => store.themeDark ? d : l;
const darkPresets = store.colorPresets.filter(p => p.dark);
const lightPresets = store.colorPresets.filter(p => !p.dark);
const fontSizeOpts = ["小", "中", "大"];
const aiProviders = [
  { key: "openai" as const, label: "OpenAI" },
  { key: "claude" as const, label: "Claude" },
  { key: "deepseek" as const, label: "DeepSeek" },
];
const layoutModes = [
  { key: "compact" as const, label: "紧凑", icon: "📝", desc: "图标栏+编辑器" },
  { key: "classic" as const, label: "经典", icon: "📋", desc: "三栏全展开" },
  { key: "focus" as const, label: "专注", icon: "🔍", desc: "纯编辑器" },
];
</script>
