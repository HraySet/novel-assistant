import { watchEffect } from "vue";
import { useSettingsStore } from "../stores/settings";

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

/**
 * 调用一次（建议放在 App.vue 的 setup 顶层），保持以下 CSS 变量
 * 与用户在设置里选择的强调色同步，并切换 .theme-dark / .theme-light 类：
 *
 *   --accent               原色，如 #a855f7
 *   --surface-accent       弱强调背景（选中态用）
 *   --surface-accent-strong 强一些的强调背景（active/hover-on-selected 用）
 *   --border-accent        强调色描边
 *
 * 这样所有组件只需要写 `var(--accent)`，不需要各自导入 store。
 */
export function useDesignTokens() {
  const store = useSettingsStore();

  watchEffect(() => {
    const root = document.documentElement;
    const accent = store.accentColor;
    const dark = store.themeDark;

    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-rgb", hexToRgbTuple(accent));
    root.style.setProperty("--surface-accent", hexToRgba(accent, dark ? 0.1 : 0.06));
    root.style.setProperty("--surface-accent-strong", hexToRgba(accent, dark ? 0.18 : 0.12));
    root.style.setProperty("--border-accent", hexToRgba(accent, 0.45));

    root.classList.toggle("theme-dark", dark);
    root.classList.toggle("theme-light", !dark);
  });
}
