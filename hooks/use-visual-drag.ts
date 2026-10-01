import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

type Gesture = {
  id: string;
  pointer: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  touch: boolean;
  scrolling: boolean;
  active: boolean;
  order: string[];
  source: HTMLElement;
  ghost: HTMLElement | null;
  lastY: number;
  latch: DOMRect | null;
  timer: number;
  frame: number;
};

// Preview order stays local to the gesture. Release creates one undo entry; Esc/cancel creates none.
export function useVisualDrag(
  ids: string[],
  onCommit: (ids: string[]) => void,
) {
  const grid = useRef<HTMLDivElement>(null);
  const current = useRef({ ids, onCommit });
  current.current = { ids, onCommit };
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const before = useRef(new Map<string, DOMRect>());
  const animations = useRef<Animation[]>([]);
  const suppressClickUntil = useRef(0);
  const cards = () =>
    Array.from(
      grid.current?.querySelectorAll<HTMLElement>("[data-visual-drop]") || [],
    );
  const snapshot = () => {
    before.current = new Map(
      cards().map((el) => [el.dataset.dropId!, el.getBoundingClientRect()]),
    );
  };

  useLayoutEffect(() => {
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const el of cards()) {
        const old = before.current.get(el.dataset.dropId!),
          next = el.getBoundingClientRect();
        if (!old) continue;
        const dx = old.left - next.left,
          dy = old.top - next.top;
        if (Math.abs(dx) + Math.abs(dy) > 1)
          animations.current.push(
            el.animate(
              [
                { transform: `translate(${dx}px,${dy}px)` },
                { transform: "translate(0,0)" },
              ],
              { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
            ),
          );
      }
    }
    before.current.clear();
  }, [preview, ids.join("\0")]);

  useEffect(() => {
    const finish = (commit: boolean) => {
      const g = gesture.current;
      if (!g) return;
      clearTimeout(g.timer);
      cancelAnimationFrame(g.frame);
      gesture.current = null;
      if (grid.current?.hasPointerCapture(g.pointer))
        grid.current.releasePointerCapture(g.pointer);
      if (g.active || g.scrolling)
        suppressClickUntil.current = performance.now() + 400;
      if (g.active) {
        if (g.order.some((id, i) => current.current.ids[i] !== id)) snapshot();
        if (commit && g.order.some((id, i) => current.current.ids[i] !== id))
          current.current.onCommit(g.order);
        const destination = cards()
          .find((el) => el.dataset.dropId === g.id)
          ?.getBoundingClientRect();
        if (
          commit &&
          destination &&
          g.ghost &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          const ghost = g.ghost;
          const anim = ghost.animate(
            [
              { transform: ghost.style.transform },
              {
                transform: `translate3d(${destination.left}px,${destination.top}px,0)`,
              },
            ],
            { duration: 160, easing: "ease-out", fill: "forwards" },
          );
          anim.finished.then(() => ghost.remove()).catch(() => ghost.remove());
        } else g.ghost?.remove();
      }
      setActive(null);
      setPreview(null);
      document.body.classList.remove("visual-drag-in-progress");
    };
    const tick = () => {
      const g = gesture.current;
      if (!g?.active) return;
      // Fixed grab offset is saved on the ghost so reflow cannot make it jump.
      if (g.ghost)
        g.ghost.style.transform = `translate3d(${g.x - Number(g.ghost.dataset.grabX)}px,${g.y - Number(g.ghost.dataset.grabY)}px,0)`;
      const edge = 64,
        speed =
          g.y < edge
            ? -Math.ceil((edge - g.y) / 5)
            : g.y > innerHeight - edge
              ? Math.ceil((g.y - innerHeight + edge) / 5)
              : 0;
      if (speed) window.scrollBy(0, Math.max(-20, Math.min(20, speed)));
      if (
        g.latch &&
        (g.x < g.latch.left ||
          g.x > g.latch.right ||
          g.y < g.latch.top ||
          g.y > g.latch.bottom)
      )
        g.latch = null;
      const target = document
        .elementFromPoint(g.x, g.y)
        ?.closest<HTMLElement>("[data-visual-drop]");
      if (
        !g.latch &&
        target &&
        grid.current?.contains(target) &&
        target.dataset.dropId !== g.id
      ) {
        const targetId = target.dataset.dropId!,
          a = g.order.indexOf(g.id),
          b = g.order.indexOf(targetId);
        if (a >= 0 && b >= 0) {
          g.latch = target.getBoundingClientRect();
          snapshot();
          const next = [...g.order];
          [next[a], next[b]] = [next[b], next[a]];
          g.order = next;
          setPreview(next);
        }
      }
      g.frame = requestAnimationFrame(tick);
    };
    const activate = (g: Gesture) => {
      if (gesture.current !== g || g.scrolling || g.active) return;
      g.active = true;
      const rect = g.source.getBoundingClientRect(),
        canvas = g.source.closest<HTMLElement>(".dashboard-canvas");
      const layer = document.createElement("div");
      layer.className = `${canvas?.className || "dashboard-canvas"} visual-drag-layer`;
      layer.setAttribute("aria-hidden", "true");
      layer.inert = true;
      layer.style.setProperty(
        "--board-accent",
        canvas?.style.getPropertyValue("--board-accent") || "#089e7a",
      );
      layer.style.width = `${rect.width}px`;
      layer.style.height = `${rect.height}px`;
      layer.dataset.grabX = String(g.startX - rect.left);
      layer.dataset.grabY = String(g.startY - rect.top);
      const clone = g.source.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-visual-drop");
      clone.removeAttribute("data-drop-id");
      clone.classList.remove("pointer-dragging");
      Object.assign(clone.style, {
        width: "100%",
        height: `${rect.height}px`,
        minHeight: `${rect.height}px`,
        margin: "0",
        transform: "none",
        opacity: "1",
      });
      layer.appendChild(clone);
      document.body.appendChild(layer);
      g.ghost = layer;
      grid.current?.setPointerCapture(g.pointer);
      document.body.classList.add("visual-drag-in-progress");
      setActive(g.id);
      g.frame = requestAnimationFrame(tick);
    };
    const move = (e: globalThis.PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointer !== e.pointerId) return;
      g.x = e.clientX;
      g.y = e.clientY;
      const distance = Math.hypot(g.x - g.startX, g.y - g.startY);
      if (g.touch && !g.active && distance > 8) {
        clearTimeout(g.timer);
        g.scrolling = true;
      }
      if (g.scrolling) {
        window.scrollBy(0, g.lastY - g.y);
        suppressClickUntil.current = performance.now() + 400;
      } else if (!g.touch && !g.active && distance > 7) activate(g);
      g.lastY = g.y;
      if (g.active || g.scrolling) e.preventDefault();
    };
    const up = (e: globalThis.PointerEvent) => {
      if (gesture.current?.pointer === e.pointerId) finish(true);
    };
    const cancel = (e: globalThis.PointerEvent) => {
      if (gesture.current?.pointer === e.pointerId) finish(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current) {
        e.preventDefault();
        finish(false);
      }
    };
    const click = (e: MouseEvent) => {
      if (
        performance.now() < suppressClickUntil.current &&
        grid.current?.contains(e.target as Node)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const startTouch = () => {
      const g = gesture.current;
      if (g) activate(g);
    };
    touchActivate.current = startTouch;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("click", click, true);
    const blur = () => finish(false);
    window.addEventListener("blur", blur);
    return () => {
      const g = gesture.current;
      if (g) {
        clearTimeout(g.timer);
        cancelAnimationFrame(g.frame);
        g.ghost?.remove();
      }
      gesture.current = null;
      animations.current.forEach((a) => a.cancel());
      document.body.classList.remove("visual-drag-in-progress");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const touchActivate = useRef<() => void>(() => {});
  return {
    grid,
    active,
    order: preview || ids,
    bind: (id: string) => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0 || !e.isPrimary || gesture.current) return;
        const target = e.target as HTMLElement;
        if (
          target.closest(
            "button,a,input,select,textarea,[role='button'],[role='slider'],[contenteditable='true']",
          ) &&
          !target.closest(".drag-handle")
        )
          return;
        const source = e.currentTarget;
        const g: Gesture = {
          id,
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          startX: e.clientX,
          startY: e.clientY,
          lastY: e.clientY,
          touch: e.pointerType === "touch",
          scrolling: false,
          active: false,
          order: [...current.current.ids],
          source,
          ghost: null,
          latch: null,
          timer: 0,
          frame: 0,
        };
        gesture.current = g;
        if (g.touch)
          g.timer = window.setTimeout(() => touchActivate.current(), 240);
      },
      onDragStart(e: React.DragEvent) {
        e.preventDefault();
      },
    }),
  };
}
