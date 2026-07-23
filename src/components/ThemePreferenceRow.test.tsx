/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThemeProvider, THEME_STORAGE_KEY } from "@/context/theme-context";

import { ThemePreferenceRow } from "./ThemePreferenceRow";

describe("ThemePreferenceRow", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("persists the chosen theme and toggles the dark class", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.documentElement.classList.remove("dark");

    render(
      <ThemeProvider>
        <ThemePreferenceRow />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^dark$/i }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: /^dark$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /^light$/i }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
