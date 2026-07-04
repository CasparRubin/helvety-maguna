/** @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry, GuardrailsSettings, InstalledModel } from "@/lib/types";
import { RECOMMENDED_CATALOG_MODEL_ID } from "@/lib/catalog-order";
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

function downloadProgressCard() {
  const bar = screen.getByRole("progressbar");
  const card = bar.closest(".rounded-xl");
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

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

  it("shows Recommended badge only on Gemma 4 12B when catalog is loaded", async () => {
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
      expect(screen.getAllByText("Recommended")).toHaveLength(1);
      expect(screen.getAllByText("Gemma 4 12B").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Ministral 3 8B")).toBeInTheDocument();
    });

    const gemmaCard = screen.getByText("Recommended").closest(".rounded-xl");
    const ministralCard = screen.getByText("Ministral 3 8B").closest(".rounded-xl");
    expect(gemmaCard).toBeTruthy();
    expect(ministralCard).toBeTruthy();
    expect(
      within(gemmaCard as HTMLElement).getByText("Recommended"),
    ).toBeInTheDocument();
    expect(within(ministralCard as HTMLElement).queryByText("Recommended")).toBeNull();
  });

  it("lists GLM catalog models when the shipped catalog is loaded", async () => {
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
      expect(screen.getByText("GLM-4 9B")).toBeInTheDocument();
      expect(screen.getByText("GLM-4.7 Flash")).toBeInTheDocument();
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

  it("shows download progress in the catalog button label", async () => {
    const recommendedEntry = SHIPPED_CATALOG.models.find(
      (m) => m.id === RECOMMENDED_CATALOG_MODEL_ID,
    );
    expect(recommendedEntry).toBeDefined();

    let progressHandler:
      | ((ev: {
          payload: {
            model_id: string;
            phase?: "downloading" | "installing";
            received: number;
            total: number | null;
          };
        }) => void)
      | undefined;

    vi.mocked(TauriApi.listen).mockImplementation((event, handler) => {
      if (event === "download-progress") {
        progressHandler = handler as typeof progressHandler;
      }
      return Promise.resolve(() => {});
    });

    vi.mocked(TauriApi.invoke).mockImplementation(((cmd: string) => {
      switch (cmd) {
        case "get_catalog":
          return Promise.resolve([recommendedEntry!]);
        case "list_installed_models":
          return Promise.resolve(emptyInstalled);
        case "get_active_model_id":
          return Promise.resolve(null);
        case "get_guardrails_settings":
          return Promise.resolve(guardrailsPayload);
        case "download_model":
          return new Promise(() => {});
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
      expect(screen.getByText("Gemma 4 12B")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Download$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Downloading… 0%/i }),
      ).toBeInTheDocument();
      expect(
        within(downloadProgressCard()).getByText(/Downloading… 0%/i),
      ).toBeInTheDocument();
    });
    expect(TauriApi.invoke).toHaveBeenCalledWith("download_model", {
      catalogId: RECOMMENDED_CATALOG_MODEL_ID,
    });

    expect(progressHandler).toBeDefined();
    act(() => {
      progressHandler!({
        payload: {
          model_id: RECOMMENDED_CATALOG_MODEL_ID,
          phase: "downloading",
          received: 100_000_000,
          total: null,
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Downloading…$/i }),
      ).toBeInTheDocument();
      expect(
        within(downloadProgressCard()).getByText(/^Downloading…$/i),
      ).toBeInTheDocument();
    });

    act(() => {
      progressHandler!({
        payload: {
          model_id: RECOMMENDED_CATALOG_MODEL_ID,
          phase: "downloading",
          received: 500_000_000,
          total: 1_000_000_000,
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Downloading… 50%/i }),
      ).toBeInTheDocument();
      expect(
        within(downloadProgressCard()).getByText(/Downloading… 50%/i),
      ).toBeInTheDocument();
    });

    act(() => {
      progressHandler!({
        payload: {
          model_id: RECOMMENDED_CATALOG_MODEL_ID,
          phase: "installing",
          received: recommendedEntry!.size_bytes,
          total: recommendedEntry!.size_bytes,
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Finishing install…/i }),
      ).toBeInTheDocument();
      expect(
        within(downloadProgressCard()).getByText(/Finishing install…/i),
      ).toBeInTheDocument();
    });
  });

  it("disables other catalog download buttons while one model is downloading", async () => {
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
        case "download_model":
          return new Promise(() => {});
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
      expect(screen.getAllByRole("button", { name: /^Download$/i })).toHaveLength(
        SHIPPED_CATALOG.models.length,
      );
    });

    const downloadButtons = screen.getAllByRole("button", { name: /^Download$/i });
    fireEvent.click(downloadButtons[2]!);

    await waitFor(() => {
      expect(downloadButtons[2]).toHaveAccessibleName(/Downloading… 0%/i);
    });

    for (const [index, button] of downloadButtons.entries()) {
      expect(button).toBeDisabled();
      if (index === 2) {
        expect(button).toHaveAccessibleName(/Downloading… 0%/i);
      } else {
        expect(button).toHaveAccessibleName(/^Download$/i);
      }
    }
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
