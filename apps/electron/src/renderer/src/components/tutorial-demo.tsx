import { formatAcceleratorKeys } from "@renderer/hooks/use-hotkey-recorder";
import { settingsQueryOptions } from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultHotkey } from "../../../shared/hotkey-defaults";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";
import { Keycap, StepWord, Wave } from "./onboarding/coach-strip";
import { Textarea } from "./ui/textarea";

// ---------------------------------------------------------------------------
// Tutorial — animated 3-phase loop:
//   idle (1.8s) → pressed (3.6s, animated wave) → result (2.4s, transcript)
// On real hotkey-down/up, the auto-loop is suspended and the demo follows
// the user's actual press.
//
// Shared between the Today page and onboarding's "how to use" step. Pass
// `hotkey` (an Electron accelerator like "Alt+Space") to drive the keycaps
// from caller state — e.g. while the user is rebinding it live in
// onboarding. When omitted, the demo loads the configured hotkey itself.
// ---------------------------------------------------------------------------

type DemoPhase = "idle" | "pressed" | "result";

const PHASE_STEPS: ReadonlyArray<readonly [DemoPhase, number]> = [
  ["idle", 1800],
  ["pressed", 3600],
  ["result", 2400],
];

const SAMPLE_TRANSCRIPT = "Pushing the meeting to tomorrow at ten.";

// Platform-aware default, mirrored from the main process via the preload.
const DEFAULT_HOTKEY = window.api?.defaultHotkey ?? getDefaultHotkey();

