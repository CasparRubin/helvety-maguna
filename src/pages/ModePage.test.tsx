/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModeDefinition } from "@/lib/types";
import * as tauriApi from "@/lib/tauri-api";

import { ModePage } from "./ModePage";

vi.mock("@/hooks/useInferenceListeners", () => ({
  useInferenceListeners: vi.fn(),
}));

const modesNavState: {
  modes: ModeDefinition[];
  modesReady: boolean;
  refreshModes: ReturnType<typeof vi.fn>;
} = {
  modes: [],
  modesReady: true,
  refreshModes: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/context/modes-nav-context", () => ({
  useModesNav: () => modesNavState,
}));

vi.mock("@/lib/tauri-api", () => ({
  invoke: vi.fn(),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const readText = vi.fn();

function renderAtMode(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/mode/:modeId"
          element={
            <main id="main-content" style={{ height: "720px" }}>
              <div className="p-6">
                <ModePage />
              </div>
            </main>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModePage", () => {
  beforeEach(() => {
    readText.mockReset();
    readText.mockResolvedValue("from-clipboard");
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      clipboard: {
        readText,
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Navigator);

    vi.mocked(tauriApi.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_installed_models") return [];
      if (cmd === "get_mode_model_binding") {
        return {
          effective_model_id: "model-1",
          override_model_id: null,
        };
      }
      if (cmd === "run_mode_chat" || cmd === "run_mode") return undefined;
      throw new Error(`unhandled invoke in test: ${cmd}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    modesNavState.modes = [];
  });

  it("Paste and run in chat invokes run_mode_chat with clipboard text", async () => {
    const modeId = "vitest-chat";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat test",
        system_prompt: "be brief",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    const pasteRun = await screen.findByRole("button", { name: /paste and run/i });
    expect(pasteRun).toBeEnabled();

    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).toBeDisabled();

    fireEvent.click(pasteRun);

    await waitFor(() => {
      expect(readText).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "run_mode_chat",
        expect.objectContaining({
          modeId,
          messages: [{ role: "user", content: "from-clipboard" }],
        }),
      );
    });

    // Assistant label in the chat transcript chrome (not the app shell sidebar).
    expect(await screen.findByText(/^Maguna$/)).toBeInTheDocument();
  });

  it("Send in chat invokes run_mode_chat with composer text", async () => {
    const modeId = "vitest-chat-send";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat send",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    const composer = await screen.findByRole("textbox", { name: /^message$/i });
    fireEvent.change(composer, { target: { value: "  hello model  " } });

    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "run_mode_chat",
        expect.objectContaining({
          modeId,
          messages: [{ role: "user", content: "hello model" }],
        }),
      );
    });
  });

  it("chat mode surfaces composer, empty state, Archive, and New chat", async () => {
    const modeId = "vitest-chat-chrome";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat chrome",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Chat chrome" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit configuration/i }),
    ).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/write a message/i)).toBeInTheDocument();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^archive$/i })).toBeInTheDocument();
  });

  it("Paste and run on input/output fills input and invokes run_mode", async () => {
    const modeId = "vitest-plain";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Plain test",
        system_prompt: "",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    const pasteRun = await screen.findByRole("button", { name: /paste and run/i });
    fireEvent.click(pasteRun);

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "run_mode",
        expect.objectContaining({
          modeId,
          input: "from-clipboard",
          locale: null,
          fromLang: null,
          toLang: null,
        }),
      );
    });

    expect(screen.getByRole("textbox", { name: /input/i })).toHaveValue(
      "from-clipboard",
    );
  });

  it("Paste and run shows an error when clipboard is empty", async () => {
    readText.mockResolvedValueOnce("   ");
    const modeId = "vitest-chat-2";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat two",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /paste and run/i }));

    expect(
      await screen.findByText(/clipboard is empty or whitespace only/i),
    ).toBeInTheDocument();

    expect(tauriApi.invoke).not.toHaveBeenCalledWith(
      "run_mode_chat",
      expect.anything(),
    );
  });

  it("shows the mode title without legacy configuration hints under the heading", async () => {
    const modeId = "vitest-plain-ui";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Plain UI",
        system_prompt: "",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    await screen.findByRole("heading", { level: 2, name: "Plain UI" });
    expect(
      screen.getByRole("button", { name: /edit configuration/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Input & output")).toBeInTheDocument();
    expect(screen.queryByText(/open mode configuration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/use input and output below/i)).not.toBeInTheDocument();
  });

  it("opens Edit configuration dialog with name and system prompt fields", async () => {
    const modeId = "vitest-dialog-plain";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Alpha mode",
        system_prompt: "be helpful",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /mode configuration/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^name$/i)).toHaveValue("Alpha mode");
    expect(within(dialog).getByLabelText(/^system prompt$/i)).toHaveValue("be helpful");
    expect(within(dialog).queryByLabelText(/^language in$/i)).not.toBeInTheDocument();
  });

  it("shows Language in/out in dialog for translate layouts", async () => {
    const modeId = "vitest-dialog-translate";
    modesNavState.modes = [
      {
        id: modeId,
        name: "En↔De",
        system_prompt: "",
        prompt_layout: "translate",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^language in$/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^language out$/i)).toBeInTheDocument();
  });
});
