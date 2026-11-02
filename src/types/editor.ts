/**
 * 编辑器对外能力契约。
 *
 * composable 与 App 之间通过这个接口交互，而不是 import MdEditor 组件本身——
 * 避免「逻辑层反向依赖视图层」，也让这类编排逻辑可以脱离组件做类型检查。
 * MdEditor 通过 `defineExpose` 暴露的方法需覆盖本接口。
 */
export interface WriterEditorApi {
  /** 在光标处插入；与已有内容重复时跳过 */
  insertIfNotDuplicate(text: string): boolean
  /** 替换指定范围（校验原文一致）；返回是否执行 */
  replaceRange(from: number, to: number, text: string, expectedOriginal?: string): boolean
  /** 立即执行挂起的自动保存 */
  flushPendingSave(): Promise<void>
  /** 落盘撤销历史 */
  flushUndo(): void
  undoCommand(): boolean
  redoCommand(): boolean
}
