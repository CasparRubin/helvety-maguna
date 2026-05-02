import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Must match the inline script in `index.html` (first paint, no React yet). */
export const THEME_STORAGE_KEY = "maguna-theme-preference";

export type ThemePreference = "light" | "dark";

function getSystemDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return getSystemDarkSnapshot() ? "dark" : "light";
}

export function resolveEffectiveTheme(preference: ThemePreference): "light" | "dark" {
  return preference;
}

function applyDomClass(effective: "light" | "dark") {
  document.documentElement.classList.toggle("dark", effective === "dark");
}

type ThemeContextValue = {
  preference: ThemePreference;
  /** Resolved light/dark mode currently applied to the app. */
  effective: "light" | "dark";
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof document === "undefined" ? "light" : readStoredPreference(),
  );

  const effective = useMemo(() => resolveEffectiveTheme(preference), [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDomClass(resolveEffectiveTheme(next));
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
