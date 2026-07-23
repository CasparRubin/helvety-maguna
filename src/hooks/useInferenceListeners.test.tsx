/** @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as tauriApi from "@/lib/tauri-api";

import { useInferenceListeners } from "./useInferenceListeners";

vi.mock("@/lib/tauri-api", () => ({
  listen: vi.fn(),
}));

function Harness(props: {
  onChunk: (s: string) => void;
  onDone: () => void;
  onError: (s: string) => void;
  onPhase?: (phase: "prefill" | "generating") => void;
}) {
  useInferenceListeners(props);
  return null;
}

describe("useInferenceListeners", () => {
  const handlers = new Map<string, (e: { payload: unknown }) => void>();
  const unsubs = new Map<string, ReturnType<typeof vi.fn>>();

  beforeEach(() => {
    handlers.clear();
    unsubs.clear();
    vi.mocked(tauriApi.listen).mockImplementation(async (event, handler) => {
      handlers.set(event, handler as (e: { payload: unknown }) => void);
      const unsub = vi.fn();
      unsubs.set(event, unsub);
      return unsub;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("forwards chunk/done/error/phase events to the latest handlers", async () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onPhase = vi.fn();

    render(
      <Harness onChunk={onChunk} onDone={onDone} onError={onError} onPhase={onPhase} />,
    );

    await vi.waitFor(() => {
      expect(handlers.size).toBe(4);
    });

    act(() => {
      handlers.get("inference-chunk")!({ payload: "hi" });
      handlers.get("inference-done")!({ payload: null });
      handlers.get("inference-phase")!({ payload: "prefill" });
      handlers.get("inference-phase")!({ payload: "generating" });
      handlers.get("inference-phase")!({ payload: "nope" });
      handlers.get("inference-error")!({ payload: "boom" });
    });

    expect(onChunk).toHaveBeenCalledWith("hi");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onPhase).toHaveBeenCalledWith("prefill");
    expect(onPhase).toHaveBeenCalledWith("generating");
    expect(onPhase).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("unsubscribes resolved listeners on unmount and ignores late listen", async () => {
    let resolveListen: ((unsub: () => void) => void) | undefined;
    const pending = new Promise<() => void>((resolve) => {
      resolveListen = resolve;
    });
    vi.mocked(tauriApi.listen).mockReturnValueOnce(pending);

    const { unmount } = render(
      <Harness onChunk={vi.fn()} onDone={vi.fn()} onError={vi.fn()} />,
    );

    unmount();

    const lateUnsub = vi.fn();
    await act(async () => {
      resolveListen?.(lateUnsub);
      await Promise.resolve();
    });

    expect(lateUnsub).toHaveBeenCalledTimes(1);
  });
});
