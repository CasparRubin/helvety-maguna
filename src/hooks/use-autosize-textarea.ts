import { useLayoutEffect, type RefObject } from "react";

/** ~one text row at `text-sm` with default textarea padding (`py-2`). */
export const AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX = 40;

/** Sets the textarea height from `scrollHeight`, but not below `minHeightPx`. */
export function syncTextareaHeight(el: HTMLTextAreaElement, minHeightPx: number): void {
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, minHeightPx)}px`;
}

/** Keeps a textarea height in sync with its content; floor defaults to one row. */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minHeightPx: number = AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    syncTextareaHeight(el, minHeightPx);
  }, [ref, value, minHeightPx]);
}
