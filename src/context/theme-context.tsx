import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** Must match the inline script in `index.html` (first paint, no React yet). */
export const THEME_STORAGE_KEY = "maguna-theme-preference";

export type ThemePreference = "system" | "light" | "dark";

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemIsDark: boolean,
): "light" | "dark" {
  if (preference === "dark") {
    return "dark";
  }
  if (preference === "light") {
    return "light";
  }
  return systemIsDark ? "dark" : "light";
}

function subscribeSystemDark(cb: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSystemDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerSystemDarkSnapshot(): boolean {
  return false;
}

function applyDomClass(effective: "light" | "dark") {
  document.documentElement.classList.toggle("dark", effective === "dark");
}

type ThemeContextValue = {
  preference: ThemePreference;
  /** Resolved light/dark for the current preference + system state. */
  effective: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof document === "undefined" ? "system" : readStoredPreference(),
  );

  const systemIsDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getServerSystemDarkSnapshot,
  );

  const effective = useMemo(
    () => resolveEffectiveTheme(preference, systemIsDark),
    [preference, systemIsDark],
  );

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDomClass(resolveEffectiveTheme(next, getSystemDarkSnapshot()));
  }, []);

  useEffect(() => {
    applyDomClass(effective);
  }, [effective]);

  const value = useMemo(
    () => ({ preference, effective, setPreference }),
    [preference, effective, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
