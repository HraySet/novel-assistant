/**
 * 测试用文件树 fixture。
 *
 * 刻意构造出真实项目里会出现的全部干扰项：
 * - 设定目录（角色 / 大纲）与正文混在同一层
 * - `_` 前缀文件（_project.md）
 * - 隐藏目录（.stats，实际由 Rust list_dir 过滤，这里验证策略层也不漏）
 * - 非文本文件（封面.png）
 * - 多层嵌套与空目录
 */
import type { FileNode } from '../../../types/file'

const ROOT = String.raw`E:\书\长篇`

function file(parent: string, name: string, opts: Partial<FileNode> = {}): FileNode {
  return { name, path: `${parent}\\${name}`, isDir: false, wordCount: 100, ...opts }
}

function dir(parent: string, name: string, children: FileNode[] = []): FileNode {
  return { name, path: `${parent}\\${name}`, isDir: true, children }
}

const VOL1 = `${ROOT}\\第一卷`

export const FIXTURE_ROOT = ROOT

export const FIXTURE_TREE: FileNode[] = [
  dir(ROOT, '第一卷', [
    file(VOL1, '第1章.md'),
    file(VOL1, '第2章.md'),
    file(VOL1, '番外.txt', { wordCount: 50 }),
    dir(VOL1, '废弃'),
  ]),
  file(ROOT, '第3章.md'),
  file(ROOT, '_project.md', { wordCount: 20 }),
  dir(ROOT, '角色', [file(`${ROOT}\\角色`, '张三.md'), file(`${ROOT}\\角色`, '李四.md')]),
  dir(ROOT, '大纲', [file(`${ROOT}\\大纲`, '主线.md')]),
  dir(ROOT, '.stats', [file(`${ROOT}\\.stats`, 'stats.json')]),
  file(ROOT, '封面.png'),
]

/** chapters / exportable 策略的期望输出（按树顺序） */
export const CHAPTER_PATHS = [
  `${VOL1}\\第1章.md`,
  `${VOL1}\\第2章.md`,
  `${VOL1}\\番外.txt`,
  `${ROOT}\\第3章.md`,
]
