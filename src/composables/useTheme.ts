import { useSettingsStore } from "../stores/settings";

/**
 * 共享的主题工具函数和角色颜色映射。
 * 替代各组件中重复定义的 tx() 和 roleColor()。
 */

/** 根据深/浅色模式返回对应类名或样式值 */
export function tx(dark: string, light: string): string {
  const s = useSettingsStore();
  return s.themeDark ? dark : light;
}

const ROLE_COLORS: Record<string, string> = {
  "主角": "#34d399", "主": "#34d399",
  "反派": "#f87171", "敌": "#f87171", "反": "#f87171",
  "导师": "#fbbf24", "师": "#fbbf24", "导": "#fbbf24",
  "恋人": "#f472b6", "恋": "#f472b6",
  "挚友": "#60a5fa", "友": "#60a5fa",
  "宿敌": "#ef4444",
  "神秘人": "#a78bfa",
  "路人": "#9ca3af",
  "家人": "#fb923c",
};

/**
 * 根据角色定位返回对应颜色，未匹配时返回主题适配灰色。
 * 注意：返回值恒为 6 位十六进制 #rrggbb —— 调用方依赖此格式拼接透明色
 * （如 color-mix / 十六进制后缀），修改实现时勿改成 rgb()/hsl() 等其它格式。
 */
export function roleColor(role: string): string {
  const s = useSettingsStore();
  const fallback = s.themeDark ? "#6b7280" : "#9ca3af";
  if (!role) return fallback;
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (role.includes(key)) return color;
  }
  return fallback;
}

/** 导出角色颜色映射供直接使用 */
export { ROLE_COLORS };

/**
 * 根据背景色计算可读的前景色（黑色或白色）
 * 用于在强调色背景上放置文字时，自动选择对比度足够的颜色
 */
export function readableTextColor(hex: string): string {
  if (!hex || hex.length < 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1e293b" : "#ffffff";
}
