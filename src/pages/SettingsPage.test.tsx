/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GuardrailsSettings } from "@/lib/types";
import { SettingsPage } from "./SettingsPage";
import * as TauriApi from "@/lib/tauri-api";

vi.mock("@/lib/tauri-api", () => ({
  invoke: vi.fn(),
}));

function renderSettings(invokePayload: GuardrailsSettings, thinkingEnabled = false) {
  vi.mocked(TauriApi.invoke).mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === "get_guardrails_settings") {
      return Promise.resolve(invokePayload);
    }
    if (cmd === "get_model_thinking_settings") {
      return Promise.resolve({ enabled: thinkingEnabled });
    }
    if (cmd === "set_model_thinking_settings") {
      return Promise.resolve(undefined);
    }
    return Promise.reject(
      new Error(
        `unexpected invoke in SettingsPage test: ${cmd} ${JSON.stringify(args ?? null)}`,
      ),
    );
  });
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(TauriApi.invoke).mockReset();
  });

  const baseBuiltin = "built-in-parity-text-from-rust-stub\nline two";

  it("loads Helvety link, guardrails reference, and Model library link from invoke", async () => {
    renderSettings({
      enabled: true,
      customText: null,
      builtInPolicyText: baseBuiltin,
    });

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    await waitFor(() => {
      expect(TauriApi.invoke).toHaveBeenCalledWith("get_guardrails_settings");
      expect(TauriApi.invoke).toHaveBeenCalledWith("get_model_thinking_settings");
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Thinking off/i })).toBeTruthy();
      const builtInArea = screen.getByLabelText(
        /Built-in Maguna policy/i,
      ) as HTMLTextAreaElement;
      expect(builtInArea.readOnly).toBe(true);
      expect(builtInArea.value).toContain("built-in-parity-text-from-rust-stub");
    });

    expect(screen.getByRole("link", { name: /Helvety/i })).toHaveAttribute(
      "href",
      "https://helvety.com",
    );
    expect(screen.getByRole("link", { name: /Model library/i })).toHaveAttribute(
      "href",
      "/models",
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Guardrails are on using the built-in policy below/i),
      ).toBeTruthy();
    });

    expect(
      screen.getByText(/To replace the built-in prepended policy with custom wording/i),
    ).toBeInTheDocument();
  });

  it("shows Helvety-authored acceptable use summary without vendor policy link-outs", async () => {
    renderSettings({
      enabled: true,
      customText: null,
      builtInPolicyText: baseBuiltin,
    });

    await waitFor(() => {
      expect(TauriApi.invoke).toHaveBeenCalledWith("get_guardrails_settings");
    });

    expect(screen.getByText("Acceptable use (summary)")).toBeInTheDocument();
    expect(screen.getByText(/Serious illegality/i)).toBeInTheDocument();
    expect(screen.getByText(/Child safety/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Practical habits when working with probabilistic outputs/i),
    ).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /OpenAI/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/openai\.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/anthropic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/policies\.google/i)).not.toBeInTheDocument();
  });

  it("shows custom active copy and readonly custom textarea", async () => {
    renderSettings({
      enabled: true,
      customText: "USER CUSTOM POLICY\nline 2",
      builtInPolicyText: baseBuiltin,
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Guardrails are on with your custom policy \(prepended ahead of each mode prompt\)\./i,
        ),
      ).toBeTruthy();
    });
    await waitFor(() => {
      const customArea = screen.getByLabelText(
        /Your custom guardrail policy/i,
      ) as HTMLTextAreaElement;
      expect(customArea.readOnly).toBe(true);
      expect(customArea.value).toBe("USER CUSTOM POLICY\nline 2");
    });
  });

  it("surfaces invoke errors in a destructive alert", async () => {
    vi.mocked(TauriApi.invoke).mockRejectedValueOnce(new Error("bridge down"));
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const errorText = screen.getByText(/bridge down/i);
      const alert = errorText.closest("[data-slot='alert']");
      expect(alert).toBeTruthy();
      expect(alert).toHaveAttribute("role", "alert");
      expect(alert?.className).toMatch(/text-destructive/);
    });
  });

  it("toggles model thinking and persists via set_model_thinking_settings", async () => {
    renderSettings(
      {
        enabled: true,
        customText: null,
        builtInPolicyText: baseBuiltin,
      },
      false,
    );

    const btn = await screen.findByRole("button", { name: /Thinking off/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(TauriApi.invoke).toHaveBeenCalledWith("set_model_thinking_settings", {
        value: { enabled: true },
      });
    });
    expect(
      await screen.findByRole("button", { name: /Thinking on/i }),
    ).toBeInTheDocument();
  });

  it("shows Thinking on when settings load with thinking enabled", async () => {
    renderSettings(
      {
        enabled: true,
        customText: null,
        builtInPolicyText: baseBuiltin,
      },
      true,
    );

    expect(
      await screen.findByRole("button", { name: /Thinking on/i }),
    ).toBeInTheDocument();
  });
});
