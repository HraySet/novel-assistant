import { ref } from "vue";

/**
 * "点击进入待确认状态 → 再点一次才真正执行" 的删除模式。
 * 待确认状态在 `timeout` 毫秒后自动复位，且不会有多个 timer 叠加。
 *
 * 用法：
 *   const del = useConfirmDelete(() => lib.deleteEntry(entry.id));
 *   <button @click="del.trigger">{{ del.armed.value ? '确认删除' : '删除' }}</button>
 */
export function useConfirmDelete(onConfirm: () => void, timeout = 2500) {
  const armed = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function trigger() {
    if (!armed.value) {
      armed.value = true;
      clearTimer();
      timer = setTimeout(() => { armed.value = false; }, timeout);
      return;
    }
    clearTimer();
    armed.value = false;
    onConfirm();
  }

  function reset() {
    clearTimer();
    armed.value = false;
  }

  /** 组件卸载时调用，清理定时器防止内存泄漏 */
  function dispose() {
    clearTimer();
  }

  return { armed, trigger, reset, dispose };
}
