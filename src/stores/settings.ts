import { defineStore, acceptHMRUpdate } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

interface ProviderConfig {
  apiKey: string;
  model: string;
  endpoint: string;
}

interface AllAIConfig {
  activeProvider: string;
  /** 全局采样温度（0-2），持久化在 ai 配置里 */
  temperature?: number;
  configs: Record<string, ProviderConfig>;
}

export interface AiContextOptions {
  /** 包含角色设定 */
  roles: boolean
  /** 包含大纲 */
  outlines: boolean
  /** 包含项目概述 */
  project: boolean
  /** 包含前情提要 */
  recap: boolean
  /** 前情提要包含最近几章 */
  recapChapters: number
}

const DEFAULT_AI_CONTEXT_OPTIONS: AiContextOptions = {
  roles: true,
  outlines: true,
  project: true,
  recap: true,
  recapChapters: 4,
};

function loadAiContextOptions(): AiContextOptions {
  try {
    const raw = localStorage.getItem("ai_context_options");
    if (raw) return { ...DEFAULT_AI_CONTEXT_OPTIONS, ...JSON.parse(raw) };
  } catch { /* 回退默认 */ }
  return { ...DEFAULT_AI_CONTEXT_OPTIONS };
}

const DEFAULT_AI_CONFIGS: Record<string, ProviderConfig> = {
  openai: { apiKey: "", model: "gpt-4o", endpoint: "https://api.openai.com/v1" },
  claude: { apiKey: "", model: "claude-sonnet-4-20250514", endpoint: "https://api.anthropic.com/v1" },
  deepseek: { apiKey: "", model: "deepseek-chat", endpoint: "https://api.deepseek.com/v1" },
};

async function loadAISettings(): Promise<AllAIConfig> {
  try {
    const raw = await invoke<Record<string, unknown> | null>("get_ai_config");
    let parsed: AllAIConfig | null = null;
    if (raw && typeof raw === "object") {
      const rawObj = raw as Record<string, unknown>;
      if (rawObj.configs && typeof rawObj.configs === "object") {
        parsed = {
          activeProvider: (rawObj.activeProvider as string) || "openai",
          temperature: typeof rawObj.temperature === 'number' ? rawObj.temperature : undefined,
          configs: { ...DEFAULT_AI_CONFIGS, ...(rawObj.configs as Record<string, ProviderConfig>) },
        };
      } else if (rawObj.provider) {
        // 兼容旧格式：单个 provider
        parsed = {
          activeProvider: rawObj.provider as string,
          configs: { ...DEFAULT_AI_CONFIGS },
        };
        parsed.configs[parsed.activeProvider] = {
          apiKey: (rawObj.apiKey as string) || "",
          model: (rawObj.model as string) || DEFAULT_AI_CONFIGS[parsed.activeProvider]?.model || "",
          endpoint: (rawObj.endpoint as string) || DEFAULT_AI_CONFIGS[parsed.activeProvider]?.endpoint || "",
        };
      }
    }
    // 即使 config.json 缺失/无 ai 段，也要从钥匙串读回密钥（密钥可能只存在钥匙串里）
    if (!parsed) parsed = { activeProvider: "openai", configs: { ...DEFAULT_AI_CONFIGS } };

    // 迁移：config.json 里残留的旧明文密钥搬进系统钥匙串
    for (const [name, cfg] of Object.entries(parsed.configs)) {
      if (cfg.apiKey) {
        try { await invoke("set_api_key", { provider: name, apiKey: cfg.apiKey }); } catch { /* 忽略 */ }
      }
    }
    // 从系统钥匙串读回密钥（此后 config.json 不再保存明文）
    for (const name of Object.keys(parsed.configs)) {
      try {
        const key = await invoke<string | null>("get_api_key", { provider: name });
        if (key) parsed.configs[name].apiKey = key;
      } catch { /* 忽略 */ }
    }
    // 落盘剥离版配置（把明文从 config.json 里清掉；Rust 端也会再次剥离）
    try { await invoke("save_ai_config", { aiConfig: parsed }); } catch { /* 忽略 */ }
    return parsed;
  } catch { /* fall through to defaults */ }
  return { activeProvider: "openai", configs: { ...DEFAULT_AI_CONFIGS } };
}

// 防抖保存：避免输入 API Key 时每个字符都触发钥匙串写入
let aiSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function persistAISettings(config: AllAIConfig) {
  try {
    // 密钥进系统钥匙串，非敏感配置进 config.json（Rust 端会再次剥离）
    for (const [name, cfg] of Object.entries(config.configs)) {
      await invoke("set_api_key", { provider: name, apiKey: cfg.apiKey ?? "" });
    }
    await invoke("save_ai_config", { aiConfig: config });
  } catch (e) { console.error("Failed to save AI config:", e); }
}

