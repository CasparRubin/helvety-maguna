import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = vi.fn();
  // Base UI ScrollArea calls getAnimations in jsdom; provide a no-op stub.
  if (typeof Element.prototype.getAnimations !== "function") {
    Element.prototype.getAnimations = () => [];
  }
}
