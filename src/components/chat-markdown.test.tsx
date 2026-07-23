/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders plain text in a paragraph (not a pre)", () => {
    const { container } = render(<ChatMarkdown>Hello Maguna</ChatMarkdown>);
    expect(screen.getByText("Hello Maguna")).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Hello Maguna");
  });

  it("renders a markdown heading", () => {
    render(<ChatMarkdown>{"## Title"}</ChatMarkdown>);
    expect(
      screen.getByRole("heading", { level: 2, name: "Title" }),
    ).toBeInTheDocument();
  });

  it("preserves single newlines in plain text paragraphs", () => {
    const { container } = render(<ChatMarkdown>{"Line one\nLine two"}</ChatMarkdown>);
    const root = container.firstElementChild;
    expect(root?.className).toMatch(/\[&_p\]:whitespace-pre-wrap/);
    expect(container.querySelector("p")?.textContent).toBe("Line one\nLine two");
  });

  it("renders an incomplete fenced code block while streaming", () => {
    const { container } = render(
      <ChatMarkdown isAnimating>{"```ts\nconst x = 1"}</ChatMarkdown>,
    );
    expect(container.textContent).toContain("const x = 1");
  });

  it("sets a streaming caret only while isAnimating", async () => {
    const idle = render(<ChatMarkdown>Done</ChatMarkdown>);
    const idleRoot = idle.container.firstElementChild as HTMLElement;
    expect(idleRoot.style.getPropertyValue("--streamdown-caret")).toBe("");
    idle.unmount();

    const streaming = render(<ChatMarkdown isAnimating>Partial</ChatMarkdown>);
    await waitFor(() => {
      const streamingRoot = streaming.container.firstElementChild as HTMLElement;
      expect(streamingRoot.style.getPropertyValue("--streamdown-caret")).toMatch(
        /▋|█|●/,
      );
    });
  });
});
