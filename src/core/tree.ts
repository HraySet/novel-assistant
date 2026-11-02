/**
 * 文件树遍历：全应用唯一的遍历与过滤入口。
 *
 * 为什么要有这个模块：
 * 重构前前端有 5 处各自实现的文件树遍历，过滤规则各不相同——
 * `App.orderedFiles`、`useAiContext.orderedChapters`、`detection.collectRecentChapters`、
 * `useExport.collectFilePaths`（**唯一没有排除设定目录的实现**，导致导出的 EPUB
 * 里混进角色卡与大纲）、`SearchModal.collectFiles`。
 * 规则分散的直接后果是：改一处漏一处，bug 以「导出内容不对」这种形式暴露。
 *
 * 设计要点：
 * - 遍历与"要什么"解耦：遍历只有一份，差异通过 TreePolicy 表达；
 * - 返回值统一为 TreeEntry，调用方各自从节点投影所需字段，不再各自遍历；
 * - 不做任何排序（树本身已由 file store 按自然序整理），保证输出顺序可预期。
 */
import type { FileNode } from '../types/file'
import { joinPath } from './paths'

export type TreePolicyName = 'chapters' | 'exportable' | 'settings' | 'allFiles'

export interface TreePolicy {
  /** 是否把目录本身也作为结果返回 */
  includeDirs: boolean
  /** 扩展名白名单（含点、小写）；null 表示不限 */
  extensions: string[] | null
  /** 目录名黑名单：命中则整棵子树跳过 */
  excludeDirs: string[]
  /** 名称前缀黑名单（文件与目录都适用） */
  excludePrefixes: string[]
}

/**
 * 设定目录的别名集合。
 *
 * 角色卡、大纲是「设定」，不是正文。但目录名是用户自己起的：有人叫「人物」、
 * 有人叫「设定」、有人叫「世界观」。只认「角色/大纲」两个字面值的话，用户一旦
 * 用了别的名字，这些设定文件就会被当成正文，混进导出、章节数与前情提要。
 *
 * 这里维护一份常见别名 → 规范名 的映射，正文排除时命中任意别名即排除；
 * 读取设定时按规范名优先、别名回退去定位目录。
 */
export const SETTING_DIR_ALIASES: Record<string, string> = {
  角色: '角色',
  人物: '角色',
  角色卡: '角色',
  角色设定: '角色',
  大纲: '大纲',
  设定: '大纲',
  剧情: '大纲',
  情节: '大纲',
  剧情大纲: '大纲',
}

/** 规范目录名：角色 / 大纲 */
export type SettingDirKind = '角色' | '大纲'

/** 判断一个目录名是不是「角色」类的设定目录（含别名） */
export function isCharacterDir(name: string): boolean {
  return SETTING_DIR_ALIASES[name] === '角色'
}

/** 判断一个目录名是不是「大纲」类的设定目录（含别名） */
export function isOutlineDir(name: string): boolean {
  return SETTING_DIR_ALIASES[name] === '大纲'
}

/** 判断一个目录名是否属于任一设定目录（正文排除用） */
export function isSettingDir(name: string): boolean {
  return name in SETTING_DIR_ALIASES
}

/**
 * 预置策略。新增场景请优先复用；确需特例时用 walkFiles(nodes, { ...TREE_POLICIES.x, ...覆盖 })。
 */
export const TREE_POLICIES: Record<TreePolicyName, TreePolicy> = {
  /** 正文：md/txt，排除设定目录（含别名）与 `_` 前缀（_project.md） */
  chapters: {
    includeDirs: false,
    extensions: ['.md', '.txt'],
    excludeDirs: Object.keys(SETTING_DIR_ALIASES),
    excludePrefixes: ['_', '.'],
  },
  /**
   * 导出交付物：规则必须与 chapters 一致。
   * 单独保留这个名字是为了让「导出包含哪些文件」成为一个显式决策点。
   */
  exportable: {
    includeDirs: false,
    extensions: ['.md', '.txt'],
    excludeDirs: Object.keys(SETTING_DIR_ALIASES),
    excludePrefixes: ['_', '.'],
  },
  /** 设定文件（角色卡 / 大纲目录内部的 md/txt） */
  settings: {
    includeDirs: false,
    extensions: ['.md', '.txt'],
    excludeDirs: [],
    excludePrefixes: ['.'],
  },
  /** 浏览与搜索：所有文件与目录（隐藏项除外） */
  allFiles: {
    includeDirs: true,
    extensions: null,
    excludeDirs: [],
    excludePrefixes: ['.'],
  },
}

