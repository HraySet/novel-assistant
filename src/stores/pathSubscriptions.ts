// ── 路径迁移订阅表（T2：把「硬编码调用各派生数据迁移」改成「显式订阅」）──
// 独立成模块，避免 file.ts ↔ stats.ts 的循环依赖：
//   - file.ts 在 applyPathRemap / dropPathsUnder 末尾调用 notifyXxx 通知订阅者；
//   - stats.ts（及其它派生数据 store）在自身初始化时调用 onPathRemap / onPathDrop 注册。
// 模块级单例，使派生数据 store 能在自身初始化时注册，不受 file store 实例化时机影响。

export type PathRemapSubscriber = (mapper: (p: string) => string) => void
export type PathDropSubscriber = (affected: (p: string) => boolean) => void

const remapSubscribers: PathRemapSubscriber[] = []
const dropSubscribers: PathDropSubscriber[] = []

/** 注册「路径重映射」订阅：applyPathRemap 时会以 mapper 通知所有订阅者 */
export function onPathRemap(fn: PathRemapSubscriber): void {
  remapSubscribers.push(fn)
}

/** 注册「路径删除」订阅：dropPathsUnder 时会以 affected 谓词通知所有订阅者 */
export function onPathDrop(fn: PathDropSubscriber): void {
  dropSubscribers.push(fn)
}

/** 通知所有 remap 订阅者（仅 file.ts 内部调用） */
export function notifyRemapSubscribers(mapper: (p: string) => string): void {
  for (const fn of remapSubscribers) fn(mapper)
}

/** 通知所有 drop 订阅者（仅 file.ts 内部调用） */
export function notifyDropSubscribers(affected: (p: string) => boolean): void {
  for (const fn of dropSubscribers) fn(affected)
}

/** 仅供测试：清空订阅表，避免模块级单例在测试间累积 */
export function _resetPathRemapSubscribersForTest(): void {
  remapSubscribers.length = 0
  dropSubscribers.length = 0
}
