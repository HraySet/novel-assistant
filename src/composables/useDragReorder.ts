import { ref } from "vue";

/**
 * Pointer-based drag-to-reorder composable.
 * Returns reactive drag state and an onPointerDown handler to bind to a drag handle.
 *
 * @param onReorder — called with (fromIndex, toIndex) when a valid drop occurs
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const dragIdx = ref<number | null>(null);
  const dragOverIdx = ref<number | null>(null);

  function onPointerDown(idx: number, e: MouseEvent) {
    const startY = e.clientY;
    const startIdx = idx;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientY - startY) > 5) {
        moved = true;
        dragIdx.value = startIdx;
        document.body.style.cursor = "grabbing";
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      if (moved && dragOverIdx.value !== null && dragOverIdx.value !== startIdx) {
        onReorder(startIdx, dragOverIdx.value);
      }
      dragIdx.value = null;
      dragOverIdx.value = null;
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return { dragIdx, dragOverIdx, onPointerDown };
}
