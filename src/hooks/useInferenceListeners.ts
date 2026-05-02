import { useEffect, useRef } from "react";

import { listen } from "@/lib/tauri-api";

/** Matches `inference-phase` payloads from the llama backend. */
export type InferencePhase = "prefill" | "generating";

function isInferencePhase(s: unknown): s is InferencePhase {
  return s === "prefill" || s === "generating";
}

type Handlers = {
  onChunk: (s: string) => void;
  onDone: () => void;
  onError: (s: string) => void;
  onPhase?: (phase: InferencePhase) => void;
};

/**
 * Subscribes to Tauri inference events. Correct under React Strict Mode: `listen`
 * is async; we only keep listeners that completed after mount and unsubscribe
 * any that resolve after unmount (avoids duplicate chunk handlers).
 */
export function useInferenceListeners(handlers: Handlers) {
  const onChunk = useRef(handlers.onChunk);
  const onDone = useRef(handlers.onDone);
  const onError = useRef(handlers.onError);
  const onPhase = useRef(handlers.onPhase);
  onChunk.current = handlers.onChunk;
  onDone.current = handlers.onDone;
  onError.current = handlers.onError;
  onPhase.current = handlers.onPhase;

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    void (async () => {
      try {
        let u = await listen<string>("inference-chunk", (e) => {
          if (!cancelled) onChunk.current(e.payload);
        });
        if (cancelled) {
          u();
          return;
        }
        unsubs.push(u);

        u = await listen("inference-done", () => {
          if (!cancelled) onDone.current();
        });
        if (cancelled) {
          u();
          return;
        }
        unsubs.push(u);

        u = await listen<string>("inference-phase", (e) => {
          if (cancelled || !onPhase.current) return;
          if (isInferencePhase(e.payload)) onPhase.current(e.payload);
        });
        if (cancelled) {
          u();
          return;
        }
        unsubs.push(u);

        u = await listen<string>("inference-error", (e) => {
          if (!cancelled) onError.current(e.payload);
        });
        if (cancelled) {
          u();
          return;
        }
        unsubs.push(u);
      } catch {
        /* listen unavailable */
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((f) => f());
    };
  }, []);
}
