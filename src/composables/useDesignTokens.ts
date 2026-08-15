import { watchEffect } from "vue";
import { useSettingsStore } from "../stores/settings";
import { readableTextColor } from "./useTheme";

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgbTuple(hex: string): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

/** 按比例提亮（正值）或压暗（负值）一个 #rrggbb 颜色，返回同格式颜色 */
function shift(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const n = parseInt(full, 16);
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// 中性文字色固定调色板：保证任意背景色下可读，明暗各一套
// 文字色改用中性灰阶：旧版是固定暖棕，会盖在所有彩色背景上，
// 让各主题都带一层「暖纸」色偏、辨识度低。中性灰在任意色相背景上都协调。
const LIGHT_TEXT = { primary: "#3f3f46", secondary: "#71717a", muted: "#a1a1aa" };
const DARK_TEXT = { primary: "#e4e4e7", secondary: "#a1a1aa", muted: "#6d6d76" };

/**
 * 主题系统的唯一注入点：把 settings store 里的强调色 / 背景色 / 明暗模式
 * 全部写入 :root 的 CSS 变量，并同步 data-theme 与 .theme-dark/.theme-light。
 * 在 App.vue 的 setup 顶层调用一次即可。
 */
export function useDesignTokens() {
  const store = useSettingsStore();

  watchEffect(() => {
    const root = document.documentElement;
    const accent = store.accentColor;
    const bg = store.bgColor;
    const dark = store.themeDark;
    // 主题专属文字色优先（暖色主题暖棕、冷色主题冷调）；
    // 旧存档没有文字色时按明暗回退中性灰阶
    const text = store.themeText ?? (dark ? DARK_TEXT : LIGHT_TEXT);

    // 背景层级（由用户选中的背景色派生）
    root.style.setProperty("--color-bg-page", bg);
    root.style.setProperty("--color-bg-surface", shift(bg, dark ? 0.05 : -0.04));
    root.style.setProperty("--color-bg-surface-hover", shift(bg, dark ? 0.1 : -0.075));
    root.style.setProperty("--color-bg-elevated", shift(bg, dark ? 0.08 : 0.02));

    // 边框
    root.style.setProperty("--color-border", shift(bg, dark ? 0.15 : -0.13));
    root.style.setProperty("--color-border-strong", shift(bg, dark ? 0.22 : -0.19));

    // 文字
    root.style.setProperty("--color-text-primary", text.primary);
    root.style.setProperty("--color-text-secondary", text.secondary);
    root.style.setProperty("--color-text-muted", text.muted);

    // 强调色
    root.style.setProperty("--color-accent", accent);
    root.style.setProperty("--color-accent-hover", shift(accent, dark ? 0.1 : -0.1));
    root.style.setProperty("--color-accent-bg", hexToRgba(accent, dark ? 0.16 : 0.12));
    root.style.setProperty("--color-accent-border", hexToRgba(accent, 0.45));
    root.style.setProperty("--color-text-on-accent", readableTextColor(accent));

    // 旧版短变量（SurfaceCard / StatusDot / SectionHeader / EmptyState 直接引用）
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-rgb", hexToRgbTuple(accent));
    root.style.setProperty("--surface-accent", hexToRgba(accent, dark ? 0.1 : 0.06));
    root.style.setProperty("--surface-accent-strong", hexToRgba(accent, dark ? 0.18 : 0.12));
    root.style.setProperty("--border-accent", hexToRgba(accent, 0.45));

    // 语义色 / 字体 / 圆角 / 阴影等静态变量仍由 style.css 的
    // :root 与 html[data-theme="warm-paper-dark"] 规则提供，这里只同步 data-theme
    root.setAttribute("data-theme", dark ? "warm-paper-dark" : "warm-paper");
    root.classList.toggle("theme-dark", dark);
    root.classList.toggle("theme-light", !dark);
  });
}