export function TutorialDemo({
  hotkey,
  interactive = false,
  onDictation,
}: {
  hotkey?: string;
  // When true, the result line becomes a real editable textarea the user can
  // dictate into (the transcription pastes in like any other app), and the
  // scripted idle→pressed→result loop is disabled so the box stays calm until
  // a real hotkey press.
  interactive?: boolean;
  // Fired on each real hotkey press while interactive (used by onboarding to
  // log that the user actually tried dictation).
  onDictation?: () => void;
}): React.JSX.Element {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [hotkeyTokens, setHotkeyTokens] = useState<string[]>(() =>
    formatAcceleratorKeys(hotkey ?? DEFAULT_HOTKEY),
  );
  const stepRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  // suspendedRef pauses the auto-loop while the real hotkey is held
  const suspendedRef = useRef(false);
  // Latest mic amplitude (0..1) broadcast by the pill via main. Refs avoid
  // re-rendering this component at 60Hz; Wave reads it inside its RAF loop.
  const audioLevelRef = useRef(0);
  // True while the real hotkey is held — switches Wave from scripted
  // amplitude to live amplitude.
  const livePressRef = useRef(false);
  // Keep the latest onDictation callback without re-subscribing the hotkey
  // listeners every render (the parent passes a fresh closure each time).
  const onDictationRef = useRef(onDictation);
  onDictationRef.current = onDictation;

  const clearLoop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Auto-loop tick. Re-entered after each timeout fires (or when manually
  // restarted after a real hotkey release).
  const tick = useCallback(() => {
    if (suspendedRef.current) return;
    const [name, dur] = PHASE_STEPS[stepRef.current % PHASE_STEPS.length];
    setPhase(name);
    stepRef.current += 1;
    timeoutRef.current = window.setTimeout(tick, dur);
  }, []);

  useEffect(() => {
    // In interactive mode the demo only reacts to real hotkey presses, so the
    // scripted loop never starts.
    if (interactive) return;
    tick();
    return clearLoop;
  }, [tick, clearLoop, interactive]);

  // Read the configured hotkey from the shared settings cache (deduped with
  // every other settings consumer); skipped when the caller drives it.
  const { data: settingsData } = useQuery({
    ...settingsQueryOptions(),
    enabled: hotkey === undefined,
  });

  // Resolve the hotkey: prefer the caller-provided accelerator, otherwise fall
  // back to the configured one (default while it loads).
  useEffect(() => {
    const val =
      hotkey ?? settingsData?.[SETTINGS_KEYS.hotkey] ?? DEFAULT_HOTKEY;
    const tokens = formatAcceleratorKeys(val);
    if (tokens.length > 0) setHotkeyTokens(tokens);
  }, [hotkey, settingsData]);

  // Real hotkey events override the loop while held.
  useEffect(() => {
    const removeDown = window.api?.onHotkeyDown(() => {
      suspendedRef.current = true;
      livePressRef.current = true;
      // Reset amplitude so the wave starts flat until the pill warms up
      // the mic (usually within 100ms).
      audioLevelRef.current = 0;
      clearLoop();
      setPhase("pressed");
      if (interactive) onDictationRef.current?.();
    });
    const removeUp = window.api?.onHotkeyUp(() => {
      livePressRef.current = false;
      setPhase("result");
      clearLoop();
      timeoutRef.current = window.setTimeout(() => {
        if (interactive) {
          // Settle back to idle — no scripted loop to resume.
          setPhase("idle");
          return;
        }
        // Resume auto-loop on the next phase after a result hold.
        suspendedRef.current = false;
        stepRef.current = 0;
        tick();
      }, PHASE_STEPS[2][1]);
    });
    return () => {
      removeDown?.();
      removeUp?.();
    };
  }, [tick, clearLoop, interactive]);

  // Subscribe to live audio levels broadcast by the pill. Writing to a ref
  // (rather than state) avoids 60Hz re-renders.
  useEffect(() => {
    const remove = window.api?.onAudioLevel((level: number) => {
      audioLevelRef.current = level;
    });
    return () => remove?.();
  }, []);

  // Stable accessor — Wave's RAF effect depends on it; recreating it each
  // render would tear down and rebuild the RAF loop.
  const getLiveLevel = useCallback(
    () => (livePressRef.current ? audioLevelRef.current : null),
    [],
  );

  const pressed = phase === "pressed";
  const showResult = phase === "result";

  return (
    <div className="border-border bg-card flex flex-col items-center gap-5 rounded-[16px] border px-7 py-7">
      {/* Instructional sentence */}
      <div className="select-none text-center">
        <div className="serif text-foreground text-[34px] leading-[1.1] font-normal tracking-tight">
          <StepWord active={phase === "idle"}>Press</StepWord>{" "}
          <span className="inline-block align-middle">
            {hotkeyTokens.map((tok, i) => (
              <span key={`${tok}-${i}`} className="inline-block align-middle">
                {i > 0 && (
                  <span className="text-muted-foreground mx-1 text-[16px]">
                    +
                  </span>
                )}
                <Keycap pressed={pressed} label={tok} />
              </span>
            ))}
          </span>{" "}
          <StepWord active={pressed}>, speak,</StepWord>{" "}
          <StepWord active={showResult}>release.</StepWord>
        </div>
      </div>

      {/* Wave + status card */}
      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden rounded-[12px] border px-5 py-4 transition-colors duration-200",
          pressed ? "border-primary bg-accent" : "border-border bg-sidebar",
        )}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full transition-all duration-200",
              pressed
                ? "bg-primary opacity-100"
                : showResult
                  ? "bg-primary opacity-100"
                  : "bg-muted-foreground opacity-40",
            )}
            style={
              pressed ? { animation: "tdot 1.6s infinite ease-in-out" } : {}
            }
          />
          <span
            className={cn(
              "mono text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors",
              pressed
                ? "text-accent-foreground"
                : showResult
                  ? "text-accent-foreground"
                  : "text-muted-foreground",
            )}
          >
            {phase === "idle"
              ? "Ready"
              : pressed
                ? "Listening…"
                : interactive
                  ? "Pasted below"
                  : "Pasted to your app"}
          </span>
        </div>

        <Wave pressed={pressed} getLiveLevel={getLiveLevel} />

        {interactive ? (
          // Real practice area — focus it, hold the hotkey, and the
          // transcription pastes in just like in any other app.
          <Textarea
            autoFocus
            rows={3}
            aria-label="Practice dictation area"
            placeholder="Click here, hold your hotkey, and speak — your words land right here."
            className="placeholder:text-muted-foreground/70 text-foreground mt-2 block min-h-0 w-full resize-none border-none bg-transparent px-0 py-0 text-[17px] leading-[1.5] shadow-none outline-none focus-visible:border-none focus-visible:ring-0 dark:bg-transparent"
          />
        ) : (
          // Result transcript
          <div
            className="mt-1 min-h-[24px] transition-all duration-300"
            style={{
              opacity: showResult ? 1 : 0,
              transform: showResult ? "translateY(0)" : "translateY(4px)",
            }}
          >
            <span className="serif text-foreground text-[17px] leading-[1.4]">
              "{SAMPLE_TRANSCRIPT}"
            </span>
          </div>
        )}
      </div>

      {/* CSS for the pulsing status dot */}
      <style>{`@keyframes tdot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }`}</style>
    </div>
  );
}