export interface TreeEntry {
  node: FileNode
  name: string
  /** 绝对路径（保持原有分隔符风格，可直接用于 IPC） */
  path: string
  /** 节点自身的相对路径，正斜杠风格，如 `第一卷/第1章.md` */
  relPath: string
  /** 所在目录的相对路径，根目录为空串 */
  parentRelPath: string
  /** 根下第一层 = 0 */
  depth: number
  isDir: boolean
  wordCount?: number
}

function hasAllowedExtension(name: string, extensions: string[] | null): boolean {
  if (extensions === null) return true
  const lower = name.toLowerCase()
  return extensions.some((ext) => lower.endsWith(ext))
}

function isExcludedName(name: string, policy: TreePolicy): boolean {
  return policy.excludePrefixes.some((prefix) => prefix !== '' && name.startsWith(prefix))
}

/**
 * 遍历文件树，按策略返回扁平结果。
 *
 * @param nodes 文件树（file store 的 tree，或任意子树的 children）
 * @param policy 过滤策略，默认 allFiles
 */
export function walkFiles(
  nodes: FileNode[],
  policy: TreePolicy = TREE_POLICIES.allFiles,
): TreeEntry[] {
  const out: TreeEntry[] = []

  const visit = (list: FileNode[], parentRelPath: string, depth: number) => {
    for (const node of list) {
      if (!node || !node.name) continue
      if (isExcludedName(node.name, policy)) continue
      const relPath = parentRelPath ? `${parentRelPath}/${node.name}` : node.name

      if (node.isDir) {
        // 目录黑名单命中：整棵子树跳过（角色/大纲 内的文件不算正文）
        if (policy.excludeDirs.includes(node.name)) continue
        if (policy.includeDirs) {
          out.push({
            node,
            name: node.name,
            path: node.path,
            relPath,
            parentRelPath,
            depth,
            isDir: true,
          })
        }
        if (node.children && node.children.length > 0) visit(node.children, relPath, depth + 1)
        continue
      }

      if (!hasAllowedExtension(node.name, policy.extensions)) continue
      out.push({
        node,
        name: node.name,
        path: node.path,
        relPath,
        parentRelPath,
        depth,
        isDir: false,
        wordCount: node.wordCount,
      })
    }
  }

  visit(nodes, '', 0)
  return out
}

/** 便利投影：只取路径数组（导出、批量读取等场景） */
export function pathsOf(entries: TreeEntry[]): string[] {
  return entries.map((e) => e.path)
}

/** 便利投影：正文章节路径，按树顺序 */
export function chapterPaths(nodes: FileNode[]): string[] {
  return pathsOf(walkFiles(nodes, TREE_POLICIES.chapters))
}

/**
 * 按策略汇总字数（默认只统计正文）。
 *
 * 项目库卡片上的「全书字数」用它：此前手工遍历整棵树把 角色/ 大纲/ 与 _project.md
 * 也算进去，导致「全书字数」比实际正文大一截，且与顶栏章节数口径不一致。
 */
export function totalWords(
  nodes: FileNode[],
  policy: TreePolicy = TREE_POLICIES.chapters,
): number {
  return walkFiles(nodes, policy).reduce((sum, e) => sum + (e.wordCount ?? 0), 0)
}

/** 便利投影：单个目录下的文件条目（角色卡、大纲目录读取） */
export function listFilesIn(dirPath: string, names: string[]): TreeEntry[] {
  const nodes: FileNode[] = names.map((name) => ({
    name,
    path: joinPath(dirPath, name),
    isDir: false,
  }))
  return walkFiles(nodes, TREE_POLICIES.settings)
}
