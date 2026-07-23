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
import { open } from "@tauri-apps/plugin-dialog";

import type { CatalogEntry, GuardrailsSettings, InstalledModel } from "@/lib/types";
import { RECOMMENDED_CATALOG_MODEL_ID } from "@/lib/catalog-order";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";
import { AI_OUTPUT_DISCLAIMER_TERMS_HREF } from "@/components/ai-output-disclaimer";
import * as TauriApi from "@/lib/tauri-api";

import { ModelsPage } from "./ModelsPage";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

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
  const progressBar = screen.getByRole("progressbar");
  const card = progressBar.closest("[data-slot='card']");
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

function withTauriBridge(run: () => void | Promise<void>) {
  const tauriBridge = { invoke: vi.fn() };
  (
    window as unknown as { __TAURI_INTERNALS__: typeof tauriBridge }
  ).__TAURI_INTERNALS__ = tauriBridge;
  return Promise.resolve(run()).finally(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
}

describe("ModelsPage", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(TauriApi.invoke).mockReset();
    vi.mocked(TauriApi.listen).mockReset();
    vi.mocked(TauriApi.listen).mockImplementation(() => Promise.resolve(() => {}));
    vi.mocked(open).mockReset();
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
        AI_OUTPUT_DISCLAIMER_TERMS_HREF,
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

    const catalogBlurb = screen.getByText(/Smallest downloads first/i);
    expect(catalogBlurb.textContent).toMatch(/writing and chat/i);
    expect(catalogBlurb.textContent).toMatch(/HY-MT1\.5 7B/);
    expect(catalogBlurb.textContent).toMatch(/Translate/i);

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
            sidecar?: string;
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
        within(downloadProgressCard()).getByRole("progressbar"),
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
          phase: "downloading",
          sidecar: "mmproj",
          received: 50_000_000,
          total: 175_115_840,
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Downloading vision projector…/i }),
      ).toBeInTheDocument();
      expect(
        within(downloadProgressCard()).getByText(/Downloading vision projector…/i),
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

    const progressBar = within(downloadProgressCard()).getByRole("progressbar");
    expect(progressBar).toHaveAttribute("aria-valuetext", "Installing");
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

  it("import GGUF section uses file picker instead of a path text field", async () => {
    mockModelsPageInvoke();

    render(
      <MemoryRouter initialEntries={["/models"]}>
        <ModelsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Choose file/i })).toBeInTheDocument();
      expect(screen.getByText("No file selected")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/File path/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/my-model\.gguf/i)).not.toBeInTheDocument();
  });

  it("import GGUF does nothing when the file picker is cancelled", async () => {
    await withTauriBridge(async () => {
      mockModelsPageInvoke();
      vi.mocked(open).mockResolvedValue(null);

      render(
        <MemoryRouter initialEntries={["/models"]}>
          <ModelsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Choose file/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Choose file/i }));

      await waitFor(() => {
        expect(open).toHaveBeenCalled();
      });

      expect(screen.getByText("No file selected")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Import$/i })).toBeDisabled();
      expect(TauriApi.invoke).not.toHaveBeenCalledWith(
        "import_gguf",
        expect.anything(),
      );
    });
  });

  it("import GGUF preserves a custom display name when choosing a file", async () => {
    await withTauriBridge(async () => {
      mockModelsPageInvoke();
      vi.mocked(open).mockResolvedValue("/Users/me/Downloads/other.gguf");

      render(
        <MemoryRouter initialEntries={["/models"]}>
          <ModelsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Display name/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Display name/i), {
        target: { value: "My Custom Model" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Choose file/i }));

      await waitFor(() => {
        expect(screen.getByText("other.gguf")).toBeInTheDocument();
        expect(screen.getByLabelText(/Display name/i)).toHaveValue("My Custom Model");
      });
    });
  });

  it("lists catalog models under a Catalog section heading", async () => {
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
      expect(screen.getByRole("heading", { name: /^Catalog$/i })).toBeInTheDocument();
      expect(screen.getByText("Gemma 4 12B")).toBeInTheDocument();
    });
  });

  it("import GGUF uses file picker and invokes import_gguf", async () => {
    await withTauriBridge(async () => {
      vi.mocked(open).mockResolvedValue("/Users/me/Downloads/custom.gguf");
      vi.mocked(TauriApi.invoke).mockImplementation(((cmd: string) => {
        switch (cmd) {
          case "get_catalog":
            return Promise.resolve(emptyCatalog);
          case "list_installed_models":
            return Promise.resolve(emptyInstalled);
          case "get_active_model_id":
            return Promise.resolve(null);
          case "get_guardrails_settings":
            return Promise.resolve(guardrailsPayload);
          case "set_guardrails_settings":
            return Promise.resolve(undefined);
          case "import_gguf":
            return Promise.resolve("import-1");
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
        expect(
          screen.getByRole("button", { name: /Choose file/i }),
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /Choose file/i }));

      await waitFor(() => {
        expect(open).toHaveBeenCalledWith(
          expect.objectContaining({
            multiple: false,
            directory: false,
            filters: [{ name: "GGUF model", extensions: ["gguf"] }],
          }),
        );
        expect(screen.getByText("custom.gguf")).toBeInTheDocument();
        expect(screen.getByLabelText(/Display name/i)).toHaveValue("custom");
      });

      fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));

      await waitFor(() => {
        expect(TauriApi.invoke).toHaveBeenCalledWith("import_gguf", {
          sourcePath: "/Users/me/Downloads/custom.gguf",
          displayName: "custom",
        });
      });
    });
  });

  it("Remove on an installed model invokes delete_model and refreshes", async () => {
    await withTauriBridge(async () => {
      const installed: InstalledModel[] = [
        {
          id: "local-1",
          display_name: "Local One",
          gguf_path: "/tmp/local-1.gguf",
          sha256: null,
          chat_template: "qwen2_instruct",
        },
      ];
      let listed = [...installed];

      vi.mocked(TauriApi.invoke).mockImplementation(((cmd: string, args?: unknown) => {
        switch (cmd) {
          case "get_catalog":
            return Promise.resolve(emptyCatalog);
          case "list_installed_models":
            return Promise.resolve(listed);
          case "get_active_model_id":
            return Promise.resolve("local-1");
          case "get_guardrails_settings":
            return Promise.resolve(guardrailsPayload);
          case "set_guardrails_settings":
            return Promise.resolve(undefined);
          case "delete_model":
            expect(args).toEqual({ modelId: "local-1" });
            listed = [];
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

      expect(await screen.findByText("Local One")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

      await waitFor(() => {
        expect(TauriApi.invoke).toHaveBeenCalledWith("delete_model", {
          modelId: "local-1",
        });
      });
      await waitFor(() => {
        expect(screen.queryByText("Local One")).not.toBeInTheDocument();
      });
    });
  });
});
