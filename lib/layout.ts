import type { Visual } from "./visual-builder";
export function resizedVisual(
  v: Visual,
  dx: number,
  dy: number,
  width: number,
): Pick<Visual, "span" | "height"> {
  const wanted = v.span + (dx / Math.max(1, width)) * 12;
  const spans: Visual["span"][] = [4, 6, 8, 12];
  return {
    span: spans.reduce((a, b) =>
      Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b,
    ),
    height: Math.max(
      ["kpi", "text"].includes(v.type) ? 180 : 280,
      Math.min(900, Math.round((v.height + dy) / 20) * 20),
    ),
  };
}
export function gaugeProgress(value: number | null, target?: number) {
  if (
    value === null ||
    !Number.isFinite(value) ||
    target === undefined ||
    !Number.isFinite(target) ||
    target <= 0 ||
    value < 0
  )
    return null;
  return { ratio: value / target, arc: Math.min(1, value / target) };
}
