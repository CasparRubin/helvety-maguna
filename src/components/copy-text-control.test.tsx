/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyTextControl } from "./copy-text-control";

describe("CopyTextControl", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    } as unknown as Navigator);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("disables the button when text is empty", () => {
    render(<CopyTextControl text="" />);
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeDisabled();
  });

  it("enables the button when text is non-empty", () => {
    render(<CopyTextControl text="hello" />);
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeEnabled();
  });

  it("disables the button when disabled is true even if text is set", () => {
    render(<CopyTextControl text="hello" disabled />);
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeDisabled();
  });

  it("copies text and shows copied state", async () => {
    render(<CopyTextControl text="hello world" />);
    fireEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith("hello world");
    });

    expect(
      screen.getByRole("button", { name: /^copied$/i }).getAttribute("aria-label"),
    ).toBe("Copied");
  });

  it("does not enter copied state when clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<CopyTextControl text="x" />);
    fireEvent.click(screen.getByRole("button", { name: /copy to clipboard/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });

    expect(screen.queryByRole("button", { name: /^copied$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeDefined();
  });
});
