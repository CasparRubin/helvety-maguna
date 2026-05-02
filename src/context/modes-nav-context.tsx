import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { invoke } from "@/lib/tauri-api";
import type { ModeDefinition } from "@/lib/types";

type ModesNavContextValue = {
  modes: ModeDefinition[];
  /** False until the first `get_modes` completes (avoids route flash on cold start). */
  modesReady: boolean;
  refreshModes: () => Promise<void>;
};

const ModesNavContext = createContext<ModesNavContextValue | null>(null);

export function ModesNavProvider({ children }: { children: ReactNode }) {
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [modesReady, setModesReady] = useState(false);

  const refreshModes = useCallback(async () => {
    try {
      const list = await invoke<ModeDefinition[]>("get_modes");
      setModes(list);
    } catch {
      setModes([]);
    } finally {
      setModesReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshModes();
  }, [refreshModes]);

  return (
    <ModesNavContext.Provider value={{ modes, modesReady, refreshModes }}>
      {children}
    </ModesNavContext.Provider>
  );
}

export function useModesNav() {
  const ctx = useContext(ModesNavContext);
  if (!ctx) {
    throw new Error("useModesNav must be used within ModesNavProvider");
  }
  return ctx;
}
