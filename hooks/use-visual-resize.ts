import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { Visual } from "@/lib/visual-builder";
import { resizedVisual } from "@/lib/layout";
export function useVisualResize(
  onResize: (id: string, patch: Pick<Visual, "span" | "height">) => void,
) {
  const gesture = useRef<{
    visual: Visual;
    x: number;
    y: number;
    width: number;
    patch: Pick<Visual, "span" | "height">;
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    span: Visual["span"];
    height: number;
  } | null>(null);
  const cancel = () => {
    gesture.current = null;
    setPreview(null);
  };
  return {
    preview,
    handle: (v: Visual) => ({
      onPointerDown(e: PointerEvent<HTMLButtonElement>) {
        if (e.button !== 0 || !e.isPrimary) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          visual: v,
          x: e.clientX,
          y: e.clientY,
          width: e.currentTarget
            .closest(".visual-grid")!
            .getBoundingClientRect().width,
          patch: { span: v.span, height: v.height },
        };
      },
      onPointerMove(e: PointerEvent<HTMLButtonElement>) {
        const g = gesture.current;
        if (!g) return;
        g.patch = resizedVisual(
          g.visual,
          e.clientX - g.x,
          e.clientY - g.y,
          g.width,
        );
        setPreview({ id: v.id, ...g.patch });
      },
      onPointerUp() {
        const g = gesture.current;
        cancel();
        if (
          g &&
          (g.patch.span !== g.visual.span || g.patch.height !== g.visual.height)
        )
          onResize(g.visual.id, g.patch);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
        if (e.key === "Escape") {
          cancel();
          return;
        }
        const spans: Visual["span"][] = [4, 6, 8, 12],
          index = spans.indexOf(v.span);
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        onResize(v.id, {
          span:
            e.key === "ArrowLeft"
              ? spans[Math.max(0, index - 1)]
              : e.key === "ArrowRight"
                ? spans[Math.min(3, index + 1)]
                : v.span,
          height: Math.max(
            ["kpi", "text"].includes(v.type) ? 180 : 280,
            Math.min(
              900,
              v.height +
                (e.key === "ArrowUp" ? -20 : e.key === "ArrowDown" ? 20 : 0),
            ),
          ),
        });
      },
    }),
  };
}