function scheduleAISave(config: AllAIConfig) {
  if (aiSaveTimer) clearTimeout(aiSaveTimer);
  aiSaveTimer = setTimeout(() => { aiSaveTimer = null; persistAISettings(config); }, 400);
}

/** 应用关闭前立即落盘（跳过防抖） */
function flushAiSave(config: AllAIConfig) {
  if (aiSaveTimer) { clearTimeout(aiSaveTimer); aiSaveTimer = null; persistAISettings(config); }
}

// ── 主题预设（模块级）────────────────────────────────────────────────
// 每个主题：背景有明显色相 + 强调色同色系 + 专属文字色（暖色主题用暖棕文字、
// 冷色主题用冷调文字），彼此一眼可辨。字段：text 为可选主题文字色。
export interface ThemePreset {
  name: string
  value: string
  bg: string
  dark: boolean
  text: { primary: string; secondary: string; muted: string }
}

export const COLOR_PRESETS: ThemePreset[] = [
  // ── 浅色系 ──
  { name: "米纸", value: "#b5652f", bg: "#faf6ee", dark: false,
    text: { primary: "#4a4032", secondary: "#8a7d68", muted: "#b0a48f" } },   // 暖棕（默认，与最早版本一致）
  { name: "樱粉", value: "#d6336c", bg: "#fdeef2", dark: false,
    text: { primary: "#4a2530", secondary: "#825261", muted: "#b58a97" } },
  { name: "薄荷", value: "#0ca678", bg: "#e7f5ee", dark: false,
    text: { primary: "#1f3d32", secondary: "#54786a", muted: "#8fb0a2" } },
  { name: "天蓝", value: "#1c7ed6", bg: "#e9f2fc", dark: false,
    text: { primary: "#20364d", secondary: "#55708a", muted: "#93aac0" } },
  { name: "淡紫", value: "#7048e8", bg: "#f1edfd", dark: false,
    text: { primary: "#33284d", secondary: "#655a85", muted: "#a296c0" } },
  { name: "柠檬", value: "#b08800", bg: "#fcf8e1", dark: false,
    text: { primary: "#46411a", secondary: "#7f7848", muted: "#b3ac7e" } },
  { name: "素灰", value: "#52525b", bg: "#f2f2f4", dark: false,
    text: { primary: "#3f3f46", secondary: "#71717a", muted: "#a1a1aa" } },
  // ── 深色系 ──
  { name: "墨夜", value: "#a78bfa", bg: "#1c1b22", dark: true,
    text: { primary: "#e6e4f0", secondary: "#a9a4c0", muted: "#6e6880" } },
  { name: "深海", value: "#38bdf8", bg: "#0e1a2b", dark: true,
    text: { primary: "#d0e5f6", secondary: "#90b7d9", muted: "#5f87a9" } },
  { name: "墨绿", value: "#34d399", bg: "#0c1d17", dark: true,
    text: { primary: "#c9ecd9", secondary: "#8cc4a8", muted: "#5a9278" } },
  { name: "绯夜", value: "#fb7185", bg: "#221318", dark: true,
    text: { primary: "#f6dae0", secondary: "#cd9ba6", muted: "#9a6572" } },
  { name: "暖棕", value: "#fbbf24", bg: "#201a12", dark: true,
    text: { primary: "#f2e4cf", secondary: "#c9ac88", muted: "#947a58" } },
  { name: "石墨", value: "#94a3b8", bg: "#17181c", dark: true,
    text: { primary: "#e4e4e7", secondary: "#a1a1aa", muted: "#6d6d76" } },
]

function loadTheme() {
  try {
    const raw = localStorage.getItem("theme-settings");
    if (raw) {
      const t = JSON.parse(raw);
      const accent = t.accentColor ?? "#b5652f";
      const bg = t.bgColor ?? "#faf6ee";
      const dark = !!t.themeDark;
      // 旧存档没有文字色：按 accent/bg/dark 匹配预设自动补全，找不到则留给运行时回退
      const matched = COLOR_PRESETS.find((p) => p.value === accent && p.bg === bg && p.dark === dark);
      const text = t.textPrimary
        ? { primary: t.textPrimary, secondary: t.textSecondary, muted: t.textMuted }
        : matched?.text;
      return {
        accentColor: accent,
        bgColor: bg,
        themeDark: dark,
        text,
      };
    }
  } catch { /* 回退默认 */ }
  // 默认主题 = 米纸（暖米黄底 + 赭石棕强调 + 暖棕文字，与最早版本一致）
  return { accentColor: "#b5652f", bgColor: "#faf6ee", themeDark: false, text: COLOR_PRESETS[0].text };
}

