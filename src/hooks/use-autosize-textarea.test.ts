import { describe, expect, it } from "vitest";

import {
  AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX,
  syncTextareaHeight,
} from "./use-autosize-textarea";

function mockTextarea(scrollHeight: number): HTMLTextAreaElement {
  const style: { height: string } = { height: "" };
  return {
    style,
    scrollHeight,
  } as HTMLTextAreaElement;
}

describe("syncTextareaHeight", () => {
  it("uses scrollHeight when it exceeds the minimum", () => {
    const el = mockTextarea(120);
    syncTextareaHeight(el, AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX);
    expect(el.style.height).toBe("120px");
  });

  it("uses the minimum when scrollHeight is smaller", () => {
    const el = mockTextarea(24);
    syncTextareaHeight(el, AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX);
    expect(el.style.height).toBe(`${AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX}px`);
  });

  it("uses either value when scrollHeight equals the minimum", () => {
    const el = mockTextarea(AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX);
    syncTextareaHeight(el, AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX);
    expect(el.style.height).toBe(`${AUTOSIZE_TEXTAREA_MIN_HEIGHT_PX}px`);
  });
});
