<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 space-y-8">
      <!-- ========== 写作 ========== -->
      <section v-if="section === 'writing'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-accent-bg text-accent">
              <PenLine :size="18" />
            </div>
            <h3 class="text-base font-semibold text-text-primary">写作</h3>
          </div>
          <p class="text-xs text-text-muted ml-13">每日字数目标与编辑器偏好</p>
        </div>
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
            <span class="text-xs font-medium text-text-secondary block mb-3">编辑器字号</span>
            <SegmentedGroup
              :options="fontSizeOpts.map(s => ({ value: s, label: s }))"
              :model-value="form.fontSize.value"
              size="md"
              @update:model-value="form.setFontSize($event as string)"
            />
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
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-accent-bg text-accent">
              <Palette :size="18" />
            </div>
            <h3 class="text-base font-semibold text-text-primary">主题</h3>
          </div>
          <p class="text-xs text-text-muted ml-13">自定义界面配色方案</p>
        </div>

        <SurfaceCard class="p-4 mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style="background: color-mix(in srgb, var(--color-accent) 20%, transparent); color: var(--color-accent)">
              <Sun v-if="!store.themeDark" :size="18" />
              <Moon v-else :size="18" />
            </div>
            <div class="flex-1"><span class="text-sm font-medium text-text-primary">当前主题</span></div>
            <div class="w-6 h-6 rounded-full border-2 border-border" :style="{ background: store.accentColor }" />
          </div>
        </SurfaceCard>

        <span class="text-xs font-medium text-text-secondary block mb-3">深色主题</span>
        <div class="grid grid-cols-2 gap-2 mb-6">
          <button v-for="p in darkPresets" :key="p.name"
            class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
            :class="store.accentColor === p.value && store.themeDark ? 'border-accent-border bg-accent-bg' : 'border-border hover:border-border-strong'"
            @click="store.applyColorPreset(p)">
            <div class="w-8 h-8 rounded-sm shrink-0 flex items-center justify-center text-xs font-bold"
              :style="{ background: p.value + '20', color: p.value }">Aa</div>
            <div class="text-left flex-1 min-w-0"><div class="text-xs font-medium text-text-primary">{{ p.name }}</div></div>
            <div v-if="store.accentColor === p.value && store.themeDark" class="text-xs text-accent">✓</div>
          </button>
        </div>

        <span class="text-xs font-medium text-text-secondary block mb-3 mt-6">浅色主题</span>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="p in lightPresets" :key="p.name"
            class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
            :class="store.accentColor === p.value && !store.themeDark ? 'border-accent-border bg-accent-bg' : 'border-border hover:border-border-strong'"
            @click="store.applyColorPreset(p)">
            <div class="w-8 h-8 rounded-sm shrink-0 flex items-center justify-center text-xs font-bold"
              :style="{ background: p.value + '20', color: p.value }">Aa</div>
            <div class="text-left flex-1 min-w-0"><div class="text-xs font-medium text-text-primary">{{ p.name }}</div></div>
            <div v-if="store.accentColor === p.value && !store.themeDark" class="text-xs text-accent">✓</div>
          </button>
        </div>
      </section>

      <!-- ========== AI 接口 ========== -->
      <section v-if="section === 'ai'">
        <div class="mb-5">
          <div class="flex items-center gap-3 mb-1.5">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-accent-bg text-accent">
              <Cpu :size="18" />
            </div>
            <h3 class="text-base font-semibold text-text-primary">AI 接口</h3>
          </div>
          <p class="text-xs text-text-muted ml-13">配置大模型连接参数</p>
        </div>

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
              <span>{{ form.testOk.value ? '✓' : '✗' }}</span><span>{{ form.testResult.value }}</span>
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
                class="px-3 py-1.5 rounded-lg border text-xs transition-all"
                :class="store.aiModel === m ? '' : 'border-border text-text-secondary hover:border-border-strong'"
                :style="store.aiModel === m ? { background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', borderColor: 'var(--color-accent)' } : {}"
                @click="store.aiModel = m">
                {{ m }}
              </button>
            </div>
            <div v-else class="text-xs text-text-muted">
              {{ store.aiApiKey ? '点击"获取模型列表"加载可用模型' : '请先配置 API Key' }}
            </div>
          </SurfaceCard>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { PenLine, Palette, Sun, Moon, Cpu, CircleCheck, AlertCircle } from "lucide-vue-next";
import { useSettingsStore } from "../stores/settings";
import { useSettingsForm } from "../composables/useSettingsForm";
import { useFileStore } from "../stores/file";
import type { FileNode } from "../types/file";
import SurfaceCard from "./SurfaceCard.vue";
import SegmentedGroup from "./SegmentedGroup.vue";

defineProps<{ section: string }>();
const store = useSettingsStore();
const form = useSettingsForm();
const fileStore = useFileStore();

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
const fontSizeOpts = ["小", "中", "大"];
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
  { key: 'Esc', label: '关闭弹窗' },
];
</script>

<style scoped>
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
</style>
