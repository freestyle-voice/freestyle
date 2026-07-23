/**
 * Always-mounted host for the resident keyboard-dictation session.
 *
 * Mounted once in `(app)/_layout` so the session survives regardless of which
 * screen is visible — the keyboard hand-off must keep working while the user is
 * on Home, History, or (usually) not looking at the app at all. The provider
 * exposes the live session state so a lightweight status strip can render it
 * without owning the session lifecycle.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useAuth } from "@/hooks/use-auth";
import type { Phase } from "@/lib/keyboard/dictation-bridge";
import { useKeyboardDictationBridge } from "@/lib/keyboard/use-keyboard-dictation-bridge";

interface KeyboardDictationContextValue {
  active: boolean;
  phase: Phase;
  partial: string;
  finalText: string;
  toggle: () => void;
}

const KeyboardDictationContext =
  createContext<KeyboardDictationContextValue | null>(null);

export function KeyboardDictationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { signedIn } = useAuth();
  const { active, phase, partial, finalText, toggle } =
    useKeyboardDictationBridge(signedIn);

  const value = useMemo(
    () => ({ active, phase, partial, finalText, toggle }),
    [active, phase, partial, finalText, toggle],
  );

  return (
    <KeyboardDictationContext.Provider value={value}>
      {children}
    </KeyboardDictationContext.Provider>
  );
}

/**
 * Read the resident session state. Returns null outside the provider (so
 * consumers can no-op safely).
 */
export function useKeyboardDictation(): KeyboardDictationContextValue | null {
  return useContext(KeyboardDictationContext);
}
