import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

interface ProviderConfig {
  apiKey: string;
  model: string;
  endpoint: string;
}

interface AllAIConfig {
  activeProvider: string;
  configs: Record<string, ProviderConfig>;
}

const DEFAULT_AI_CONFIGS: Record<string, ProviderConfig> = {
  openai: { apiKey: "", model: "gpt-4o", endpoint: "https://api.openai.com/v1" },
  claude: { apiKey: "", model: "claude-sonnet-4-20250514", endpoint: "https://api.anthropic.com/v1" },
  deepseek: { apiKey: "", model: "deepseek-chat", endpoint: "https://api.deepseek.com/v1" },
};

async function loadAISettings(): Promise<AllAIConfig> {
  try {
    const raw = await invoke<Record<string, unknown> | null>("get_ai_config");
    if (raw && typeof raw === "object") {
      const rawObj = raw as Record<string, unknown>;
      if (rawObj.configs && typeof rawObj.configs === "object") {
        return {
          activeProvider: (rawObj.activeProvider as string) || "openai",
          configs: { ...DEFAULT_AI_CONFIGS, ...(rawObj.configs as Record<string, ProviderConfig>) },
        };
      }
      // 兼容旧格式：单个 provider
      if (rawObj.provider) {
        return {
          activeProvider: rawObj.provider as string,
          configs: {
            ...DEFAULT_AI_CONFIGS,
            [rawObj.provider as string]: {
              apiKey: (rawObj.apiKey as string) || "",
              model: (rawObj.model as string) || DEFAULT_AI_CONFIGS[rawObj.provider as string]?.model || "",
              endpoint: (rawObj.endpoint as string) || DEFAULT_AI_CONFIGS[rawObj.provider as string]?.endpoint || "",
            },
          },
        };
      }
    }
  } catch { /* fall through to defaults */ }
  return { activeProvider: "openai", configs: { ...DEFAULT_AI_CONFIGS } };
}

async function saveAISettings(config: AllAIConfig) {
  try {
    await invoke("save_ai_config", { aiConfig: config });
  } catch (e) { console.error("Failed to save AI config:", e); }
}

function loadTheme() {
  try { const raw = localStorage.getItem("theme-settings"); if (raw) return JSON.parse(raw); } catch {}
  return { accentColor: "#a78bfa", bgColor: "#12121a", themeDark: true };
}

function saveTheme(accent: string, bg: string, dark: boolean) {
  localStorage.setItem("theme-settings", JSON.stringify({ accentColor: accent, bgColor: bg, themeDark: dark }));
}

export const useSettingsStore = defineStore("settings", () => {
  const savedTheme = loadTheme();
  const accentColor = ref(savedTheme.accentColor);
  const bgColor = ref(savedTheme.bgColor);
  const themeDark = ref(savedTheme.themeDark);

  const aiConfigs = ref<Record<string, ProviderConfig>>({ ...DEFAULT_AI_CONFIGS });
  const aiProvider = ref<"openai" | "claude" | "deepseek">("openai");

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

  const editorFontSize = ref(localStorage.getItem("editor_font_size") || "中");
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
  }
  initAISettings();

  function setEditorFontSize(s: string) { editorFontSize.value = s; localStorage.setItem("editor_font_size", s); }
  function toggleTypewriter() { typewriterMode.value = !typewriterMode.value; localStorage.setItem("editor_typewriter", typewriterMode.value ? "1" : "0"); }
  function toggleFocusLine() { focusLineMode.value = !focusLineMode.value; localStorage.setItem("editor_focusline", focusLineMode.value ? "1" : "0"); }

  function applyPreset(preset: "openai" | "claude" | "deepseek") {
    aiProvider.value = preset;
  }

  watch([aiConfigs, aiProvider], () => {
    saveAISettings({ activeProvider: aiProvider.value, configs: aiConfigs.value });
  }, { deep: true });

  const colorPresets = [
    { name: "紫夜", value: "#a78bfa", bg: "#12121a", dark: true },
    { name: "深海", value: "#60a5fa", bg: "#0f1729", dark: true },
    { name: "墨绿", value: "#34d399", bg: "#0a1916", dark: true },
    { name: "暖橙", value: "#fb923c", bg: "#1a1410", dark: true },
    { name: "石墨", value: "#94a3b8", bg: "#141418", dark: true },
    { name: "薄紫", value: "#7c3aed", bg: "#faf5ff", dark: false },
    { name: "天蓝", value: "#2563eb", bg: "#f0f7ff", dark: false },
    { name: "薄荷", value: "#059669", bg: "#f0fdf6", dark: false },
    { name: "暖阳", value: "#ea580c", bg: "#fffbf0", dark: false },
    { name: "樱花", value: "#db2777", bg: "#fff5f7", dark: false },
    { name: "素白", value: "#6b7280", bg: "#ffffff", dark: false },
  ];

  function applyColorPreset(preset: typeof colorPresets[number]) { accentColor.value = preset.value; bgColor.value = preset.bg; themeDark.value = preset.dark; }

  watch([accentColor, bgColor, themeDark], () => { saveTheme(accentColor.value, bgColor.value, themeDark.value); });

  return {
    accentColor, bgColor, themeDark,
    aiProvider, aiApiKey, aiModel, aiEndpoint,
    colorPresets,
    editorFontSize, typewriterMode, focusLineMode,
    setEditorFontSize, toggleTypewriter, toggleFocusLine,
    applyPreset, applyColorPreset,
  };
});
