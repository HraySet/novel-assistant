<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="dialog-overlay" @click.self="$emit('close')">
        <div class="consistency-panel">
          <!-- 头部 -->
          <div class="cp-header">
            <span class="cp-title flex items-center gap-1.5"><ShieldCheck :size="14" class="text-text-muted" /> 人物 / 大纲变化检测</span>
            <button class="cp-close" title="关闭 (Esc)" @click="$emit('close')">
              <X :size="14" />
            </button>
          </div>

          <!-- 标签页 -->
          <div class="cp-tabs">
            <button class="cp-tab" :class="{ active: activeTab === 'char' }" @click="activeTab = 'char'">
              人物
              <span v-if="pendingChars.length > 0" class="cp-tab-badge">{{ pendingChars.length }}</span>
            </button>
            <button class="cp-tab" :class="{ active: activeTab === 'outline' }" @click="activeTab = 'outline'">
              大纲
              <span v-if="pendingOutlines.length > 0" class="cp-tab-badge">{{ pendingOutlines.length }}</span>
            </button>
          </div>

          <!-- 人物 Tab -->
          <div v-if="activeTab === 'char'" class="cp-body">
            <div v-if="loading" class="cp-empty cp-loading"><RefreshCw :size="16" class="spinning" /> 加载中…</div>
            <div v-else-if="allCharacters.length === 0" class="cp-empty">
              暂无角色卡。可在角色面板创建，或在项目「角色/」目录下放置 .md 文件。
            </div>
            <template v-else>
              <div class="cp-char-grid">
                <button v-for="c in allCharacters" :key="c.name" class="cp-char-card"
                  :class="{ selected: selectedChar === c.name }" @click="selectedChar = c.name">
                  <span v-if="isPending(c.name)" class="cp-char-dot" title="有待确认的性格变化" />
                  <span class="cp-char-head">
                    <span class="cp-avatar">{{ c.name.slice(0, 1) }}</span>
                    <span class="cp-char-name">{{ c.name }}</span>
                  </span>
                  <span class="cp-char-tag">{{ tagOf(c.name) }}</span>
                </button>
              </div>
              <div class="cp-char-detail" :key="selectedChar ?? ''">
                <template v-if="selectedChange">
                  <p class="cp-detail-hint">
                    <Sparkles :size="13" class="cp-detail-icon" />
                    检测到「{{ selectedChange.name }}」在最新章节中的性格有变化
                  </p>
                  <div class="cp-diff-old">
                    <p>{{ selectedChange.oldTrait || '（未摘录旧设定）' }}</p>
                  </div>
                  <div class="cp-diff-new">
                    <p>{{ selectedChange.newTrait }}</p>
                  </div>
                  <div class="cp-detail-actions">
                    <button class="cp-btn cp-btn--primary" @click="acceptChar(selectedChange.name)">采纳更新</button>
                    <button class="cp-btn cp-btn--ghost" @click="rejectChar(selectedChange.name)">忽略</button>
                  </div>
                </template>
                <div v-else-if="selectedChar" class="cp-detail-empty">
                  暂无待更新内容，性格状态与最近章节一致。
                </div>
              </div>
            </template>
          </div>

          <!-- 大纲 Tab -->
          <div v-else class="cp-body">
            <div v-if="loading" class="cp-empty cp-loading"><RefreshCw :size="16" class="spinning" /> 加载中…</div>
            <div v-else-if="outlineItems.length === 0" class="cp-empty">
              暂无大纲文件。可在项目「大纲/」目录下创建。
            </div>
            <div v-else class="cp-outline-list">
              <div v-for="(o, i) in outlineItems" :key="o.title + i" class="cp-outline-item"
                :class="{ last: i === outlineItems.length - 1 }">
                <span class="cp-status-dot" :class="'cp-status--' + o.status" />
                <div class="cp-outline-main">
                  <p class="cp-outline-title">{{ o.title }}</p>
                  <template v-if="o.status === 'suggest'">
                    <div class="cp-outline-note">
                      <p>{{ o.note }}</p>
                      <div class="cp-detail-actions">
                        <button class="cp-btn cp-btn--primary" @click="acceptOutline(o.title)">采纳建议</button>
                        <button class="cp-btn cp-btn--ghost" @click="rejectOutline(o.title)">忽略</button>
                      </div>
                    </div>
                  </template>
                  <p v-else-if="o.status === 'done'" class="cp-outline-done">已更新</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 自动检测设置 -->
          <div class="cp-settings">
            <div class="cp-settings-row">
              <span class="cp-settings-label">自动检测角色与大纲变化</span>
              <label class="cp-toggle" :class="{ on: store.autoEnabled }">
                <input type="checkbox" :checked="store.autoEnabled"
                  @change="store.setAuto(($event.target as HTMLInputElement).checked)" />
                <span class="cp-toggle-knob" />
              </label>
            </div>
            <p class="cp-settings-hint">本地先判断，真正需要时才调用一次 AI，不逐句分析全文</p>

            <div class="cp-settings-block" :class="{ disabled: !store.autoEnabled }">
              <div class="cp-settings-row">
                <span class="cp-settings-sub">每新增多少字触发一次检测</span>
                <span class="cp-settings-val">{{ store.threshold }} 字</span>
              </div>
              <input type="range" min="300" max="2000" step="100" :value="store.threshold"
                :disabled="!store.autoEnabled"
                @input="store.setThreshold(Number(($event.target as HTMLInputElement).value))" class="cp-slider" />
              <div class="cp-slider-labels">
                <span>更省 token</span>
                <span>{{ progressText }}</span>
                <span>更及时</span>
              </div>
            </div>

            <div class="cp-settings-row cp-settings-foot">
              <div>
                <p class="cp-settings-sub cp-settings-sub--strong">立即检测</p>
                <p class="cp-settings-hint">不等阈值，现在就分析未检测的新内容</p>
              </div>
              <button class="cp-btn cp-btn--primary" :disabled="store.checking" @click="runNow">
                <RefreshCw :size="13" :class="{ spinning: store.checking }" />
                {{ store.checking ? '检测中…' : '检测一次' }}
              </button>
            </div>
            <p v-if="store.lastError" class="cp-error">检测失败：{{ store.lastError }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { X, Sparkles, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { useDetectionStore, type CharacterChange } from '../stores/detection'
import * as api from '../api/files'

const props = defineProps<{
  show: boolean
  projectRoot?: string
}>()
const emit = defineEmits<{ close: [] }>()

const store = useDetectionStore()
const { characterChanges, outlineSuggestions, checking } = storeToRefs(store)

const activeTab = ref<'char' | 'outline'>('char')
const loading = ref(false)
const selectedChar = ref<string | null>(null)

interface CharListItem { name: string; tag: string }
const allCharacters = ref<CharListItem[]>([])

interface OutlineItem {
  title: string
  status: 'suggest' | 'planned' | 'done'
  note: string
  newTitle: string
}
const outlineItems = ref<OutlineItem[]>([])

const pendingChars = computed(() => characterChanges.value.filter((c) => c.pending))
const pendingOutlines = computed(() => outlineSuggestions.value.filter((o) => o.status === 'suggest'))
const selectedChange = computed<CharacterChange | undefined>(() =>
  selectedChar.value ? characterChanges.value.find((c) => c.name === selectedChar.value && c.pending) : undefined,
)
const progressText = computed(() =>
  store.autoEnabled && store.wordsSinceCheck > 0 ? `已新增 ${store.wordsSinceCheck} 字` : ' ',
)

function isPending(name: string): boolean {
  return characterChanges.value.some((c) => c.name === name && c.pending)
}

function tagOf(name: string): string {
  const change = characterChanges.value.find((c) => c.name === name)
  if (change?.tag) return change.tag
  return allCharacters.value.find((c) => c.name === name)?.tag || ''
}

async function loadData() {
  const root = props.projectRoot
  if (!root) return
  loading.value = true
  try {
    const norm = root.replace(/\\/g, '/')

    // 人物：读 角色/ 目录，取性格行作为人设标签
    const chars: CharListItem[] = []
    try {
      const entries = await api.listDir(`${norm}/角色`)
      for (const e of entries.filter((x) => !x.isDir)) {
        const name = e.name.replace(/\.(md|txt)$/i, '')
        let tag = ''
        try {
          const content = await api.readFile(e.path)
          const m = content.match(/^\s*-\s*性格[：:]\s*(.+)$/m)
          if (m) tag = m[1].trim().slice(0, 16)
        } catch { /* ignore */ }
        chars.push({ name, tag })
      }
    } catch { /* 无角色目录 */ }
    allCharacters.value = chars

    // 大纲：读 大纲/ 目录，提取标题行
    const items: OutlineItem[] = []
    try {
      const entries = await api.listDir(`${norm}/大纲`)
      for (const e of entries.filter((x) => !x.isDir)) {
        try {
          const content = await api.readFile(e.path)
          for (const line of content.split('\n')) {
            const m = line.match(/^\s*#{1,2}\s+(.+?)\s*$/)
            if (!m || !m[1]) continue
            const title = m[1]
            const sug = outlineSuggestions.value.find((o) => o.title === title)
            items.push({
              title,
              status: sug ? sug.status : 'planned',
              note: sug?.note ?? '',
              newTitle: sug?.newTitle ?? '',
            })
          }
        } catch { /* ignore */ }
      }
    } catch { /* 无大纲目录 */ }
    outlineItems.value = items
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (v) => {
  if (v) {
    activeTab.value = pendingChars.value.length > 0 ? 'char' : 'outline'
    selectedChar.value = null
    void loadData()
  }
})

// 确认/忽略后刷新本地列表（红点消失、大纲状态变化）
watch([characterChanges, outlineSuggestions], () => {
  if (props.show) void loadData()
})

async function acceptChar(name: string) {
  await store.acceptCharacter(name)
  selectedChar.value = null
}

async function rejectChar(name: string) {
  store.rejectCharacter(name)
  selectedChar.value = null
}

async function acceptOutline(title: string) {
  await store.acceptOutline(title)
}

function rejectOutline(title: string) {
  store.rejectOutline(title)
}

function runNow() {
  if (store.checking) return
  void store.runCheck()
}
</script>

<style scoped>
.consistency-panel {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated, var(--color-bg-surface));
  border: 1px solid var(--color-border-strong, var(--color-border));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
  overflow: hidden;
}

.cp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.cp-title { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }
.cp-close {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; border-radius: var(--radius-sm);
  color: var(--color-text-muted);
}
.cp-close:hover { background: var(--color-bg-surface-hover); color: var(--color-text-primary); }

.cp-tabs { display: flex; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.cp-tab {
  flex: 1; padding: 9px 0; font-size: 13px; font-family: inherit; cursor: pointer;
  border: none; border-bottom: 2px solid transparent; background: none;
  color: var(--color-text-secondary);
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: color 0.12s ease, border-color 0.12s ease;
}
.cp-tab.active { color: var(--color-accent); border-bottom-color: var(--color-accent); }
.cp-tab-badge {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--color-accent); color: var(--color-text-on-accent); font-size: 10px;
  display: inline-flex; align-items: center; justify-content: center;
}

.cp-body { flex: 1; overflow-y: auto; padding: 14px; }
.cp-empty { padding: 24px 12px; text-align: center; font-size: 12px; color: var(--color-text-muted); }
.cp-loading { display: flex; align-items: center; justify-content: center; gap: 6px; }

.cp-char-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cp-char-card {
  position: relative; text-align: left; padding: 10px; cursor: pointer;
  display: flex; flex-direction: column; gap: 5px;
  background: var(--color-bg-page); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); font-family: inherit;
  transition: border-color 0.1s, background 0.1s;
}
.cp-char-card:hover { border-color: var(--color-accent-border); }
.cp-char-card.selected { border-color: var(--color-accent-border); background: var(--color-accent-bg); }
.cp-char-dot {
  position: absolute; top: 8px; right: 8px; width: 7px; height: 7px; border-radius: 50%;
  /* 待确认变化是中性提醒，用强调色而非危险色 */
  background: var(--color-accent);
}
.cp-char-head { display: flex; align-items: center; gap: 8px; }
.cp-avatar {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  background: var(--color-accent-bg); color: var(--color-accent);
  font-size: 11px; font-weight: 500;
  display: flex; align-items: center; justify-content: center;
}
.cp-char-name { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.cp-char-tag {
  font-size: 11px; color: var(--color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.cp-char-detail { margin-top: 12px; animation: fade-in 0.12s ease; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.cp-detail-hint { font-size: 11px; color: var(--color-text-muted); margin: 0 0 8px; display: flex; align-items: center; gap: 4px; }
.cp-detail-icon { vertical-align: -2px; }
.cp-diff-old {
  background: var(--color-danger-bg); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px;
}
.cp-diff-old p { font-size: 12px; color: var(--color-danger); margin: 0; text-decoration: line-through; }
.cp-diff-new {
  background: var(--color-success-bg, rgba(34, 197, 94, 0.08)); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px;
}
.cp-diff-new p { font-size: 12px; color: var(--color-success); margin: 0; }
.cp-detail-actions { display: flex; gap: 8px; }
.cp-detail-empty { border-top: 1px solid var(--color-border); padding-top: 12px; font-size: 12px; color: var(--color-text-muted); }

.cp-btn {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; padding: 6px 12px; font-family: inherit; cursor: pointer;
  border-radius: var(--radius-sm); border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--color-bg-surface)); color: var(--color-text-secondary);
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.cp-btn--primary { border-color: var(--color-accent-border); color: var(--color-accent); background: var(--color-accent-bg); }
.cp-btn--primary:hover:not(:disabled) { background: var(--color-accent); color: var(--color-text-on-accent); }
.cp-btn--ghost { color: var(--color-text-muted); }
.cp-btn:disabled { opacity: 0.5; cursor: default; }

.cp-outline-list { display: flex; flex-direction: column; }
.cp-outline-item {
  display: flex; gap: 10px; padding: 9px 4px;
  border-bottom: 1px solid var(--color-border);
}
.cp-outline-item.last { border-bottom: none; }
.cp-status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.cp-status--done { background: var(--color-success); }
.cp-status--suggest { background: var(--color-accent); }
.cp-status--planned { background: var(--color-border-strong, var(--color-border)); }
.cp-outline-main { flex: 1; min-width: 0; }
.cp-outline-title { font-size: 13px; margin: 0; color: var(--color-text-primary); }
.cp-outline-note {
  margin-top: 6px; background: var(--color-bg-page); border-radius: 8px; padding: 8px 10px;
}
.cp-outline-note p { font-size: 11px; color: var(--color-text-secondary); margin: 0 0 8px; }
.cp-outline-done { font-size: 11px; color: var(--color-success); margin: 4px 0 0; }

.cp-settings {
  border-top: 1px solid var(--color-border); padding: 14px 16px; flex-shrink: 0;
  background: var(--color-bg-page);
}
.cp-settings-row { display: flex; align-items: center; justify-content: space-between; }
.cp-settings-label { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.cp-settings-sub { font-size: 12px; color: var(--color-text-secondary); }
.cp-settings-sub--strong { font-size: 12px; font-weight: 500; color: var(--color-text-primary); margin: 0; }
.cp-settings-val { font-size: 12px; font-weight: 500; color: var(--color-text-primary); }
.cp-settings-hint { font-size: 11px; color: var(--color-text-muted); margin: 2px 0 14px; }
.cp-settings-block { transition: opacity 0.15s; }
.cp-settings-block.disabled { opacity: 0.4; }
.cp-slider { width: 100%; margin-top: 8px; accent-color: var(--color-accent); }
.cp-slider-labels {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--color-text-muted); margin-top: 2px;
}
.cp-settings-foot { border-top: 1px solid var(--color-border); margin-top: 14px; padding-top: 12px; }
.cp-settings-foot .cp-settings-hint { margin: 2px 0 0; }
.cp-error { font-size: 11px; color: var(--color-danger); margin: 8px 0 0; }

/* 开关 */
.cp-toggle { position: relative; width: 32px; height: 18px; border-radius: 9px; background: var(--color-border-strong, var(--color-border)); cursor: pointer; display: inline-block; transition: background 0.15s; }
.cp-toggle.on { background: var(--color-accent); }
.cp-toggle input { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; margin: 0; }
.cp-toggle-knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  /* 有意保留纯白：开关滑块不随轨道/主题变色，保持可辨识 */
  background: #fff; transition: left 0.15s;
}
.cp-toggle.on .cp-toggle-knob { left: 16px; }

.spinning { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
