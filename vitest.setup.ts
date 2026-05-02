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
}
