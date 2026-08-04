import { cn } from "@renderer/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Coach strip — the keycap sentence, status dot, and live waveform shared by
// onboarding's draft and remix steps. Extracted from tutorial-demo.tsx and
// parameterized by which key events drive it (dictation vs remix hotkey).
// ---------------------------------------------------------------------------

export type CoachPhase = "idle" | "pressed" | "result";

const RESULT_HOLD_MS = 2400;

/**
 * Track a hold-to-speak press: keycap phase plus live mic amplitude. The
 * amplitude lives in a ref (the pill broadcasts it at 60Hz) and is read by
 * Wave inside its RAF loop, so no re-render per frame.
 */
export function useCoachPress(
  source: "dictation" | "remix",
  handlers?: { onDown?: () => void; onUp?: () => void },
): { phase: CoachPhase; getLiveLevel: () => number | null } {
  const [phase, setPhase] = useState<CoachPhase>("idle");
  const audioLevelRef = useRef(0);
  const livePressRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const onDownRef = useRef(handlers?.onDown);
  const onUpRef = useRef(handlers?.onUp);
  onDownRef.current = handlers?.onDown;
  onUpRef.current = handlers?.onUp;

  useEffect(() => {
    const subscribeDown =
      source === "remix" ? window.api?.onRemixDown : window.api?.onHotkeyDown;
    const subscribeUp =
      source === "remix" ? window.api?.onRemixUp : window.api?.onHotkeyUp;
    const removeDown = subscribeDown?.(() => {
      livePressRef.current = true;
      audioLevelRef.current = 0;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setPhase("pressed");
      onDownRef.current?.();
    });
    const removeUp = subscribeUp?.(() => {
      livePressRef.current = false;
      setPhase("result");
      onUpRef.current?.();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setPhase("idle");
      }, RESULT_HOLD_MS);
    });
    return () => {
      removeDown?.();
      removeUp?.();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [source]);

  useEffect(() => {
    const remove = window.api?.onAudioLevel((level: number) => {
      audioLevelRef.current = level;
    });
    return () => remove?.();
  }, []);

  const getLiveLevel = useCallback(
    () => (livePressRef.current ? audioLevelRef.current : null),
    [],
  );

  return { phase, getLiveLevel };
}

export function CoachStrip({
  keys,
  phase,
  lead,
  instructionPrefix,
  instructionSuffix,
  sayText,
  statusLabel,
  statusEmphasis,
  getLiveLevel,
  children,
}: {
  keys: string[];
  phase: CoachPhase;
  /** Optional context line above the instruction (e.g. "keep it highlighted"). */
  lead?: React.ReactNode;
  /** Instruction sentence around the inline keycaps:
   * "{prefix} [keys] {suffix}" — e.g. "Click into the email, hold [Fn] and say:". */
  instructionPrefix: string;
  instructionSuffix: string;
  /** The exact words the user should speak, shown as a quote. */
  sayText: string;
  statusLabel: string;
  statusEmphasis: boolean;
  getLiveLevel: () => number | null;
  children?: React.ReactNode;
}): React.JSX.Element {
  const pressed = phase === "pressed";
  return (
    <div className="flex w-full flex-col gap-4">
      {lead && (
        <p className="text-muted-foreground text-[14px] leading-relaxed">
          {lead}
        </p>
      )}

      <p className="text-foreground text-[14.5px] leading-[2]">
        {instructionPrefix}{" "}
        <span className="inline-block align-middle whitespace-nowrap">
          {keys.map((tok, i) => (
            <span key={`${tok}-${i}`} className="inline-block align-middle">
              {i > 0 && (
                <span className="text-muted-foreground mx-1 text-[13px]">
                  +
                </span>
              )}
              <Keycap pressed={pressed} label={tok} size={28} />
            </span>
          ))}
        </span>{" "}
        {instructionSuffix}
      </p>

      <div
        className={cn(
          "rounded-[12px] border px-4 py-3 transition-colors duration-200",
          pressed ? "border-primary bg-accent" : "border-border bg-card",
        )}
      >
        <p
          className={cn(
            "text-[16px] leading-relaxed font-medium transition-colors",
            pressed ? "text-accent-foreground" : "text-foreground",
          )}
        >
          "{sayText}"
        </p>
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-[12px] border px-5 py-3.5 transition-colors duration-200",
          pressed ? "border-primary bg-accent" : "border-border bg-sidebar",
        )}
      >
        <div className="mb-1.5 flex items-center gap-2.5">
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full transition-all duration-200",
              statusEmphasis
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
              statusEmphasis
                ? "text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </div>
        <Wave pressed={pressed} getLiveLevel={getLiveLevel} height={44} />
      </div>

      {children}

      <style>{`@keyframes tdot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }`}</style>
    </div>
  );
}

export function StepWord({
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
// Keycap — depresses on `pressed`.
// ---------------------------------------------------------------------------
export function Keycap({
  pressed,
  label,
  size = 38,
}: {
  pressed: boolean;
  label: string;
  size?: number;
}): React.JSX.Element {
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
// hotkey is being held, or null when a scripted loop is running.
// ---------------------------------------------------------------------------
export function Wave({
  pressed,
  getLiveLevel,
  height = 60,
}: {
  pressed: boolean;
  getLiveLevel: () => number | null;
  height?: number;
}): React.JSX.Element {
  const W = 520;
  const H = height;
  const polyRef = useRef<SVGPolylineElement>(null);
  const smoothedAmpRef = useRef(0);

  useEffect(() => {
    const node = polyRef.current;
    if (!node) return;

    if (!pressed) {
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
      // Amplitude source: real mic level while the key is held, otherwise a
      // scripted loudness envelope. Live level gets gain + smoothing so quiet
      // voices still draw a visible wave without popping on transients.
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
  }, [pressed, getLiveLevel, H]);

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
