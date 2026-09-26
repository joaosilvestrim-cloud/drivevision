import { useRef, useState, type PointerEvent } from "react";

// Pointer capture keeps touch/pen and mouse interactions on the handle.
// Cancellation never commits; only one history entry is created on release.
export function useBoardPointer(
  onDrop: (id: string, target: string) => void,
  selector: string,
) {
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    target: string | null;
    active: boolean;
  } | null>(null);
  const [state, setState] = useState<{
    id: string;
    target: string | null;
  } | null>(null);
  const cancel = () => {
    drag.current = null;
    setState(null);
  };
  return {
    state,
    handle: (id: string) => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0 || !e.isPrimary) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          id,
          x: e.clientX,
          y: e.clientY,
          target: null,
          active: false,
        };
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const d = drag.current;
        if (!d) return;
        if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7)
          return;
        d.active = true;
        const target =
          document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>(selector)?.dataset.dropId ?? null;
        d.target = target;
        setState((prev) =>
          prev?.target === target && prev.id === d.id
            ? prev
            : { id: d.id, target },
        );
        if (e.clientY < 90) window.scrollBy(0, -20);
        if (e.clientY > window.innerHeight - 90) window.scrollBy(0, 20);
      },
      onPointerUp() {
        const d = drag.current;
        cancel();
        if (d?.active && d.target) onDrop(d.id, d.target);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
        if (e.key === "Escape") cancel();
      },
    }),
  };
}
