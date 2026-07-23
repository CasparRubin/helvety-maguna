/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as tauriApi from "@/lib/tauri-api";
import { ThemeProvider } from "@/context/theme-context";

import App from "./App";

vi.mock("@/lib/tauri-api", () => ({
  invoke: vi.fn(),
}));

function stubMatchMedia(matches = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("App shell branding", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(tauriApi.invoke).mockReset();
  });

  it("shows Maguna, On-Device AI, and a vyyMMdd-HHmm-ss build stamp", async () => {
    stubMatchMedia(false);
    vi.mocked(tauriApi.invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_modes") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    });

    render(
      <MemoryRouter initialEntries={["/mode/chat"]}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Maguna" }),
    ).toBeInTheDocument();
    expect(screen.getByText("On-Device AI")).toBeInTheDocument();
    const stamp = screen.getByTitle(/frontend build time/i);
    expect(stamp).toHaveTextContent(/^v\d{6}-\d{4}-\d{2}$/);
    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith("get_modes");
    });
  });
});
