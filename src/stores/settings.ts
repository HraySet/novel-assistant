import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface AISettings {
  provider: "openai" | "claude" | "deepseek" | "custom";
  apiKey: string;
  model: string;
  endpoint: string;
}

function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem("ai-settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { provider: "openai", apiKey: "", model: "gpt-4o", endpoint: "https://api.openai.com/v1" };
}

function saveAISettings(s: AISettings) { localStorage.setItem("ai-settings", JSON.stringify(s)); }

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

  const aiProvider = ref<AISettings["provider"]>("openai");
  const aiApiKey = ref("");
  const aiModel = ref("gpt-4o");
  const aiEndpoint = ref("https://api.openai.com/v1");

  const bookTitle = ref(localStorage.getItem("book-title") || "");
  const bookDesc = ref(localStorage.getItem("book-desc") || "");
  const projectDir = ref(localStorage.getItem("project-dir") || "");

  const editorFontSize = ref(localStorage.getItem("editor_font_size") || "中");
  const typewriterMode = ref(localStorage.getItem("editor_typewriter") === "1");
  const focusLineMode = ref(localStorage.getItem("editor_focusline") === "1");
  const layoutMode = ref((localStorage.getItem("layout_mode") || "compact") as "compact" | "classic" | "focus");

  const saved = loadAISettings();
  aiProvider.value = saved.provider;
  aiApiKey.value = saved.apiKey;
  aiModel.value = saved.model;
  aiEndpoint.value = saved.endpoint;

  function setBookTitle(title: string) { bookTitle.value = title; localStorage.setItem("book-title", title); }
  function setBookDesc(desc: string) { bookDesc.value = desc; localStorage.setItem("book-desc", desc); }
  function setProjectDir(path: string) { projectDir.value = path; localStorage.setItem("project-dir", path); }
  function setEditorFontSize(s: string) { editorFontSize.value = s; localStorage.setItem("editor_font_size", s); }
  function toggleTypewriter() { typewriterMode.value = !typewriterMode.value; localStorage.setItem("editor_typewriter", typewriterMode.value ? "1" : "0"); }
  function toggleFocusLine() { focusLineMode.value = !focusLineMode.value; localStorage.setItem("editor_focusline", focusLineMode.value ? "1" : "0"); }
  function setLayoutMode(mode: "compact" | "classic" | "focus") { layoutMode.value = mode; localStorage.setItem("layout_mode", mode); }

  function applyPreset(preset: "openai" | "claude" | "deepseek") {
    if (preset === "openai") { aiProvider.value = "openai"; aiModel.value = "gpt-4o"; aiEndpoint.value = "https://api.openai.com/v1"; }
    else if (preset === "claude") { aiProvider.value = "claude"; aiModel.value = "claude-sonnet-4-20250514"; aiEndpoint.value = "https://api.anthropic.com/v1"; }
    else { aiProvider.value = "deepseek"; aiModel.value = "deepseek-chat"; aiEndpoint.value = "https://api.deepseek.com/v1"; }
  }

  watch([aiProvider, aiApiKey, aiModel, aiEndpoint], () => {
    saveAISettings({ provider: aiProvider.value, apiKey: aiApiKey.value, model: aiModel.value, endpoint: aiEndpoint.value });
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
    bookTitle, bookDesc, projectDir,
    aiProvider, aiApiKey, aiModel, aiEndpoint,
    colorPresets,
    editorFontSize, typewriterMode, focusLineMode, layoutMode,
    setBookTitle, setBookDesc, setProjectDir,
    setEditorFontSize, toggleTypewriter, toggleFocusLine, setLayoutMode,
    applyPreset, applyColorPreset,
  };
});
