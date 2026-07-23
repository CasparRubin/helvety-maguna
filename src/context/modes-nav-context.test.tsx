/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModeDefinition } from "@/lib/types";
import * as tauriApi from "@/lib/tauri-api";

import { ModesNavProvider, useModesNav } from "./modes-nav-context";

vi.mock("@/lib/tauri-api", () => ({
  invoke: vi.fn(),
}));

function Probe() {
  const { modes, modesReady } = useModesNav();
  return (
    <div>
      <span data-testid="ready">{String(modesReady)}</span>
      <span data-testid="count">{modes.length}</span>
      <span data-testid="ids">{modes.map((m) => m.id).join(",")}</span>
    </div>
  );
}

const sampleModes: ModeDefinition[] = [
  {
    id: "chat",
    name: "Chat",
    system_prompt: "",
    prompt_layout: "chat",
    max_tokens: 128,
    builtin: true,
  },
];

describe("ModesNavProvider", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads modes and marks ready after get_modes", async () => {
    vi.mocked(tauriApi.invoke).mockResolvedValue(sampleModes);

    render(
      <ModesNavProvider>
        <Probe />
      </ModesNavProvider>,
    );

    expect(screen.getByTestId("ready")).toHaveTextContent("false");

    await waitFor(() => {
      expect(screen.getByTestId("ready")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("ids")).toHaveTextContent("chat");
    expect(tauriApi.invoke).toHaveBeenCalledWith("get_modes");
  });

  it("treats invoke failure as an empty mode list and still becomes ready", async () => {
    vi.mocked(tauriApi.invoke).mockRejectedValue(new Error("offline"));

    render(
      <ModesNavProvider>
        <Probe />
      </ModesNavProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
