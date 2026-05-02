import { describe, expect, it } from "vitest";

import { syncTextareaHeight } from "./use-autosize-textarea";

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
    syncTextareaHeight(el, 56);
    expect(el.style.height).toBe("120px");
  });

  it("uses the minimum when scrollHeight is smaller", () => {
    const el = mockTextarea(24);
    syncTextareaHeight(el, 56);
    expect(el.style.height).toBe("56px");
  });

  it("uses either value when scrollHeight equals the minimum", () => {
    const el = mockTextarea(56);
    syncTextareaHeight(el, 56);
    expect(el.style.height).toBe("56px");
  });
});
