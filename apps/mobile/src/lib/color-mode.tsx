/**
 * App color-mode preference: "system" (follow the OS), "light", or "dark".
 * Persisted locally and exposed via context. `useColorMode()` resolves the
 * preference against the live OS scheme so `useTheme()` and the root layout
 * can pick the right palette.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

import { getPref, setPref } from "@/lib/storage";

export type ColorModePreference = "system" | "light" | "dark";
export type ResolvedScheme = "light" | "dark";

const PREF_KEY = "color_mode";

interface ColorModeContextValue {
  /** The user's stored choice. */
  preference: ColorModePreference;
  /** The effective scheme after resolving "system" against the OS. */
  scheme: ResolvedScheme;
  ready: boolean;
  setPreference: (pref: ColorModePreference) => void;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const osScheme = useColorScheme();
  const [preference, setPref_] = useState<ColorModePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getPref(PREF_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPref_(stored);
      }
      setReady(true);
    })();
  }, []);

  const setPreference = useCallback((pref: ColorModePreference) => {
    setPref_(pref);
    void setPref(PREF_KEY, pref);
  }, []);

  const scheme: ResolvedScheme =
    preference === "system"
      ? osScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const value = useMemo<ColorModeContextValue>(
    () => ({ preference, scheme, ready, setPreference }),
    [preference, scheme, ready, setPreference],
  );

  return (
    <ColorModeContext.Provider value={value}>
      {children}
    </ColorModeContext.Provider>
  );
}

/**
 * Resolved color mode. Falls back to following the OS when used outside a
 * provider (so early-boot screens still theme correctly).
 */
export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  const osScheme = useColorScheme();
  if (ctx) return ctx;
  return {
    preference: "system",
    scheme: osScheme === "dark" ? "dark" : "light",
    ready: true,
    setPreference: () => {},
  };
}
