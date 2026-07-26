/**
 * One-time onboarding completion flag. Stored locally (not a cloud/dictation
 * setting) via the shared pref store. Exposes a `ready` gate so the router
 * doesn't flash the wizard before the stored value has loaded.
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

import { getPref, setPref } from "./storage";

const ONBOARDING_KEY = "onboarding_complete";

interface OnboardingContextValue {
  complete: boolean;
  ready: boolean;
  finish: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [complete, setComplete] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getPref(ONBOARDING_KEY);
      setComplete(stored === "true");
      setReady(true);
    })();
  }, []);

  const finish = useCallback(() => {
    setComplete(true);
    void setPref(ONBOARDING_KEY, "true");
  }, []);

  const value = useMemo(
    () => ({ complete, ready, finish }),
    [complete, ready, finish],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return ctx;
}
