import { useCallback, useEffect, useRef, type RefObject } from "react";

/** Distance from bottom (px) within which we treat the user as "pinned". */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

/** Base UI ScrollArea viewport under a slot root. */
export function getScrollAreaViewport(root: HTMLElement | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;
}

export function isNearBottom(
  el: HTMLElement,
  thresholdPx: number = STICK_TO_BOTTOM_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

type UseStickToBottomOptions = {
  /** When false, skip follow-scroll and scroll listeners. */
  enabled: boolean;
  /** Identity that changes when content grows (e.g. messages + busy). */
  contentKey: unknown;
};

/**
 * Keep a ScrollArea viewport stuck to the bottom while content grows,
 * unless the user scrolls away. Call `pin()` when starting a new turn.
 */
export function useStickToBottom(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, contentKey }: UseStickToBottomOptions,
): { pin: () => void } {
  const pinnedRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  /** Skip user-intent updates caused by our own programmatic scrollTop writes. */
  const ignoreScrollRef = useRef(false);

  const scrollToBottomNow = useCallback(() => {
    const viewport = getScrollAreaViewport(containerRef.current);
    if (!viewport) return;
    ignoreScrollRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    // scroll events from assigning scrollTop run sync; clear immediately after
    ignoreScrollRef.current = false;
  }, [containerRef]);

  const scheduleScrollToBottom = useCallback(() => {
    if (!pinnedRef.current) return;
    if (rafRef.current != null) return;

    let settled = false;
    const id = requestAnimationFrame(() => {
      settled = true;
      rafRef.current = null;
      if (!pinnedRef.current) return;
      scrollToBottomNow();
    });
    // Async rAF: remember the id so we can coalesce. Sync rAF (tests): the
    // callback already ran and cleared state — do not overwrite with a stale id.
    if (!settled) {
      rafRef.current = id;
    }
  }, [scrollToBottomNow]);

  const pin = useCallback(() => {
    pinnedRef.current = true;
    scrollToBottomNow();
  }, [scrollToBottomNow]);

  // Track user scroll intent; retry attach after paint when the viewport mounts later.
  useEffect(() => {
    if (!enabled) return;

    let viewport: HTMLElement | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    const onScroll = () => {
      if (!viewport || ignoreScrollRef.current) return;
      pinnedRef.current = isNearBottom(viewport);
    };

    const detach = () => {
      if (viewport) {
        viewport.removeEventListener("scroll", onScroll);
        viewport = null;
      }
      ro?.disconnect();
      ro = null;
    };

    const attach = () => {
      if (cancelled) return;
      const next = getScrollAreaViewport(containerRef.current);
      if (!next) return;
      if (next === viewport) return;

      detach();
      viewport = next;
      viewport.addEventListener("scroll", onScroll, { passive: true });

      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          if (pinnedRef.current) scheduleScrollToBottom();
        });
        // Observe the scrollable content root (first child) when present.
        const content = viewport.firstElementChild;
        if (content) {
          ro.observe(content);
        }
        ro.observe(viewport);
      }
    };

    attach();
    const raf = requestAnimationFrame(attach);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      detach();
    };
  }, [enabled, containerRef, scheduleScrollToBottom]);

  useEffect(() => {
    if (!enabled) return;
    scheduleScrollToBottom();
  }, [enabled, contentKey, scheduleScrollToBottom]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return { pin };
}
