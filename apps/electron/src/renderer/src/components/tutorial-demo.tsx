import { formatAcceleratorKeys } from "@renderer/hooks/use-hotkey-recorder";
import { getApiBase } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

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
    formatAcceleratorKeys(hotkey ?? "Alt+Space"),
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

  // Resolve the hotkey: prefer the caller-provided accelerator, otherwise
  // load the configured one once.
  useEffect(() => {
    if (hotkey !== undefined) {
      const tokens = formatAcceleratorKeys(hotkey);
      if (tokens.length > 0) setHotkeyTokens(tokens);
      return;
    }
    fetch(`${getApiBase()}/api/settings/hotkey`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { value?: string } | null) => {
        const val = data?.value || "Alt+Space";
        const tokens = formatAcceleratorKeys(val);
        if (tokens.length > 0) setHotkeyTokens(tokens);
      })
      .catch(() => {
        const tokens = formatAcceleratorKeys("Alt+Space");
        if (tokens.length > 0) setHotkeyTokens(tokens);
      });
  }, [hotkey]);

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
      <div className="text-center">
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
                <FnKey pressed={pressed} label={tok} />
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
          <textarea
            // biome-ignore lint/a11y/noAutofocus: this is the one interactive target on the step
            autoFocus
            rows={3}
            aria-label="Practice dictation area"
            placeholder="Click here, hold your hotkey, and speak — your words land right here."
            className="placeholder:text-muted-foreground/70 text-foreground mt-2 block w-full resize-none border-none bg-transparent text-[17px] leading-[1.5] outline-none"
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

function StepWord({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "serif-italic transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FnKey — keycap that depresses on `pressed`.
// ---------------------------------------------------------------------------
function FnKey({
  pressed,
  label,
}: {
  pressed: boolean;
  label: string;
}): React.JSX.Element {
  const size = 38;
  return (
    <span
      className={cn(
        "mono inline-flex items-center justify-center align-middle font-semibold transition-all duration-150",
        pressed ? "text-accent-foreground" : "text-foreground",
      )}
      style={{
        height: size * 0.95,
        minWidth: size * 1.05,
        padding: "0 8px",
        borderRadius: size * 0.18,
        background: pressed ? "var(--accent)" : "var(--card)",
        border: `1.5px solid ${pressed ? "var(--primary)" : "var(--border)"}`,
        borderBottomWidth: pressed ? 1.5 : Math.max(2, size * 0.075),
        fontSize: size * 0.4,
        letterSpacing: "0.04em",
        transform: pressed ? `translateY(${size * 0.04}px)` : "translateY(0)",
        boxShadow: pressed
          ? `inset 0 -1px 0 rgba(20,12,4,0.06), 0 0 0 6px var(--accent)`
          : `0 1px 0 var(--border), 0 2px 2px -1px rgba(20,12,4,0.06)`,
        transitionTimingFunction: "cubic-bezier(0.3, 0.7, 0.4, 1)",
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wave — SVG polyline. While `pressed`, redraws on requestAnimationFrame
// using a sine-envelope × harmonics formula; otherwise renders a flat line.
// `getLiveLevel` returns the latest real mic amplitude (0..1) when the real
// hotkey is being held, or null when the demo is running its scripted loop.
// ---------------------------------------------------------------------------
function Wave({
  pressed,
  getLiveLevel,
}: {
  pressed: boolean;
  getLiveLevel: () => number | null;
}): React.JSX.Element {
  const W = 520;
  const H = 60;
  const polyRef = useRef<SVGPolylineElement>(null);
  // Smoothed amplitude so the wave doesn't twitch on noisy frames.
  const smoothedAmpRef = useRef(0);

  useEffect(() => {
    const node = polyRef.current;
    if (!node) return;

    if (!pressed) {
      // Flat resting line — set once, no animation loop.
      smoothedAmpRef.current = 0;
      const N = 60;
      const pts: string[] = [];
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W;
        pts.push(`${x.toFixed(1)},${(H / 2).toFixed(1)}`);
      }
      node.setAttribute("points", pts.join(" "));
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const N = 90;
      // Pick amplitude source: real mic level (when real hotkey is held)
      // or the scripted loudness envelope. Live level gets gain + smoothing
      // so quiet voices still draw a visible wave and the wave doesn't
      // pop on transients.
      const liveLevel = getLiveLevel();
      let amp: number;
      if (liveLevel !== null) {
        const target = Math.min(1, liveLevel * 1.6);
        smoothedAmpRef.current += (target - smoothedAmpRef.current) * 0.35;
        amp = smoothedAmpRef.current;
      } else {
        amp =
          (0.6 + 0.4 * Math.sin(t * 1.3)) * (0.7 + 0.3 * Math.sin(t * 2.4 + 1));
      }
      const pts: string[] = [];
      for (let i = 0; i <= N; i++) {
        const tt = i / N;
        const x = tt * W;
        // tapered envelope so the wave fades at both ends
        const envelope = Math.sin(Math.PI * tt);
        const a = H * 0.42 * amp * envelope;
        const y =
          H / 2 +
          a * Math.sin(tt * 9 * Math.PI + t * 5.2) * 0.7 +
          a * Math.sin(tt * 17 * Math.PI - t * 3.1) * 0.25;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      // Direct DOM write avoids one React re-render per frame.
      node.setAttribute("points", pts.join(" "));
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [pressed, getLiveLevel]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="Voice waveform"
    >
      <polyline
        ref={polyRef}
        fill="none"
        stroke={
          pressed ? "var(--accent-foreground)" : "var(--muted-foreground)"
        }
        strokeWidth={pressed ? 2 : 1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: "stroke 0.2s ease, stroke-width 0.2s ease" }}
      />
    </svg>
  );
}
