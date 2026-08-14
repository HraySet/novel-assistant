export interface ProjectEntry {
  path: string
  name: string
  lastOpened: string  // ISO date
  wordCount: number
  color: string       // CSS color for the cover block
  broken?: boolean
}

export const COVER_COLORS = [
  '#f5e4d5', // 赭石灰
  '#e9efe3', // 苔绿灰
  '#f7ecd8', // 暖黄灰
  '#e8e0d5', // 驼灰
  '#f0e8dc', // 杏灰
  '#e3e8ef', // 钢蓝灰
]

export function pickCoverColor(index: number): string {
  return COVER_COLORS[index % COVER_COLORS.length]
}
