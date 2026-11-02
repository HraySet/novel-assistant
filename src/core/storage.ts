/**
 * localStorage 的安全访问层。
 *
 * 为什么需要它：store 在初始化时直接 `localStorage.getItem(...)` 会让模块
 * 只能在浏览器环境实例化——测试（node 环境）里一碰就抛 ReferenceError，
 * 于是「这个 store 好不好测」直接决定「它的状态逻辑能不能被测试覆盖」。
 *
 * 另外 localStorage 在隐私模式/配额满时会抛异常，统一 try/catch 兜住，
 * 避免一个非关键的偏好项把整个 store 初始化搞崩。
 */

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

export function readLocal(key: string): string | null {
  if (!hasStorage()) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 配额满/隐私模式：忽略，不影响主流程 */
  }
}

export function removeLocal(key: string): void {
  if (!hasStorage()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}

/** 读取并解析 JSON；解析失败或不存在时返回 fallback */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readLocal(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeLocal(key, JSON.stringify(value))
  } catch {
    /* 无法序列化时忽略 */
  }
}
