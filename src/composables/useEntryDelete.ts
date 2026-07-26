import { watch } from "vue";
import { useConfirmDelete } from "./useConfirmDelete";
import type { SettingEntry } from "../stores/settingslib";

/**
 * Reusable delete-confirmation cache for setting entries.
 * Wraps useConfirmDelete per entry, auto-cleans when entries disappear.
 */
export function useEntryDelete(
  entries: () => SettingEntry[],
  onDelete: (id: string) => void,
) {
  const cache = new Map<string, ReturnType<typeof useConfirmDelete>>();

  function delConfirm(id: string) {
    if (!cache.has(id)) {
      cache.set(id, useConfirmDelete(() => onDelete(id)));
    }
    return cache.get(id)!;
  }

  watch(entries, () => {
    const existingIds = new Set(entries().map(e => e.id));
    for (const id of cache.keys()) {
      if (!existingIds.has(id)) {
        cache.get(id)?.dispose();
        cache.delete(id);
      }
    }
  }, { deep: true });

  return { delConfirm };
}
