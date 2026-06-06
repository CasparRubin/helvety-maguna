/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry, GuardrailsSettings, InstalledModel } from "@/lib/types";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";
import * as TauriApi from "@/lib/tauri-api";

import { ModelsPage } from "./ModelsPage";

vi.mock("@/lib/tauri-api", () => ({
  invoke: vi.fn(),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const emptyCatalog: CatalogEntry[] = [];
const emptyInstalled: InstalledModel[] = [];
const guardrailsPayload: GuardrailsSettings = {
  enabled: true,
  customText: null,
  builtInPolicyText: "synced-from-backend-stub-policy",
};

function mockModelsPageInvoke(g: GuardrailsSettings = guardrailsPayload) {
  vi.mocked(TauriApi.invoke).mockImplementation(((cmd: string) => {
    switch (cmd) {
      case "get_catalog":
        return Promise.resolve(emptyCatalog);
      case "list_installed_models":
        return Promise.resolve(emptyInstalled);
      case "get_active_model_id":
        return Promise.resolve(null);
      case "get_guardrails_settings":
        return Promise.resolve(g);
      case "set_guardrails_settings":
        return Promise.resolve(undefined);
      default:
        return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
    }
  }) as typeof TauriApi.invoke);
}

describe("ModelsPage", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(TauriApi.invoke).mockReset();
    vi.mocked(TauriApi.listen).mockReset();
    vi.mocked(TauriApi.listen).mockImplementation(() => Promise.resolve(() => {}));
  });

  it("refresh loads guardrails with catalog and installed models", async () => {
    mockModelsPageInvoke();

    render(
      <MemoryRouter initialEntries={["/models"]}>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(TauriApi.invoke).toHaveBeenCalledWith("get_guardrails_settings");
    });
    expect(TauriApi.invoke).toHaveBeenCalledWith("get_catalog");
    expect(TauriApi.invoke).toHaveBeenCalledWith("list_installed_models");
    expect(TauriApi.invoke).toHaveBeenCalledWith("get_active_model_id");

    await waitFor(() => {
      expect(screen.getByText(/Guardrails cannot be turned off/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Model library/i })).toBeTruthy();
      expect(screen.getByRole("link", { name: /^Settings$/i })).toHaveAttribute(
        "href",
        "/settings",
      );
    });
  });

  it("subscribes to download-progress events", async () => {
    mockModelsPageInvoke();

    render(
      <MemoryRouter>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(TauriApi.listen).toHaveBeenCalledWith(
        "download-progress",
        expect.any(Function),
      );
    });
  });

  it("shows Recommended badge on Ministral 3 8B when catalog is loaded", async () => {
    vi.mocked(TauriApi.invoke).mockImplementation(((cmd: string) => {
      switch (cmd) {
        case "get_catalog":
          return Promise.resolve(SHIPPED_CATALOG.models);
        case "list_installed_models":
          return Promise.resolve(emptyInstalled);
        case "get_active_model_id":
          return Promise.resolve(null);
        case "get_guardrails_settings":
          return Promise.resolve(guardrailsPayload);
        case "set_guardrails_settings":
          return Promise.resolve(undefined);
        default:
          return Promise.reject(new Error(`unexpected invoke: ${cmd}`));
      }
    }) as typeof TauriApi.invoke);

    render(
      <MemoryRouter initialEntries={["/models"]}>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Recommended")).toBeInTheDocument();
      expect(screen.getByText("Ministral 3 8B")).toBeInTheDocument();
    });
  });

  it("save guardrails always sends enabled true", async () => {
    mockModelsPageInvoke();

    render(
      <MemoryRouter initialEntries={["/models"]}>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Guardrails cannot be turned off/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Save guardrails/i }));

    await waitFor(() => {
      const setCalls = vi
        .mocked(TauriApi.invoke)
        .mock.calls.filter((c) => c[0] === "set_guardrails_settings");
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]?.[1]).toEqual({
        value: { enabled: true, customText: null },
      });
    });
  });

  it("save guardrails sends non-null customText when the textarea has content", async () => {
    mockModelsPageInvoke();

    render(
      <MemoryRouter initialEntries={["/models"]}>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Custom policy \(optional\)/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Custom policy \(optional\)/i), {
      target: { value: "ORG POLICY LINE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save guardrails/i }));

    await waitFor(() => {
      const setCalls = vi
        .mocked(TauriApi.invoke)
        .mock.calls.filter((c) => c[0] === "set_guardrails_settings");
      expect(setCalls).toHaveLength(1);
      expect(setCalls[0]?.[1]).toEqual({
        value: { enabled: true, customText: "ORG POLICY LINE" },
      });
    });
  });
});
