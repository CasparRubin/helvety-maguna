/** @vitest-environment jsdom */
import { createRef, type RefObject } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getScrollAreaViewport,
  isNearBottom,
  STICK_TO_BOTTOM_THRESHOLD_PX,
  useStickToBottom,
} from "./use-stick-to-bottom";

function mountScrollArea(initialScrollHeight = 500): {
  root: HTMLDivElement;
  viewport: HTMLDivElement;
  rootRef: RefObject<HTMLDivElement | null>;
  setScrollHeight: (h: number) => void;
  getScrollTop: () => number;
} {
  const root = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.setAttribute("data-slot", "scroll-area-viewport");
  viewport.appendChild(document.createElement("div"));

  let scrollHeight = initialScrollHeight;
  let scrollTop = 0;

  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, get: () => 100 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
        viewport.dispatchEvent(new Event("scroll"));
      },
    },
  });

  root.appendChild(viewport);
  document.body.appendChild(root);
  const rootRef = createRef<HTMLDivElement | null>();
  rootRef.current = root;

  return {
    root,
    viewport,
    rootRef,
    setScrollHeight: (h: number) => {
      scrollHeight = h;
    },
    getScrollTop: () => scrollTop,
  };
}

function stubRaf(): void {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

describe("isNearBottom", () => {
  it("is true when at the bottom", () => {
    const el = {
      scrollHeight: 500,
      scrollTop: 400,
      clientHeight: 100,
    } as HTMLElement;
    expect(isNearBottom(el)).toBe(true);
  });

  it("is true within the threshold", () => {
    const el = {
      scrollHeight: 500,
      scrollTop: 500 - 100 - STICK_TO_BOTTOM_THRESHOLD_PX,
      clientHeight: 100,
    } as HTMLElement;
    expect(isNearBottom(el)).toBe(true);
  });

  it("is false when scrolled up past the threshold", () => {
    const el = {
      scrollHeight: 500,
      scrollTop: 0,
      clientHeight: 100,
    } as HTMLElement;
    expect(isNearBottom(el)).toBe(false);
  });
});

describe("getScrollAreaViewport", () => {
  it("returns null for a null root", () => {
    expect(getScrollAreaViewport(null)).toBeNull();
  });

  it("finds the Base UI viewport slot", () => {
    const { root, viewport } = mountScrollArea();
    expect(getScrollAreaViewport(root)).toBe(viewport);
    root.remove();
  });
});

describe("useStickToBottom", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("follows contentKey updates while pinned near the bottom", async () => {
    stubRaf();
    const { root, rootRef, getScrollTop } = mountScrollArea();

    const { rerender } = renderHook(
      ({ key }) => useStickToBottom(rootRef, { enabled: true, contentKey: key }),
      { initialProps: { key: "a" } },
    );

    await act(async () => {
      rerender({ key: "b" });
    });

    expect(getScrollTop()).toBe(500);
    root.remove();
  });

  it("does not follow contentKey updates after the user scrolls away", async () => {
    stubRaf();
    const { root, viewport, rootRef, setScrollHeight, getScrollTop } =
      mountScrollArea();

    const { rerender } = renderHook(
      ({ key }) => useStickToBottom(rootRef, { enabled: true, contentKey: key }),
      { initialProps: { key: "a" } },
    );

    expect(getScrollTop()).toBe(500);

    await act(async () => {
      viewport.scrollTop = 0;
    });
    expect(getScrollTop()).toBe(0);

    await act(async () => {
      setScrollHeight(800);
      rerender({ key: "grown" });
    });

    expect(getScrollTop()).toBe(0);
    root.remove();
  });

  it("pin() re-enables follow after the user scrolled away", async () => {
    stubRaf();
    const { root, viewport, rootRef, setScrollHeight, getScrollTop } =
      mountScrollArea();

    const { rerender, result } = renderHook(
      ({ key }) => useStickToBottom(rootRef, { enabled: true, contentKey: key }),
      { initialProps: { key: "a" } },
    );

    await act(async () => {
      viewport.scrollTop = 0;
      viewport.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      result.current.pin();
    });
    expect(getScrollTop()).toBe(500);

    await act(async () => {
      setScrollHeight(900);
      rerender({ key: "after-pin" });
    });

    expect(getScrollTop()).toBe(900);
    root.remove();
  });
});