function saveTheme(accent: string, bg: string, dark: boolean, text?: { primary: string; secondary: string; muted: string }) {
  localStorage.setItem(
    "theme-settings",
    JSON.stringify({
      accentColor: accent,
      bgColor: bg,
      themeDark: dark,
      textPrimary: text?.primary,
      textSecondary: text?.secondary,
      textMuted: text?.muted,
    }),
  );
}

export const useSettingsStore = defineStore("settings", () => {
  const savedTheme = loadTheme();
  /** 主题专属文字色（未设置时由 useDesignTokens 按明暗回退中性灰阶） */
  const themeText = ref<{ primary: string; secondary: string; muted: string } | undefined>(savedTheme.text);
  const accentColor = ref(savedTheme.accentColor);
  const bgColor = ref(savedTheme.bgColor);
  const themeDark = ref(savedTheme.themeDark);

  const aiConfigs = ref<Record<string, ProviderConfig>>({ ...DEFAULT_AI_CONFIGS });
  const aiProvider = ref<"openai" | "claude" | "deepseek">("openai")
  const aiTemperature = ref(0.8)

  // 每个服务商独立配置，通过 computed 代理当前选中服务商的字段
  const aiApiKey = computed({
    get: () => aiConfigs.value[aiProvider.value]?.apiKey ?? "",
    set: (v) => { if (aiConfigs.value[aiProvider.value]) aiConfigs.value[aiProvider.value].apiKey = v; },
  });
  const aiModel = computed({
    get: () => aiConfigs.value[aiProvider.value]?.model ?? "",
    set: (v) => { if (aiConfigs.value[aiProvider.value]) aiConfigs.value[aiProvider.value].model = v; },
  });
  const aiEndpoint = computed({
    get: () => aiConfigs.value[aiProvider.value]?.endpoint ?? "",
    set: (v) => { if (aiConfigs.value[aiProvider.value]) aiConfigs.value[aiProvider.value].endpoint = v; },
  });

  // ── AI 上下文选项（两面板共享，持久化） ──

  const aiContextOptions = ref<AiContextOptions>(loadAiContextOptions());

  function setAiContextOptions(patch: Partial<AiContextOptions>) {
    aiContextOptions.value = { ...aiContextOptions.value, ...patch };
    localStorage.setItem("ai_context_options", JSON.stringify(aiContextOptions.value));
  }

  // ── 编辑器字号（px，14-24 可调，兼容旧版 小/中/大 存储值） ──
  const FONT_SIZE_MIN = 14;
  const FONT_SIZE_MAX = 24;
  const FONT_SIZE_LEGACY: Record<string, number> = { 小: 15, 中: 17, 大: 19 };
  function clampFontSize(n: number): number {
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
  }
  function loadEditorFontSize(): number {
    const raw = localStorage.getItem("editor_font_size");
    if (!raw) return 17;
    if (raw in FONT_SIZE_LEGACY) return FONT_SIZE_LEGACY[raw];
    const n = Number(raw);
    return Number.isFinite(n) ? clampFontSize(n) : 17;
  }
  const editorFontSize = ref(loadEditorFontSize());

  // ── 编辑器行距（1.5-2.2） ──
  const LINE_HEIGHT_MIN = 1.5;
  const LINE_HEIGHT_MAX = 2.2;
  function loadEditorLineHeight(): number {
    const n = Number(localStorage.getItem("editor_line_height"));
    if (!Number.isFinite(n)) return 1.8;
    return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(n * 10) / 10));
  }
  const editorLineHeight = ref(loadEditorLineHeight());

  // 字号 / 行距 → 编辑器 CSS 变量（实时生效，编辑器主题读取）
  function applyEditorFontSize(size: number) {
    document.documentElement.style.setProperty("--font-size-editor", size + "px");
  }
  function applyEditorLineHeight(lh: number) {
    document.documentElement.style.setProperty("--line-height-editor", String(lh));
  }
  applyEditorFontSize(editorFontSize.value);
  applyEditorLineHeight(editorLineHeight.value);
  watch(editorFontSize, applyEditorFontSize);
  watch(editorLineHeight, applyEditorLineHeight);

  // 正文宽度 → 编辑器 CSS 变量
  const editorWidth = ref(localStorage.getItem("editor_width") || "中");
  const EDITOR_WIDTH_MAP: Record<string, string> = { 窄: "640px", 中: "760px", 宽: "880px" };
  function applyEditorWidth(w: string) {
    document.documentElement.style.setProperty("--editor-max-width", EDITOR_WIDTH_MAP[w] ?? EDITOR_WIDTH_MAP["中"]!);
  }
  applyEditorWidth(editorWidth.value);
  watch(editorWidth, applyEditorWidth);
  const typewriterMode = ref(localStorage.getItem("editor_typewriter") === "1");
  const focusLineMode = ref(localStorage.getItem("editor_focusline") === "1");

  // Async init for AI settings from secure backend storage
  let aiInitialized = false;
  async function initAISettings() {
    if (aiInitialized) return;
    aiInitialized = true;
    const saved = await loadAISettings();
    aiConfigs.value = { ...DEFAULT_AI_CONFIGS, ...saved.configs };
    aiProvider.value = (saved.activeProvider as "openai" | "claude" | "deepseek") || "openai";
    if (typeof saved.temperature === 'number') aiTemperature.value = saved.temperature;
  }
  // ── 快捷操作提示词覆盖（用户自定义，存 localStorage，缺省用内置） ──
  function loadAiQuickPrompts(): Record<string, string> {
    try {
      const raw = localStorage.getItem('ai_quick_prompts')
      if (raw) return JSON.parse(raw)
    } catch { /* 忽略 */ }
    return {}
  }
  const aiQuickPrompts = ref<Record<string, string>>(loadAiQuickPrompts())
  function setAiQuickPrompt(label: string, text: string) {
    const next = { ...aiQuickPrompts.value, [label]: text }
    aiQuickPrompts.value = next
    localStorage.setItem('ai_quick_prompts', JSON.stringify(next))
  }
  function resetAiQuickPrompt(label: string) {
    const next = { ...aiQuickPrompts.value }
    delete next[label]
    aiQuickPrompts.value = next
    localStorage.setItem('ai_quick_prompts', JSON.stringify(next))
  }
  initAISettings();

  function setEditorFontSize(size: number) {
    editorFontSize.value = clampFontSize(size);
    localStorage.setItem("editor_font_size", String(editorFontSize.value));
  }
  function setEditorLineHeight(lh: number) {
    editorLineHeight.value = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(lh * 10) / 10));
    localStorage.setItem("editor_line_height", String(editorLineHeight.value));
  }
  function setEditorWidth(w: string) { editorWidth.value = w; localStorage.setItem("editor_width", w); }
  function toggleTypewriter() { typewriterMode.value = !typewriterMode.value; localStorage.setItem("editor_typewriter", typewriterMode.value ? "1" : "0"); }
  function toggleFocusLine() { focusLineMode.value = !focusLineMode.value; localStorage.setItem("editor_focusline", focusLineMode.value ? "1" : "0"); }

  function applyPreset(preset: "openai" | "claude" | "deepseek") {
    aiProvider.value = preset;
  }

  /** 明暗切换的唯一入口：顶栏按钮与任何主题逻辑都走这里 */
  function toggleDark() {
    themeDark.value = !themeDark.value;
  }

  watch([aiConfigs, aiProvider], () => {
    scheduleAISave({ activeProvider: aiProvider.value, configs: aiConfigs.value, temperature: aiTemperature.value });
  }, { deep: true });

  /** 关闭应用前立即落盘 AI 配置与密钥（App 关闭守卫调用） */
  function flushAiSaveNow() {
    flushAiSave({ activeProvider: aiProvider.value, configs: aiConfigs.value, temperature: aiTemperature.value });
  }

  // 主题预设：每个主题都有明确可辨的色调倾向（背景色本身就有色相，
  // 而不是一片近似白/近似黑），强调色与背景同色系呼应。
  // 字段：name 名称 / value 强调色 / bg 页面背景色 / dark 是否深色
  const colorPresets = COLOR_PRESETS

  function applyColorPreset(preset: typeof colorPresets[number]) { accentColor.value = preset.value; bgColor.value = preset.bg; themeDark.value = preset.dark; themeText.value = preset.text; }

  watch([accentColor, bgColor, themeDark, themeText], () => { saveTheme(accentColor.value, bgColor.value, themeDark.value, themeText.value); });

  return {
    accentColor, bgColor, themeDark, themeText,
    aiProvider, aiApiKey, aiModel, aiEndpoint, aiTemperature,
    aiQuickPrompts, setAiQuickPrompt, resetAiQuickPrompt,
    aiContextOptions, setAiContextOptions,
    colorPresets,
    editorFontSize, editorLineHeight, typewriterMode, focusLineMode, editorWidth,
    setEditorFontSize, setEditorLineHeight, setEditorWidth, toggleTypewriter, toggleFocusLine,
    applyPreset, applyColorPreset, toggleDark,
    flushAiSaveNow,
  };
});

// 开发模式 HMR：store 改动时热替换定义，避免新旧实例混用导致运行时崩溃
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
}
