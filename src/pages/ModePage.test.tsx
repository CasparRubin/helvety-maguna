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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModeDefinition } from "@/lib/types";
import type { InferencePhase } from "@/hooks/useInferenceListeners";
import * as tauriApi from "@/lib/tauri-api";
import { loadChatSessions, saveChatSessions } from "@/lib/chat-session-archive";
import { saveModeRunArchive } from "@/lib/mode-run-archive";

import { ModePage } from "./ModePage";

type InferenceHandlers = {
  onChunk: (s: string) => void;
  onDone: () => void;
  onError: (s: string) => void;
  onPhase?: (phase: InferencePhase) => void;
};

const inferenceHandlers: { current: InferenceHandlers | null } = { current: null };

vi.mock("@/hooks/useInferenceListeners", () => ({
  useInferenceListeners: vi.fn((handlers: InferenceHandlers) => {
    inferenceHandlers.current = handlers;
  }),
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

const readText = vi.fn();
const writeText = vi.fn();

function chatAssistantBubble() {
  const thinking = screen.queryByText("Thinking...");
  const content = screen.queryByText(/^Maguna$/)?.closest(".rounded-lg");
  if (thinking) return thinking.closest(".rounded-lg");
  return content ?? null;
}

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

async function clickSelectOption(name: string) {
  const options = await screen.findAllByRole("option", { name });
  const activeOption =
    options.find((option) => option.getAttribute("tabindex") === "0") ??
    options[options.length - 1];

  expect(activeOption).toBeDefined();
  fireEvent.pointerDown(activeOption as HTMLElement);
  fireEvent.mouseDown(activeOption as HTMLElement);
  fireEvent.mouseUp(activeOption as HTMLElement);
  fireEvent.click(activeOption as HTMLElement);
}

describe("ModePage", () => {
  beforeEach(() => {
    inferenceHandlers.current = null;
    readText.mockReset();
    readText.mockResolvedValue("from-clipboard");
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      clipboard: {
        readText,
        writeText,
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
      if (cmd === "run_mode_chat" || cmd === "run_mode" || cmd === "reset_chat_kv") {
        return undefined;
      }
      if (cmd === "get_model_thinking_settings") return { enabled: false };
      if (cmd === "set_model_thinking_settings") return undefined;
      throw new Error(`unhandled invoke in test: ${cmd}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    modesNavState.modes = [];
    localStorage.clear();
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
          imagePath: null,
        }),
      );
    });

    // Assistant label in the chat transcript chrome (not the app shell sidebar).
    expect(await screen.findByText(/^Maguna$/)).toBeInTheDocument();
    const thinking = screen.getByText("Thinking...");
    expect(thinking).toBeInTheDocument();
    expect(thinking).toHaveClass("maguna-label-thinking");
    expect(screen.getByText(/^Maguna$/)).not.toHaveClass("maguna-label-thinking");

    const bubble = chatAssistantBubble();
    expect(bubble).toBeTruthy();
    expect(
      within(bubble as HTMLElement).queryByRole("button", { name: /copy/i }),
    ).toBeNull();
  });

  it("replaces Thinking... with streamed text and shows copy when chunks arrive", async () => {
    const modeId = "vitest-chat-stream";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat stream",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    vi.mocked(tauriApi.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_installed_models") return [];
      if (cmd === "get_mode_model_binding") {
        return { effective_model_id: "model-1", override_model_id: null };
      }
      if (cmd === "run_mode_chat") return new Promise(() => {});
      if (cmd === "reset_chat_kv") return undefined;
      if (cmd === "get_model_thinking_settings") return { enabled: false };
      if (cmd === "set_model_thinking_settings") return undefined;
      throw new Error(`unhandled invoke in test: ${cmd}`);
    });

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /paste and run/i }));

    await waitFor(() => {
      expect(inferenceHandlers.current).not.toBeNull();
      expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });

    act(() => {
      inferenceHandlers.current!.onChunk("Hello from the model");
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from the model")).toBeInTheDocument();
    });
    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();

    const bubble = chatAssistantBubble();
    expect(bubble).toBeTruthy();
    const copy = within(bubble as HTMLElement).getByRole("button", {
      name: /copy to clipboard/i,
    });
    expect(copy).toBeEnabled();
    fireEvent.click(copy);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Hello from the model");
    });
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
          imagePath: null,
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
    expect(screen.getByRole("button", { name: /attach image/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^archive$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith("reset_chat_kv");
    });
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
          terminology: null,
          keepFormatting: null,
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
    expect(screen.getByRole("button", { name: /Thinking off/i })).toBeInTheDocument();
    expect(screen.getByText("Input & output")).toBeInTheDocument();
    expect(screen.queryByText(/open mode configuration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/use input and output below/i)).not.toBeInTheDocument();
  });

  it("toggles model thinking via the header button", async () => {
    const modeId = "vitest-thinking-toggle";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Think UI",
        system_prompt: "x",
        prompt_layout: "chat",
        max_tokens: 64,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    const btn = await screen.findByRole("button", { name: /Thinking off/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith("set_model_thinking_settings", {
        value: { enabled: true },
      });
    });
    expect(
      await screen.findByRole("button", { name: /Thinking on/i }),
    ).toBeInTheDocument();
  });

  it("loads Thinking on when get_model_thinking_settings returns enabled", async () => {
    const modeId = "vitest-thinking-enabled";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Think On UI",
        system_prompt: "x",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    vi.mocked(tauriApi.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_installed_models") return [];
      if (cmd === "get_mode_model_binding") {
        return { effective_model_id: "model-1", override_model_id: null };
      }
      if (cmd === "get_model_thinking_settings") return { enabled: true };
      if (cmd === "set_model_thinking_settings") return undefined;
      if (cmd === "run_mode" || cmd === "run_mode_chat" || cmd === "reset_chat_kv") {
        return undefined;
      }
      throw new Error(`unhandled invoke in test: ${cmd}`);
    });

    renderAtMode(`/mode/${modeId}`);

    expect(
      await screen.findByRole("button", { name: /Thinking on/i }),
    ).toBeInTheDocument();
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

  it("language select changes are used when running translate modes", async () => {
    const modeId = "vitest-dialog-translate-selects";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Translate selects",
        system_prompt: "",
        prompt_layout: "translate",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/^language in$/i));
    await clickSelectOption("German");

    fireEvent.click(within(dialog).getByLabelText(/^language out$/i));
    await clickSelectOption("English");

    fireEvent.click(within(dialog).getByRole("button", { name: /^close$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /paste and run/i }));

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "run_mode",
        expect.objectContaining({
          modeId,
          input: "from-clipboard",
          fromLang: "de",
          toLang: "en",
          terminology: [],
          keepFormatting: false,
        }),
      );
    });
  });

  it("translate DE→EN shows terminology controls and sends glossary on run", async () => {
    const modeId = "vitest-translate-terminology";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Translate DE EN",
        system_prompt: "",
        prompt_layout: "translate",
        max_tokens: 128,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/^language in$/i));
    await clickSelectOption("German");
    fireEvent.click(within(dialog).getByLabelText(/^language out$/i));
    await clickSelectOption("English");
    fireEvent.click(within(dialog).getByRole("button", { name: /^close$/i }));

    expect(await screen.findByText(/terminology \(optional\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add term/i }));
    const sourceInput = screen
      .getByText(/^source$/i)
      .parentElement!.querySelector("input");
    const targetInput = screen
      .getByText(/^target$/i)
      .parentElement!.querySelector("input");
    expect(sourceInput).toBeTruthy();
    expect(targetInput).toBeTruthy();
    fireEvent.change(sourceInput!, { target: { value: "Rechnung" } });
    fireEvent.change(targetInput!, { target: { value: "invoice" } });
    fireEvent.click(screen.getByText(/keep formatting \/ structure/i));

    const input = screen.getByRole("textbox", { name: /input/i });
    fireEvent.change(input, { target: { value: "Die Rechnung bitte." } });
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith(
        "run_mode",
        expect.objectContaining({
          modeId,
          input: "Die Rechnung bitte.",
          fromLang: "de",
          toLang: "en",
          terminology: [["Rechnung", "invoice"]],
          keepFormatting: true,
        }),
      );
    });
  });

  it("installed model select changes call set_mode_model_override", async () => {
    const modeId = "vitest-dialog-model-select";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Model select",
        system_prompt: "",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    vi.mocked(tauriApi.invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_installed_models") {
        return [
          {
            id: "model-1",
            display_name: "Model One",
            gguf_path: "/models/model-1.gguf",
            sha256: null,
          },
          {
            id: "model-2",
            display_name: "Model Two",
            gguf_path: "/models/model-2.gguf",
            sha256: null,
          },
        ];
      }
      if (cmd === "get_mode_model_binding") {
        return {
          effective_model_id: "model-1",
          override_model_id: null,
        };
      }
      if (cmd === "set_mode_model_override") return undefined;
      if (cmd === "run_mode" || cmd === "run_mode_chat" || cmd === "reset_chat_kv") {
        return undefined;
      }
      if (cmd === "get_model_thinking_settings") return { enabled: false };
      if (cmd === "set_model_thinking_settings") return undefined;
      throw new Error(`unhandled invoke in test: ${cmd}`);
    });

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByLabelText(/^installed model$/i));
    await clickSelectOption("Model Two");

    await waitFor(() => {
      expect(tauriApi.invoke).toHaveBeenCalledWith("set_mode_model_override", {
        modeId,
        modelId: "model-2",
      });
    });
  });

  it("opens a saved chat session when its archive row is activated", async () => {
    const modeId = "vitest-chat-open-session";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat open session",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    saveChatSessions(modeId, [
      {
        id: "session-open",
        createdAt: 1,
        updatedAt: 1,
        title: "Prior thread",
        messages: [
          { role: "user", content: "earlier question" },
          { role: "assistant", content: "earlier answer" },
        ],
      },
    ]);

    renderAtMode(`/mode/${modeId}`);

    const sessionButton = await screen.findByRole("button", { name: /Prior thread/i });
    fireEvent.click(sessionButton);

    await waitFor(() => {
      expect(screen.getByText("earlier question")).toBeInTheDocument();
      expect(screen.getByText("earlier answer")).toBeInTheDocument();
      expect(screen.getByText(/• open/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no messages yet/i)).not.toBeInTheDocument();
    expect(tauriApi.invoke).toHaveBeenCalledWith("reset_chat_kv");
  });

  it("closes Edit configuration dialog via the dialog close control", async () => {
    const modeId = "vitest-dialog-close";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Dialog close",
        system_prompt: "",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    renderAtMode(`/mode/${modeId}`);

    fireEvent.click(await screen.findByRole("button", { name: /edit configuration/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^close$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Clear archive opens confirm dialog and deletes all chat sessions on confirm", async () => {
    const modeId = "vitest-chat-clear";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat clear",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    saveChatSessions(modeId, [
      {
        id: "session-1",
        createdAt: 1,
        updatedAt: 1,
        title: "First chat",
        messages: [{ role: "user", content: "hello" }],
      },
      {
        id: "session-2",
        createdAt: 2,
        updatedAt: 2,
        title: "Second chat",
        messages: [{ role: "user", content: "world" }],
      },
    ]);

    renderAtMode(`/mode/${modeId}`);

    expect(await screen.findByText("First chat")).toBeInTheDocument();
    expect(screen.getByText("Second chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear archive/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /clear archive\?/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/delete all saved chats/i)).toBeInTheDocument();
    expect(screen.getByText("First chat")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /delete all/i }));

    await waitFor(() => {
      expect(screen.queryByText("First chat")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Second chat")).not.toBeInTheDocument();
    expect(screen.getByText(/no saved chats yet/i)).toBeInTheDocument();
    expect(loadChatSessions(modeId)).toEqual([]);
  });

  it("Clear archive confirm dialog Cancel keeps chat sessions", async () => {
    const modeId = "vitest-chat-clear-cancel";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Chat clear cancel",
        system_prompt: "",
        prompt_layout: "chat",
        max_tokens: 128,
        builtin: false,
      },
    ];

    saveChatSessions(modeId, [
      {
        id: "session-keep",
        createdAt: 1,
        updatedAt: 1,
        title: "Keep me",
        messages: [{ role: "user", content: "stay" }],
      },
    ]);

    renderAtMode(`/mode/${modeId}`);

    expect(await screen.findByText("Keep me")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear archive/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(loadChatSessions(modeId)).toHaveLength(1);
  });

  it("archive Input and Output rows expose copy buttons beside their labels", async () => {
    const modeId = "vitest-archive-copy";
    modesNavState.modes = [
      {
        id: modeId,
        name: "Archive copy",
        system_prompt: "",
        prompt_layout: "plain",
        max_tokens: 64,
        builtin: false,
      },
    ];

    saveModeRunArchive(modeId, [
      {
        id: "run-1",
        createdAt: 1_700_000_000_000,
        input: "fix typo",
        output: "fixed typo",
      },
    ]);

    renderAtMode(`/mode/${modeId}`);

    expect(await screen.findByText("fix typo")).toBeInTheDocument();
    expect(screen.getByText("fixed typo")).toBeInTheDocument();

    const archiveHeading = screen.getByRole("heading", { name: /^archive$/i });
    const archiveSection = archiveHeading.closest("div")?.parentElement;
    expect(archiveSection).toBeTruthy();

    const archiveCopyButtons = within(archiveSection as HTMLElement).getAllByRole(
      "button",
      { name: /copy to clipboard/i },
    );
    expect(archiveCopyButtons).toHaveLength(2);
    expect(archiveCopyButtons[0]).toBeEnabled();
    expect(archiveCopyButtons[1]).toBeEnabled();

    fireEvent.click(archiveCopyButtons[0]!);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("fix typo");
    });

    fireEvent.click(archiveCopyButtons[1]!);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("fixed typo");
    });
  });
});
