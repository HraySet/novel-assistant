/**
 * 路径工具：全应用唯一的路径字符串处理入口。
 *
 * 设计约束（很重要，改动前先读完）：
 *
 * 1. **两种路径风格共存**。Rust 侧 `list_dir` 返回的路径来自 canonicalize()，
 *    Windows 上带 `\\?\` 前缀、用反斜杠；而用户从对话框选择的项目根、以及
 *    手工拼接的新路径不带前缀。因此：
 *    - `normalize()` 只用于**比较与展示**（去前缀、统一正斜杠）；
 *    - `joinPath()` 保持父路径的分隔符风格，避免拼出的子路径与树中已有路径
 *      字符串不相等（会导致 findNode / isFileOpen 等按字符串比较的逻辑失效）。
 * 2. **不要用 normalize() 的结果去调 IPC**。IPC 用原始路径，Rust 侧的
 *    resolve_within 会再做一次规范化与沙箱校验。
 * 3. 重映射（重命名/移动/删除）统一走 `remapPath`，它同时处理"单点"与"整棵子树"，
 *    这是此前 rename 只做精确匹配、导致目录重命名后子文件标签失联的根因。
 */

export type PathStyle = 'win32' | 'posix'

/** 去 Windows 扩展长度路径前缀（\\?\ 或 //?/），否则跨来源的字符串比较永远失败 */
export function stripVerbatimPrefix(p: string): string {
  return p.replace(/^[\\/]{2}\?[\\/]/, '')
}

/** 统一为小写比较用的规范形式：去前缀 + 反斜杠转正斜杠 + 去尾部斜杠 */
export function normalize(p: string): string {
  let out = stripVerbatimPrefix(p).replace(/\\/g, '/')
  // 保留根路径（'/' 或 'E:/'）的末尾斜杠语义：只在长度大于根时去尾
  if (out.length > 1 && out.endsWith('/') && !/^[A-Za-z]:\/$/.test(out)) {
    out = out.replace(/\/+$/, '')
  }
  return out
}

/**
 * 按**实际使用的分隔符**判断路径风格。
 *
 * 注意：不能靠盘符判断——`E:/书/a.md` 带盘符但用的是正斜杠，
 * 若按 win32 规则拼出 `E:/书\a.md`，就会与树中同一条目的字符串不相等，
 * 导致 findNode / isFileOpen 这类按字符串比较的逻辑失效。
 * 盘符只说明这是 Windows 路径，不说明它用了哪种分隔符。
 */
export function detectStyle(p: string): PathStyle {
  return p.includes('\\') ? 'win32' : 'posix'
}

/** 取该路径应使用的分隔符 */
export function sepOf(p: string): string {
  return detectStyle(p) === 'win32' ? '\\' : '/'
}

/** 比较两个路径是否指向同一位置（忽略风格、前缀、尾斜杠差异） */
export function samePath(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return normalize(a) === normalize(b)
}

/**
 * 拼接子路径：保持父路径的分隔符风格。
 * 传入空父路径时原样返回 name（用于根目录下的新建）。
 */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name
  const sep = sepOf(parent)
  if (parent.endsWith(sep) || parent.endsWith('/') || parent.endsWith('\\')) return parent + name
  return parent + sep + name
}

/** 取父目录（保留原风格）；无父目录时返回空串 */
export function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx > 0 ? p.slice(0, idx) : ''
}

/** 取文件名（去目录部分） */
export function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

/** child 是否严格位于 parent 之内（不含两者相等） */
export function isInside(parent: string, child: string): boolean {
  const np = normalize(parent)
  const nc = normalize(child)
  if (!np || !nc || np === nc) return false
  return nc.startsWith(np.endsWith('/') ? np : np + '/')
}

/**
 * 路径迁移：把 from（单点或整棵子树）映射到 to，其余路径原样返回。
 *
 * - `remapPath('/p/第1章.md', '/p/第1章.md', '/p/序章.md')` → `/p/序章.md`
 * - `remapPath('/p/卷1/a.md', '/p/卷1', '/p/卷2')` → `/p/卷2/a.md`
 * - 不相关路径原样返回（不做任何改写）
 *
 * 返回路径使用 to 的分隔符风格。
 */
export function remapPath(p: string, from: string, to: string): string {
  const np = normalize(p)
  const nf = normalize(from)
  if (!np || !nf) return p
  if (np === nf) return to
  const prefix = nf.endsWith('/') ? nf : nf + '/'
  if (!np.startsWith(prefix)) return p
  const rest = np.slice(prefix.length)
  const sep = sepOf(to)
  const tail = rest.split('/').join(sep)
  return to.endsWith(sep) || to.endsWith('/') || to.endsWith('\\') ? to + tail : to + sep + tail
}

/** 批量迁移（收藏、展开状态、撤销历史 key 等场景） */
export function remapPaths(paths: string[], from: string, to: string): string[] {
  return paths.map((p) => remapPath(p, from, to))
}

/**
 * 绝对路径 → 相对项目根的规范化相对路径（统一 `/` 分隔符）。
 *
 * 用于撤销历史命名（T1）：撤销文件名要跨平台/路径风格稳定，不能带盘符、
 * 不能混用正反斜杠，否则同一文件在不同路径风格下 undo 文件名不同。
 *
 * - `toRelativePath('E:\\book', 'E:\\book\\第1章.md')` → `第1章.md`
 * - `toRelativePath('E:/book', 'E:/book/卷1/第2章.md')` → `卷1/第2章.md`
 * - path 不在 root 内时，返回 normalize(path) 去盘符后的兜底（仍统一 `/`）。
 */
export function toRelativePath(root: string, path: string): string {
  const nr = normalize(root)
  const np = normalize(path)
  if (!nr || !np) return np
  const prefix = nr.endsWith('/') ? nr : nr + '/'
  if (np.startsWith(prefix)) return np.slice(prefix.length)
  // 不在 root 内：退化为「去盘符 + 统一正斜杠」的相对表示（尽量稳定）
  return np.replace(/^[A-Za-z]:/, '')
}

/**
 * 相对路径 → 撤销历史文件名（encodeURIComponent + .json）。
 *
 * `encodeURIComponent` 的保留集 `A-Za-z0-9-_.!~*'()` 不编码，`\` `/` 空格等编码。
 * 这是撤销历史（.stats/undo/*.json）文件名的唯一真源，Rust 端 `encode_uri_component`
 * 必须与它逐字节一致（见 REBUILD-MODULE-backup.md §2.3 逐字符对齐向量表）。
 */
export function undoFileName(relPath: string): string {
  return encodeURIComponent(relPath) + '.json'
}
