import { useLayoutEffect, type RefObject } from "react";

const DEFAULT_MIN_PX = 56;

/** Sets the textarea height from `scrollHeight`, but not below `minHeightPx`. */
export function syncTextareaHeight(el: HTMLTextAreaElement, minHeightPx: number): void {
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, minHeightPx)}px`;
}

/** Keeps a textarea height in sync with its content; floor height defaults to ~2 lines. */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minHeightPx: number = DEFAULT_MIN_PX,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    syncTextareaHeight(el, minHeightPx);
  }, [ref, value, minHeightPx]);
}
