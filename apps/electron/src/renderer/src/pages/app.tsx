import { COMMAND_PRESETS } from "@freestyle-voice/validations";
import { capture } from "@renderer/lib/analytics";
import {
  apiFetch,
  getApiBase,
  getClient,
  getServerToken,
  isRemoteServer,
  refreshApiBase,
} from "@renderer/lib/api";
import {
  applyNeedsAppContextForCleanup,
  refreshNeedsAppContextForCleanup,
} from "@renderer/lib/cleanup-app-context";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer, type StreamerConnectionState } from "@renderer/lib/streamer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioPlaybackMode,
  normalizeAudioPlaybackMode,
} from "../../../shared/audio-playback";
import {
  COMMAND_HOLD_THRESHOLD_MS,
  COMMAND_IDLE_MS,
} from "../../../shared/commands";
import {
  normalizePillCancelMode,
  type PillCancelMode,
} from "../../../shared/pill-cancel";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

const BARS = 10;
const RISE = 0.55;
const FALL = 0.22;
/** Peak bar height. Kept well under PILL_HEIGHT so the waveform never
 * crowds the capsule's edge, even at full volume. */
const SVG_HEIGHT = 14;
/** Bar thickness; also the height of a bar at rest (drawn as a round dot). */
const BAR_WIDTH = 2.5;
/**
 * Horizontal pitch between bars — fixed, so the row's density never changes.
 * The waveform's width follows from it and from BARS, and the difference
 * against PILL_CORE_WIDTH is the margin the row sits in: dropping a bar makes
 * the row narrower and the capsule's edges roomier, rather than spreading the
 * remaining bars further apart.
 */
const BAR_PITCH = 6;
const SVG_WIDTH = BARS * BAR_PITCH;
const BAR_X_POSITIONS = Array.from(
  { length: BARS },
  (_, index) => BAR_PITCH * (index + 0.5),
);
/**
 * How long each bar represents while recording. Every interval the sampled
 * levels hand off one slot to the left; the bars themselves never move.
 */
const SAMPLE_MS = 75;
/** Frequency band summed to get the voice level, in Hz. */
const VOICE_MIN_HZ = 80;
const VOICE_MAX_HZ = 4000;
/**
 * Per-frame easing for the live recording waveform. Both are deliberately
 * close to 1: this row is a level meter, and the eye reads any lag between a
 * syllable and the bar answering it as the app being slow. What smoothing is
 * left is only there to keep single-frame FFT noise from flickering the row —
 * everything below ~0.6 starts to feel like the waveform is trailing you.
 */
const LEVEL_RISE = 0.8;
const LEVEL_FALL = 0.78;
/**
 * The analyser's own exponential smoothing across FFT frames. This one is
 * upstream of everything else, so its lag is paid twice over — once on the way
 * up and once on the way down. Low enough to stay out of the way; not zero,
 * which would put raw bin noise straight into the bars.
 */
const ANALYSER_SMOOTHING = 0.15;

/**
 * Response curve for the recording waveform, applied to the raw voice level.
 *
 * `getByteFrequencyData` is already dB-scaled, and the old mapping (a linear
 * gain with a hard clamp) ran straight into its ceiling: anything above a
 * soft voice pinned every bar to full height, which both looked cramped
 * against the capsule and threw away all the dynamics.
 *
 * These drive a saturating exponential instead — steep at the bottom so a
 * whisper already reaches roughly half height, then flattening toward
 * BAR_CEILING, which no amount of volume quite reaches.
 *
 * BAR_NOISE_FLOOR is subtracted first so room tone still renders as the
 * resting dots rather than a permanent low ripple. It and BAR_GAIN are the
 * two worth re-tuning against a real mic.
 */
const BAR_NOISE_FLOOR = 0.05;
const BAR_GAIN = 8;
const BAR_CEILING = 0.82;

/**
 * Random spread that gives the waveform texture instead of a flat plateau
 * while you talk. Two components, because one alone doesn't cover the range:
 *
 * `scale` multiplies the level *before* the response curve. An upward kick is
 * compressed by the saturation rather than clipping flat against the ceiling,
 * and the effect scales with loudness for free — a jittered room tone still
 * lands under the resting-dot threshold, so silence stays still. But the same
 * saturation flattens it out again once you're loud.
 *
 * `trim` then takes a downward-only bite out of the height *after* the curve,
 * which is what keeps the peaks alive where the curve has gone flat. Only ever
 * subtracting means the ceiling still holds.
 *
 * Both are drawn once per sample rather than per frame, so the values freeze
 * into the row and travel left with it. Re-rolling every frame would read as
 * flicker rather than as waveform texture.
 */
const BAR_JITTER = 0.35;
const BAR_TRIM = 0.14;

interface BarJitter {
  scale: number;
  trim: number;
}

function nextJitter(): BarJitter {
  return {
    scale: 1 + (Math.random() * 2 - 1) * BAR_JITTER,
    trim: Math.random() * BAR_TRIM,
  };
}

/** Maps one sampled voice level, plus that sample's jitter, to a bar height. */
function barHeightFor(voiceLevel: number, jitter: BarJitter): number {
  const excess = Math.max(0, voiceLevel * jitter.scale - BAR_NOISE_FLOOR);
  return BAR_CEILING * (1 - Math.exp(-BAR_GAIN * excess)) * (1 - jitter.trim);
}

type PillState =
  | "idle"
  | "initializing"
  | "recording"
  | "transcribing"
  | "error";

/**
 * Every notice here is something having gone wrong, which is the whole bar for
 * showing one: a cold cloud session that is merely slow gets no mark at all,
 * because the pill appears on every single dictation and a spinner that cries
 * wolf on the happy path is just noise over the user's work. The first two are
 * recoveries in progress (a turning ring); the rest are stalled (an alert
 * ring).
 */
type PillNotice =
  | "reconnecting"
  | "retrying"
  | "sign-in"
  | "limit"
  | "unavailable"
  | null;

type BarMode = "connecting" | "listening" | "speaking";

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _outputMode = "paste";
let _audioPlaybackMode: AudioPlaybackMode = "off";
let _toneCtx: AudioContext | null = null;

/**
 * Whether any loaded plugin implements `beforeOutput` (a suppression-capable
 * output hook). Cached so the delivery hot path doesn't round-trip every time.
 * Drives the fail-closed policy in `deliverFinal`: when a hook exists and the
 * `/deliver` call fails, we must NOT paste the raw text (that would bypass a
 * redaction/PII plugin). Assumed absent until proven present.
 */
let _beforeOutputHookPresent = false;

async function refreshBeforeOutputHookPresence(): Promise<void> {
  try {
    const res = await getClient().api.output.hook.$get(
      {},
      { init: { signal: AbortSignal.timeout(3000) } },
    );
    if (res.ok) _beforeOutputHookPresent = (await res.json()).present;
  } catch {
    // Leave the last-known value; a stale "present" errs safe (fail closed).
  }
}

function getToneCtx(): AudioContext {
  if (!_toneCtx || _toneCtx.state === "closed") _toneCtx = new AudioContext();
  return _toneCtx;
}

type TonePreset = "start" | "stop";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 347, ms: 125 }, // F4
  stop: { freq: 255, ms: 125 }, // C4
};

async function playTone(preset: TonePreset, volume = 0.16): Promise<void> {
  if (!_soundEnabled) return;
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = getToneCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    const dur = ms / 1000;
    const attack = Math.min(0.02, dur * 0.25);
    const g = gain.gain;
    g.setValueAtTime(0.0001, now);
    g.linearRampToValueAtTime(volume, now + attack);
    g.exponentialRampToValueAtTime(0.001, now + dur);
    g.linearRampToValueAtTime(0, now + dur + 0.012);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {}
}

/**
 * Advances `bars` one frame toward `targets`, in place — this runs at 60fps,
 * so it deliberately doesn't allocate. Separate rise and fall rates let a
 * waveform snap up to a peak and settle back more gently; pass the same value
 * for both to ease symmetrically.
 */
function easeBars(
  bars: number[],
  targets: number[],
  rise: number,
  fall: number,
): void {
  for (let i = 0; i < bars.length; i++) {
    const target = targets[i] ?? 0;
    bars[i] += (target - bars[i]) * (target > bars[i] ? rise : fall);
  }
}

const PILL_HEIGHT = 30;
/**
 * The capsule's fixed core — the cancel slot and the waveform. Status that has
 * to be disclosed (the aside) is appended *outside* this, and grows the capsule
 * by exactly its own width, so the waveform never shifts or shrinks to make
 * room for a label.
 *
 * Wide enough to hold the waveform with an even margin either side at rest,
 * and to still contain it once the cancel button has opened (which costs the
 * row a net BAR_PITCH * CANCEL_HIDDEN_BARS less than the slot it takes).
 */
const PILL_CORE_WIDTH = 96;
/** The expanded card, in the space `window.api.setPillExpanded` opens up. */
const PILL_CARD_WIDTH = 300;
/**
 * How long a warning stays up before dismissing itself. The command warning
 * is a dead end — nothing to do but read it — so it leaves quickly. The
 * dictation failure card can carry a Retry, and a button that vanishes while
 * you are deciding is worse than one that lingers.
 */
const COMMAND_WARNING_MS = 4500;
const FAILURE_CARD_MS = 9000;
/**
 * The cancel button lives at the left end of the capsule, and its space is
 * only taken while it's on screen. Opening it widens its slot to CANCEL_SLOT
 * (the disc plus a gap) and narrows the waveform's viewport by exactly
 * CANCEL_HIDDEN_BARS bars' worth, so the capsule's width never changes — the
 * two oldest samples make way and the rest of the row slides across.
 */
const CANCEL_SIZE = 16;
const CANCEL_SLOT = 23;
const CANCEL_HIDDEN_BARS = 2;
const CANCEL_HIDDEN_SPAN = CANCEL_HIDDEN_BARS * BAR_PITCH;
/** Per-frame easing of the open/close amount; ~95% of the way in ~230ms. */
const CANCEL_EASE = 0.2;

/**
 * Status sits at the other end of the capsule, in a mark the same size as the
 * cancel one — a spinner while something is still working, an alert once it
 * isn't. The distinction between the two ends is action (left) vs state
 * (right), which is also why this one is a circular silhouette rather than a
 * bare glyph. The slot is the mark plus the gap to the capsule's edge.
 */
const STATUS_SIZE = CANCEL_SIZE;
const STATUS_GAP = 6;
const STATUS_SLOT = STATUS_SIZE + STATUS_GAP;

/**
 * The pill floats over arbitrary application windows, so it commits to a
 * single dark treatment in both themes rather than following the app theme —
 * a light pill reads as a blown-out blob over dark editors. The tint is the
 * brand's dark surface, translucent over a blur so it picks up a hint of
 * whatever is behind it.
 */
const SURFACE = "rgba(22, 20, 15, 0.92)";
const SURFACE_BORDER = "1px solid rgba(255, 255, 255, 0.10)";
const BLUR = "blur(20px) saturate(180%)";
/** Cream ink, and the terracotta the palette reserves for failures. */
const INK = "#F5F1E4";
const ALERT = "#E0805F";
/**
 * The waveform is the exception to the cream: solid white at full opacity, in
 * every state. Level is expressed by bar height alone, so nothing here is
 * dimmed to encode it.
 */
const BAR_COLOR = "#FFFFFF";

const pillInnerStyle: React.CSSProperties = {
  height: PILL_HEIGHT,
  borderRadius: PILL_HEIGHT / 2,
  background: SURFACE,
  border: SURFACE_BORDER,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  cursor: "grab",
  WebkitAppRegion: "drag",
} as React.CSSProperties;

interface TranscribeResult {
  raw: string;
  cleaned: string;
  error?: string;
  cloudAuthRequired?: boolean;
  usageExceeded?: boolean;
  providerCategory?: string;
  /**
   * Terminal pipeline disposition from the server. A plugin that called
   * `api.control.consume()`/`abort()` in a server hook resolves to
   * `"suppressed"`/`"aborted"` here, and the dictation is dropped without
   * delivery. Defaults to `"deliver"` for older server responses.
   */
  disposition?: "deliver" | "suppressed" | "aborted";
}

/**
 * Error text attached to usage-limit results. The interactive prompt (with an
 * "Upgrade to Pro" action) is shown by the main process via
 * `window.api.cloudPromptUpgrade()` — this string only surfaces where a plain
 * error message is needed.
 */
const USAGE_LIMIT_DIALOG_MESSAGE =
  "You've used your free Freestyle Cloud dictation for this week. Upgrade to Pro for unlimited dictation, or switch to a local or bring-your-own-key model in Settings > Models.";

/**
 * The app context (process name + window title) can contain characters
 * outside ISO-8859-1 — e.g. a Cyrillic file path in the Notepad++ title
 * bar. HTTP header values only allow Latin-1, so passing the raw JSON
 * makes fetch() throw "Failed to execute 'fetch'". Percent-encode it so
 * the header is always byte-safe; the server decodes it back.
 */
function encodeAppContext(context: string): string {
  return encodeURIComponent(context);
}

interface QueueEntry {
  promise: Promise<TranscribeResult>;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Where a command run has got to.
 *
 * The two ways in share a single hotkey and therefore a single opening state:
 * the moment it goes down we don't yet know whether this is a tap (show the
 * list) or a hold (record an instruction), so `capturing` optimistically does
 * both — the card is up and the mic is running — and the key going up decides
 * which of the two the user meant.
 */
type CommandPhase = "capturing" | "picking" | "listening" | "running" | "error";

interface CommandSession {
  phase: CommandPhase;
  /** The captured selection; null until the copy comes back. */
  selection: string | null;
  /** What is being applied, shown while `running`. */
  label?: string;
  title?: string;
  body?: string;
}

/** A promise that something else resolves. Used to await the selection. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const stateRef = useRef<PillState>("idle");
  const setPillState = useCallback((next: PillState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [pillAlign, setPillAlign] = useState<"start" | "end">("end");
  const [pillSide, setPillSide] = useState<"center" | "right">("center");
  const [cancelMode, setCancelMode] = useState<PillCancelMode>("hover");
  const [pillNotice, setPillNoticeState] = useState<PillNotice>(null);
  const pillNoticeRef = useRef<PillNotice>(null);
  const setPillNotice = useCallback((notice: PillNotice) => {
    pillNoticeRef.current = notice;
    setPillNoticeState(notice);
  }, []);
  const [canRetry, setCanRetry] = useState(false);

  const supportsSessionTransportRef = useRef(false);
  const recordingSessionUsesTransportRef = useRef(false);
  const providerCategoryRef = useRef<string | null>(null);
  const streamSessionErrorRef = useRef<{
    message: string;
    code?: string;
  } | null>(null);
  const failedTranscriptionErrorRef = useRef("Transcription failed");
  const lastRecordingDurationRef = useRef(0);

  const [pendingCount, setPendingCount] = useState(0);

  // ---- Commands ----
  const [command, setCommandState] = useState<CommandSession | null>(null);
  const commandRef = useRef<CommandSession | null>(null);
  const setCommand = useCallback((next: CommandSession | null) => {
    commandRef.current = next;
    setCommandState(next);
  }, []);
  /** Patch the live session, ignoring the call if it has since been torn down. */
  const patchCommand = useCallback((patch: Partial<CommandSession>) => {
    const current = commandRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    commandRef.current = next;
    setCommandState(next);
  }, []);
  const commandDownAtRef = useRef(0);
  /** Resolved by the `command:selection` IPC, awaited by whatever runs. */
  const commandSelectionRef = useRef<Deferred<string | null> | null>(null);
  const commandIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Guards against a second run being kicked off from the same session. */
  const commandRunningRef = useRef(false);
  /** Flips the card from "capturing" to "listening" once a press is a hold. */
  const commandHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  /** Heights actually drawn; eased toward `targetsRef` every frame. */
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  /**
   * The bar elements, captured when the SVG mounts. The draw step runs every
   * frame, so it reads this rather than re-querying the DOM each time.
   */
  const barLinesRef = useRef<SVGLineElement[]>([]);
  /**
   * How far the cancel button is open, 0 (hidden, full waveform) to 1 (shown,
   * two bars given up). Eased in the draw loop rather than by CSS so the
   * layout, the button's fade and the outgoing bars' fade all advance on the
   * same clock. `lastCancelWrite` keeps a settled value from re-writing
   * styles — and so from laying out — every frame.
   */
  const cancelOpenRef = useRef(0);
  const cancelTargetRef = useRef(0);
  const lastCancelWriteRef = useRef(-1);
  const cancelSlotRef = useRef<HTMLSpanElement>(null);
  const waveClipRef = useRef<HTMLSpanElement>(null);
  const hoveredRef = useRef(false);
  const cancelModeRef = useRef<PillCancelMode>("hover");
  /**
   * What the bars are easing toward. Every mode writes this; while recording
   * it doubles as a shift register, each slot handing its value to its
   * left-hand neighbour once per SAMPLE_MS. `peak` holds the loudest level
   * seen since the last hand-off, so a brief transient isn't missed.
   */
  const targetsRef = useRef<number[]>(new Array(BARS).fill(0));
  const sampleRef = useRef<{
    lastSampleAt: number;
    peak: number;
    jitter: BarJitter;
  }>({ lastSampleAt: 0, peak: 0, jitter: { scale: 1, trim: 0 } });
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const wantsMicRef = useRef(false);
  /** True only while state is "recording" — used by the queue drain wait loop. */
  const recordingActiveRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const pendingCommitRef = useRef(false);
  const pillActiveRef = useRef(false);
  // Tracks the in-flight prepareSystemAudio() (ducking) call. Ducking runs
  // concurrently with mic acquisition, so every restore must wait for this
  // to settle — otherwise a restore that lands before the duck applies is a
  // no-op and leaves the system volume stuck low.
  const duckingPromiseRef = useRef<Promise<unknown> | undefined>(undefined);
  const barModeRef = useRef<BarMode | null>(null);
  const modeStartRef = useRef(0);
  const lastIpcTimeRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  /**
   * The voice band (80-4000Hz) as analyser bin indices, plus the divisor that
   * turns a bin sum into a 0..1 level. Derived once when the analyser is
   * built — sample rate and fftSize are fixed for the life of the node, so
   * there's no reason to recompute this every frame.
   */
  const voiceBandRef = useRef({ startBin: 0, endBin: 0, levelDivisor: 1 });

  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const streamResolverRef = useRef<((r: TranscribeResult) => void) | null>(
    null,
  );
  const drainAgainRef = useRef(false);
  // Set when the user presses the hotkey to start a new dictation while a
  // streaming commit is still finalizing. The single WebSocket/PCM buffer can't
  // host two streaming sessions at once, so instead of dropping the press we
  // replay it once the pending commit resolves.
  const pendingReRecordRef = useRef(false);

  const isTranscriptionIdle = useCallback(
    (): boolean =>
      queueRef.current.length === 0 &&
      !drainingRef.current &&
      streamResolverRef.current === null,
    [],
  );

  // ---- Queue drain ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: drainQueue only reads refs plus hidePill, which is declared later in this component, so adding it to the deps array would reference it before initialization (TDZ). The empty array is intentional.
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) {
      drainAgainRef.current = true;
      return;
    }
    drainingRef.current = true;

    try {
      while (recordingActiveRef.current && pillActiveRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!pillActiveRef.current || queueRef.current.length === 0) {
        return;
      }

      const batch = [...queueRef.current];
      queueRef.current = [];

      const results = await Promise.all(batch.map((e) => e.promise));

      if (!pillActiveRef.current) {
        return;
      }

      // A dictation is deliverable only when it has text AND the server
      // didn't mark it suppressed/aborted (a plugin calling
      // `api.control.consume()`/`abort()` in a server hook). Absent
      // disposition (older responses) is treated as "deliver".
      const isDeliverable = (r: TranscribeResult): boolean =>
        !!r.raw.trim() && (r.disposition ?? "deliver") === "deliver";

      if (
        recordingActiveRef.current ||
        wantsMicRef.current ||
        queueRef.current.length > 0
      ) {
        const resolved = results
          .filter(isDeliverable)
          .map((r) => ({ promise: Promise.resolve(r) }));
        queueRef.current = [...resolved, ...queueRef.current];
        return;
      }

      const nonEmpty = results.filter(isDeliverable);
      if (nonEmpty.length === 0) {
        if (results.some((r) => r.cloudAuthRequired)) {
          hidePill();
          void window.api.cloudPromptSignIn();
          return;
        }
        if (results.some((r) => r.usageExceeded)) {
          hidePill();
          void window.api.cloudPromptUpgrade();
          return;
        }
        const errMsg = results.find((r) => r.error)?.error;
        if (errMsg) {
          failedTranscriptionErrorRef.current = errMsg;
          setCanRetry(streamerRef.current?.hasCapturedAudio() ?? false);
          setPillNotice("unavailable");
          setPillState("error");
        } else if (wantsMicRef.current) {
          // Re-record may have resolved the in-flight stream with an empty
          // result; a new recording is starting — keep the pill visible.
          return;
        } else {
          hidePill();
        }
        return;
      }

      let finalText: string;

      if (nonEmpty.length === 1) {
        finalText = nonEmpty[0].cleaned.trim() || nonEmpty[0].raw.trim();
      } else {
        const combined = nonEmpty.map((r) => r.raw).join(" ");
        try {
          const res = await getClient().api["post-process"].$post({
            json: {
              text: combined,
              appContext: appContextRef.current,
            },
          });
          if (!pillActiveRef.current) {
            return;
          }
          if (res.ok) {
            const data = await res.json();
            // A plugin that consumed/aborted during the multi-segment merge
            // suppresses delivery: keep the text empty so it's dropped below,
            // rather than falling back to the combined raw.
            finalText =
              data.disposition && data.disposition !== "deliver"
                ? ""
                : data.cleaned || combined;
          } else if (res.status === 401) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (body?.error === "cloud_auth_required") {
              hidePill();
              void window.api.cloudPromptSignIn();
              return;
            }
            finalText = combined;
          } else {
            finalText = combined;
          }
        } catch {
          finalText = combined;
        }
      }

      if (!pillActiveRef.current) {
        return;
      }

      if (recordingActiveRef.current || queueRef.current.length > 0) {
        queueRef.current = [
          { promise: Promise.resolve({ raw: finalText, cleaned: finalText }) },
          ...queueRef.current,
        ];
        return;
      }

      try {
        const requestedMode =
          _outputMode === "clipboard" ? "clipboard" : "paste";
        let deliverText = finalText;
        let deliverMode: "paste" | "clipboard" = requestedMode;
        let shouldDeliver = true;

        // Run the `beforeOutput` plugin hook server-side, on the final
        // (post multi-segment-merge) text — this is the one point where the
        // fully-assembled dictation is known, whether it came from a single
        // chunk or several combined via `/api/post-process`.
        //
        // Fail-closed: if a `beforeOutput` hook exists (it may suppress/redact)
        // and this call fails, we must NOT paste the raw text — dropping the
        // dictation is safer than leaking un-redacted output. When no such hook
        // is present, a transient failure falls back to delivering unchanged.
        try {
          const res = await getClient().api.output.deliver.$post({
            json: {
              text: finalText,
              mode: requestedMode,
              appContext: appContextRef.current,
            },
          });
          if (res.ok) {
            const data = await res.json();
            deliverText = data.output.text;
            deliverMode =
              data.output.mode === "clipboard" ? "clipboard" : "paste";
            shouldDeliver = data.disposition === "deliver";
            // The call succeeded, so the server's registry is reachable: refresh
            // our cached hook-presence for the next (possibly failing) delivery.
            void refreshBeforeOutputHookPresence();
          } else if (_beforeOutputHookPresent) {
            shouldDeliver = false;
          }
        } catch {
          if (_beforeOutputHookPresent) {
            // Fail closed: a suppression-capable hook exists but we couldn't run
            // it. Drop delivery rather than risk leaking un-redacted text.
            shouldDeliver = false;
            console.warn(
              "[pill] beforeOutput unreachable; suppressing delivery (fail-closed)",
            );
          }
          // Otherwise best-effort — deliver the client-decided text/mode.
        }

        if (shouldDeliver && deliverText.trim()) {
          if (deliverMode === "clipboard") {
            await window.api.copyText(deliverText, appContextRef.current);
          } else {
            await window.api.pasteText(deliverText, appContextRef.current);
          }
        }
      } catch (err) {
        console.error("[pill] paste/copy failed:", err);
      }
      window.api.sendTranscriptionDone();

      // North-star usage metric: fires exactly once per completed dictation,
      // at the single point where single-chunk and multi-chunk paths converge
      // and text is delivered to the user.
      const providerCategory =
        nonEmpty.find((r) => r.providerCategory)?.providerCategory ??
        providerCategoryRef.current ??
        undefined;
      capture("dictation completed", {
        segments: nonEmpty.length,
        multi_segment: nonEmpty.length > 1,
        output_mode: _outputMode,
        char_count: finalText.length,
        provider_category: providerCategory,
      });

      if (
        !recordingActiveRef.current &&
        queueRef.current.length === 0 &&
        pillActiveRef.current
      ) {
        hidePill();
      }
    } finally {
      drainingRef.current = false;
      if (drainAgainRef.current) {
        drainAgainRef.current = false;
        void drainQueue();
      } else if (
        pillActiveRef.current &&
        stateRef.current === "transcribing" &&
        !wantsMicRef.current &&
        !recordingActiveRef.current &&
        isTranscriptionIdle()
      ) {
        hidePill();
      }
    }
  }, []);

  // ---- REST fallback (full recorded WAV kept by the streamer) ----
  const restFallbackTranscribe = useCallback(
    (errorMsg: string): Promise<TranscribeResult> | null => {
      const wavBlob = streamerRef.current?.getWavBlob() ?? null;
      if (!wavBlob) return null;
      const headers: Record<string, string> = {
        "Content-Type": "audio/wav",
        "x-audio-duration-ms": String(lastRecordingDurationRef.current),
      };
      if (appContextRef.current)
        headers["x-app-context"] = encodeAppContext(appContextRef.current);
      if (queueRef.current.length > 0 || drainingRef.current)
        headers["x-skip-post-process"] = "true";
      return apiFetch("/api/transcribe", {
        method: "POST",
        body: wavBlob,
        headers,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (res.status === 401 && body?.error === "cloud_auth_required") {
              return {
                raw: "",
                cleaned: "",
                error: "Sign in to Freestyle Transcribe",
                cloudAuthRequired: true,
              };
            }
            if (res.status === 429 && body?.error === "usage_exceeded") {
              return {
                raw: "",
                cleaned: "",
                error: USAGE_LIMIT_DIALOG_MESSAGE,
                usageExceeded: true,
              };
            }
            return { raw: "", cleaned: "", error: errorMsg };
          }
          const data = (await res.json()) as {
            raw?: string;
            cleaned?: string;
            provider_category?: string;
          };
          return {
            raw: (data.raw || "").trim(),
            cleaned: (data.cleaned || data.raw || "").trim(),
            providerCategory: data.provider_category,
          };
        })
        .catch(() => ({ raw: "", cleaned: "", error: errorMsg }));
    },
    [],
  );

  const resolveStreamingWithFallback = useCallback(
    (message: string): boolean => {
      const resolver = streamResolverRef.current;
      if (!resolver) return false;
      streamResolverRef.current = null;
      setPillNotice("retrying");
      const fallback = restFallbackTranscribe(message);
      if (fallback) {
        void fallback.then(resolver);
      } else {
        resolver({ raw: "", cleaned: "", error: message });
      }
      return true;
    },
    [restFallbackTranscribe, setPillNotice],
  );

  // ---- Streamer (lazy singleton, only created when streaming is enabled) ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), getServerToken(), {
        onConfig: (config) => {
          // Only update support for *future* sessions. The per-session decision
          // (recordingSessionUsesTransportRef) is latched once in startRecording
          // and must never be mutated mid-session: a config arriving after the
          // first recording has already committed to the batch path would flip
          // commit to the streaming path, which captured no audio → "No audio
          // captured". This is the first-dictation-after-restart failure.
          supportsSessionTransportRef.current = config.sessionTransport;
          if (config.providerCategory) {
            providerCategoryRef.current = config.providerCategory;
          }
        },
        onReady: () => {
          if (pillNoticeRef.current === "reconnecting") {
            setPillNotice(null);
          }
        },
        onConnectionState: (connectionState: StreamerConnectionState) => {
          if (
            connectionState === "reconnecting" ||
            connectionState === "disconnected"
          ) {
            if (
              resolveStreamingWithFallback(
                "Connection interrupted while transcribing",
              )
            ) {
              return;
            }
            if (
              pillActiveRef.current &&
              recordingSessionUsesTransportRef.current &&
              providerCategoryRef.current === "freestyle_cloud"
            ) {
              setPillNotice("reconnecting");
            }
          }
          // A reconnected socket is not yet a working session — the notice
          // stays up until `onReady` says the session is live again, so the
          // mark doesn't blink off and on in the middle of one recovery.
        },
        onPartial: () => {},
        onFinal: (text) => {
          setPillNotice(null);
          const resolver = streamResolverRef.current;
          if (!resolver) return;
          streamResolverRef.current = null;
          // A short clip can stream to a live provider that finalizes before it
          // has recognized any words (cold Soniox/Freestyle Cloud session), so
          // the streaming final comes back empty even though audio was captured.
          // Salvage via the batch REST path with the recorded WAV the streamer
          // still has buffered — the same clip transcribes fine one-shot. If no
          // WAV exists (genuine silence) the empty result stands.
          if (!text.trim()) {
            const fallback = restFallbackTranscribe("");
            if (fallback) {
              void fallback.then(resolver);
              return;
            }
          }
          resolver({ raw: text, cleaned: text });
        },
        onCleaned: () => {},
        onError: (msg, code) => {
          const resolver = streamResolverRef.current;
          // Cloud auth expiry and usage limits are terminal — don't fall back
          // to REST (it would just re-hit the same cloud error). Surface them
          // directly, or flag the pending result so the drain loop does.
          if (code === "cloud_auth_required") {
            streamResolverRef.current = null;
            if (resolver) {
              resolver({ raw: "", cleaned: "", cloudAuthRequired: true });
            } else if (wantsMicRef.current) {
              streamSessionErrorRef.current = { message: msg, code };
              setPillNotice("sign-in");
            } else if (pillActiveRef.current) {
              hidePill();
              void window.api.cloudPromptSignIn();
            }
            return;
          }
          if (code === "usage_exceeded") {
            streamResolverRef.current = null;
            if (resolver) {
              resolver({ raw: "", cleaned: "", usageExceeded: true });
            } else if (wantsMicRef.current) {
              streamSessionErrorRef.current = { message: msg, code };
              setPillNotice("limit");
            } else if (pillActiveRef.current) {
              hidePill();
              void window.api.cloudPromptUpgrade();
            }
            return;
          }
          if (resolver) {
            resolveStreamingWithFallback(msg);
            return;
          }
          if (wantsMicRef.current && recordingSessionUsesTransportRef.current) {
            streamSessionErrorRef.current = { message: msg, code };
            if (providerCategoryRef.current === "freestyle_cloud") {
              setPillNotice("unavailable");
            }
            return;
          }
          if (!pillActiveRef.current) return;
          failedTranscriptionErrorRef.current = msg;
          setCanRetry(streamerRef.current?.hasCapturedAudio() ?? false);
          setPillNotice("unavailable");
          setPillState("error");
        },
      });
    }
    return streamerRef.current;
  }, []);

  // ---- Bar animation loop ----
  // The bar elements are created once per mount and only ever have their
  // geometry rewritten, so grab them as the SVG mounts and let the draw loop
  // iterate a plain array instead of querying the DOM 60 times a second.
  const captureBarLines = useCallback((svg: SVGSVGElement | null) => {
    // Only ever *set* on attach, never cleared on detach. The waveform moves
    // between two surfaces — the capsule and the command card — and a detach
    // that ran after the new element's attach would blank this and leave the
    // visible row frozen. Holding a detached element instead is harmless: the
    // draw loop writes attributes nobody renders until the next attach lands.
    if (svg) barLinesRef.current = Array.from(svg.querySelectorAll("line"));
  }, []);

  // One frame: work out what the bars should be aiming at, ease them toward
  // it, then draw. Runs at 60fps for the whole time the pill is up, so
  // everything here reuses buffers rather than allocating.
  const runBars = useCallback(() => {
    const mode = barModeRef.current;
    if (!mode) return;

    const now = performance.now();
    const targets = targetsRef.current;
    const bars = barsRef.current;
    // Only the live waveform eases symmetrically; the generated patterns keep
    // the snappier rise and gentler fall.
    let rise = RISE;
    let fall = FALL;

    if (mode === "connecting") {
      // A slow, low-amplitude breath travelling along the row: the pill is
      // awake but has nothing to show yet. Deliberately understated so the
      // jump to real audio levels reads as the pill "catching" your voice.
      const t = (now - modeStartRef.current) / 1000;
      for (let i = 0; i < BARS; i++) {
        targets[i] = 0.06 + 0.07 * (1 + Math.sin(t * 3.2 - i * 0.42));
      }
    } else if (mode === "speaking") {
      // Transcribing: a single soft bump sweeping left to right on a loop,
      // with a pause between passes. Reads as progress rather than as audio.
      const t = (now - modeStartRef.current) / 1000;
      const SWEEP = 1.15; // seconds of travel
      const GAP = 0.35; // seconds of rest between passes
      const head = ((t % (SWEEP + GAP)) / SWEEP) * (BARS + 4) - 2;
      for (let i = 0; i < BARS; i++) {
        const d = i - head;
        targets[i] = 0.08 + 0.72 * Math.exp(-(d * d) / 3.2);
      }
    } else {
      const analyser = analyserNodeRef.current;
      const data = freqDataRef.current;
      // The analyser is torn down a frame or two before the mode switches off
      // "listening" on commit. Keep the loop running and the bars frozen
      // until it does — never bail out of the rAF chain here.
      if (!analyser || !data) {
        rafRef.current = requestAnimationFrame(runBars);
        return;
      }

      rise = LEVEL_RISE;
      fall = LEVEL_FALL;
      analyser.getByteFrequencyData(data);

      const { startBin, endBin, levelDivisor } = voiceBandRef.current;
      let sum = 0;
      for (let i = startBin; i < endBin; i++) sum += data[i];
      const voiceLevel = sum / levelDivisor;

      // The bars hold still; only their values travel. Every SAMPLE_MS each
      // sampled level hands off one slot to the left and the rightmost bar
      // takes the newest sample, so a loud moment reads as moving
      // right-to-left across a stationary row.
      const sample = sampleRef.current;
      // Peak-hold stays in raw level space; the response curve and this
      // sample's jitter are applied at hand-off, so both land once per sample
      // rather than being recomputed every frame. Note what this value is now
      // *not* used for: the newest bar. See below.
      sample.peak = Math.max(sample.peak, voiceLevel);

      let elapsed = now - sample.lastSampleAt;
      // A long stall (window occluded, GC pause) shouldn't replay every
      // missed hand-off — jump straight to the present instead.
      if (elapsed > SAMPLE_MS * BARS) {
        sample.lastSampleAt = now;
        elapsed = 0;
      }
      while (elapsed >= SAMPLE_MS) {
        // Shift left by hand rather than via shift()/push(), which would
        // reallocate the backing store on every hand-off.
        for (let i = 0; i < BARS - 1; i++) targets[i] = targets[i + 1];
        // The window that just closed is written as its *peak*, over the
        // second-newest slot — overwriting the live value the shift just moved
        // there. History is what peak-hold is for: once a bar has stopped
        // being the live one, it should show the loudest thing that happened
        // while it was, so a syllable can't fall between two frames.
        targets[BARS - 2] = barHeightFor(sample.peak, sample.jitter);
        sample.peak = voiceLevel;
        sample.jitter = nextJitter();
        sample.lastSampleAt += SAMPLE_MS;
        elapsed -= SAMPLE_MS;
      }

      // The newest slot, by contrast, tracks the live level and nothing else.
      // Drawing it from the peak-hold is what made both ends of a word feel
      // late: the bar could only fall at the next hand-off, up to a full
      // SAMPLE_MS after you had actually stopped. Now the right-hand bar is a
      // meter — it rises and falls with your voice, this frame — and only
      // becomes a peak once it hands off and joins the history.
      targets[BARS - 1] = barHeightFor(voiceLevel, sample.jitter);

      // The dashboard's own visualisation is calibrated against the original
      // linear scale, so the level broadcast over IPC stays on it.
      if (now - lastIpcTimeRef.current >= 100) {
        lastIpcTimeRef.current = now;
        window.api?.sendAudioLevel(Math.min(1, voiceLevel * 2.8));
      }
    }

    // Ease toward the targets so a hand-off is a smooth morph between
    // neighbouring heights rather than a visible step.
    easeBars(bars, targets, rise, fall);

    // Advance the cancel button's open/close on the same clock as the bars.
    const open =
      cancelOpenRef.current +
      (cancelTargetRef.current - cancelOpenRef.current) * CANCEL_EASE;
    cancelOpenRef.current = open;

    const lines = barLinesRef.current;
    for (let i = 0; i < lines.length; i++) {
      const val = bars[i] ?? 0;
      // A bar never fully collapses: at rest it is exactly as tall as it is
      // wide, so the round caps leave a row of evenly spaced dots.
      const h = Math.max(BAR_WIDTH, val * SVG_HEIGHT);
      const line = lines[i];
      line.setAttribute("y1", String((SVG_HEIGHT + h) / 2));
      line.setAttribute("y2", String((SVG_HEIGHT - h) / 2));
      // The bars are drawn at full strength — height alone carries the level,
      // with no dimming on top of it. The one exception is structural: the
      // oldest bars fade as the cancel button takes their space, so they
      // dissolve rather than being sliced by the viewport edge closing over
      // them.
      line.style.opacity =
        i < CANCEL_HIDDEN_BARS && open > 0 ? String(1 - open) : "1";
    }

    // Writing these lays out the capsule, so only do it while the value is
    // actually moving — a settled button costs nothing.
    if (Math.abs(open - lastCancelWriteRef.current) > 0.002) {
      lastCancelWriteRef.current = open;
      const slot = cancelSlotRef.current;
      const clip = waveClipRef.current;
      if (slot) {
        slot.style.width = `${CANCEL_SLOT * open}px`;
        slot.style.opacity = String(open);
        slot.style.transform = `scale(${0.72 + 0.28 * open})`;
        // Don't let a disc that is still fading in swallow a click.
        slot.style.pointerEvents = open > 0.5 ? "auto" : "none";
      }
      if (clip) clip.style.width = `${SVG_WIDTH - CANCEL_HIDDEN_SPAN * open}px`;
    }

    rafRef.current = requestAnimationFrame(runBars);
  }, []);

  // ---- Visualization control ----
  const startBarAnimation = useCallback(
    (mode: BarMode) => {
      cancelAnimationFrame(rafRef.current);
      barModeRef.current = mode;
      modeStartRef.current = performance.now();
      // Every mode now writes the shared target buffer, so clear it on the
      // way in. This also means a re-record starts from a flat row instead of
      // inheriting the previous dictation's waveform.
      targetsRef.current.fill(0);
      // The pill remounts each time it is shown, so start the button at its
      // resting state rather than animating it open, and force the first
      // style write against the fresh elements.
      cancelOpenRef.current = cancelTargetRef.current;
      lastCancelWriteRef.current = -1;
      sampleRef.current = {
        lastSampleAt: performance.now(),
        peak: 0,
        jitter: nextJitter(),
      };
      rafRef.current = requestAnimationFrame(runBars);
    },
    [runBars],
  );

  const startListening = useCallback(
    (stream: MediaStream) => {
      if (
        !analyserCtxRef.current ||
        analyserCtxRef.current.state === "closed"
      ) {
        analyserCtxRef.current = new AudioContext();
      }
      const ctx = analyserCtxRef.current;
      try {
        audioSourceRef.current?.disconnect();
      } catch {}
      try {
        analyserNodeRef.current?.disconnect();
      } catch {}

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
      source.connect(analyser);
      audioSourceRef.current = source;
      analyserNodeRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      // Resolve the voice band to bin indices once, here, rather than on
      // every frame of the draw loop.
      const binWidth = ctx.sampleRate / analyser.fftSize;
      const startBin = Math.max(0, Math.floor(VOICE_MIN_HZ / binWidth));
      const endBin = Math.min(
        analyser.frequencyBinCount,
        Math.ceil(VOICE_MAX_HZ / binWidth),
      );
      voiceBandRef.current = {
        startBin,
        endBin,
        levelDivisor: Math.max(1, endBin - startBin) * 255,
      };

      startBarAnimation("listening");
    },
    [startBarAnimation],
  );

  const retryFailedTranscription = useCallback(() => {
    if (stateRef.current !== "error") return;
    const retry = restFallbackTranscribe(
      failedTranscriptionErrorRef.current || "Transcription failed",
    );
    if (!retry) {
      setCanRetry(false);
      return;
    }
    setCanRetry(false);
    setPillNotice("retrying");
    setPillState("transcribing");
    // The draw loop is parked while the card is up (see the card effect), so
    // the capsule needs its sweep started again rather than resumed.
    startBarAnimation("speaking");
    setPendingCount((count) => count + 1);
    queueRef.current.push({
      promise: retry.finally(() => {
        setPendingCount((count) => Math.max(0, count - 1));
      }),
    });
    void drainQueue();
  }, [
    drainQueue,
    restFallbackTranscribe,
    setPillNotice,
    setPillState,
    startBarAnimation,
  ]);

  /**
   * Draw the bars once at their resting height.
   *
   * The draw loop is what normally puts them there, so stopping it leaves the
   * row frozen at whatever the last frame happened to be. That doesn't matter
   * where the capsule is on its way out, but the command card keeps the
   * waveform on screen after the mic has gone — a row stuck mid-syllable under
   * "hold the hotkey and say what you want" claims something that isn't true.
   */
  const restBars = useCallback(() => {
    for (const line of barLinesRef.current) {
      line.setAttribute("y1", String((SVG_HEIGHT + BAR_WIDTH) / 2));
      line.setAttribute("y2", String((SVG_HEIGHT - BAR_WIDTH) / 2));
      line.style.opacity = "1";
    }
  }, []);

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    barModeRef.current = null;
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;
    barsRef.current.fill(0);
    targetsRef.current.fill(0);
    sampleRef.current = {
      lastSampleAt: 0,
      peak: 0,
      jitter: { scale: 1, trim: 0 },
    };
  }, []);

  // ---- Hide pill ----
  /**
   * Put every scrap of dictation state back to rest, without touching the pill
   * window itself. Split out of `hidePill` for the one caller that needs the
   * window left standing: the commands chord taking over a dictation that the
   * shared home key started a few milliseconds earlier, where the pill is
   * about to be reused for the command card.
   */
  const resetDictation = useCallback(() => {
    setPillNotice(null);
    setCanRetry(false);
    setPillState("idle");
    setPendingCount(0);
    wantsMicRef.current = false;
    pillActiveRef.current = false;
    queueRef.current = [];
    drainingRef.current = false;
    drainAgainRef.current = false;
    recordingActiveRef.current = false;
    streamResolverRef.current = null;
    streamSessionErrorRef.current = null;
    pendingReRecordRef.current = false;
    // Hiding removes the hovered element before onMouseLeave can fire. Reset
    // its transient reveal state so the next session does not inherit an open
    // cancel button; the "always" preference remains pinned open.
    hoveredRef.current = false;
    cancelTargetRef.current = cancelModeRef.current === "always" ? 1 : 0;
    cancelOpenRef.current = cancelTargetRef.current;
    lastCancelWriteRef.current = -1;
    stopVisualization();
  }, [setPillNotice, stopVisualization, setPillState]);

  const hidePill = useCallback(() => {
    resetDictation();
    window.api.hidePill();
  }, [resetDictation]);

  const resumeTranscribingOrHide = useCallback(() => {
    if (isTranscriptionIdle()) {
      hidePill();
    } else {
      setPillState("transcribing");
      startBarAnimation("speaking");
      void drainQueue();
    }
  }, [
    hidePill,
    setPillState,
    startBarAnimation,
    drainQueue,
    isTranscriptionIdle,
  ]);

  // Restore the system volume, but only after any in-flight duck has settled
  // so the restore can't be a no-op that leaves the volume stuck low.
  const restoreSystemAudioSafely = useCallback(async (): Promise<void> => {
    try {
      await duckingPromiseRef.current;
      await window.api?.restoreSystemAudio();
    } catch {}
  }, []);

  // ---- Start recording ----
  const startRecording = useCallback(
    async (forReRecord = false) => {
      if (wantsMicRef.current) {
        return;
      }
      wantsMicRef.current = true;
      pillActiveRef.current = true;
      pendingCommitRef.current = false;
      streamSessionErrorRef.current = null;
      lastRecordingDurationRef.current = 0;
      setPillNotice(null);
      setCanRetry(false);

      // Warm the pipeline while the user is speaking so submission doesn't pay
      // startup latency: the local ASR server (whisper/mlx) model load and the
      // cloud cleanup LLM connection (e.g. Groq TLS handshake). Fire-and-forget:
      // the server decides what needs warming (no-op where nothing applies), and
      // lazy start at submission remains the fallback if this doesn't land.
      void getClient()
        .api.transcribe["pre-warm"].$post()
        .catch(() => {});

      appContextRef.current = null;
      // Streaming is always active — prime the streamer's context.
      try {
        getStreamer().setContext(null);
      } catch {}

      void refreshNeedsAppContextForCleanup().then((needsAppContext) => {
        if (!needsAppContext || !wantsMicRef.current) return;
        void window.api
          ?.getFrontmostApp()
          .then((app) => {
            if (!wantsMicRef.current) return;
            appContextRef.current = app;
            try {
              getStreamer().setContext(app);
            } catch {}
          })
          .catch(() => {
            if (!wantsMicRef.current) return;
            appContextRef.current = null;
            try {
              getStreamer().setContext(null);
            } catch {}
          });
      });

      setPillState("initializing");
      startBarAnimation("connecting");

      // Play the start cue immediately, before ducking lowers the system
      // volume — otherwise the tone is attenuated to DUCKED_VOLUME and is
      // effectively inaudible.
      playTone("start");

      // Duck/pause system audio concurrently with mic acquisition. The pause
      // path can spawn a slow media-control subprocess; awaiting it before
      // getUserMedia is what made the "initializing" state drag on. Restores
      // go through restoreSystemAudioSafely(), which waits on this promise so a
      // cancel can't race the duck.
      duckingPromiseRef.current =
        _audioPlaybackMode !== "off"
          ? window.api?.prepareSystemAudio(_audioPlaybackMode).catch(() => {})
          : undefined;

      try {
        recordingSessionUsesTransportRef.current =
          supportsSessionTransportRef.current;

        // When session transport is active the streamer handles audio capture
        // directly — we only need the raw mic stream for the analyser. When
        // it's not (batch path), start the MediaRecorder so we get a WAV.
        const stream = recordingSessionUsesTransportRef.current
          ? await recorderRef.current.acquireStream()
          : await recorderRef.current.start();

        if (!wantsMicRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          void restoreSystemAudioSafely();
          streamerRef.current?.cancel();
          if (forReRecord) {
            resumeTranscribingOrHide();
          }
          return;
        }
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          wantsMicRef.current = false;
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          void restoreSystemAudioSafely();
          streamerRef.current?.cancel();
          if (forReRecord) {
            resumeTranscribingOrHide();
          } else {
            hidePill();
          }
          return;
        }

        setPillState("recording");
        recordingActiveRef.current = true;
        startTimeRef.current = Date.now();

        startListening(stream);
        try {
          await getStreamer().startCapture(stream);
        } catch {}
      } catch (err) {
        pendingCommitRef.current = false;
        recorderRef.current.releaseStream();
        void restoreSystemAudioSafely();
        hidePill();
        window.api.showErrorDialog(
          "Recording Failed",
          err instanceof Error ? err.message : "Mic access denied",
        );
      }
    },
    [
      startBarAnimation,
      startListening,
      hidePill,
      getStreamer,
      setPillNotice,
      setPillState,
      resumeTranscribingOrHide,
      restoreSystemAudioSafely,
    ],
  );

  // ---- Commit recording ----
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    recordingActiveRef.current = false;

    // Restore the system volume first, then play the stop cue so it isn't
    // muted by ducking. Fire-and-forget so the transcription pipeline below
    // isn't blocked on the restore. This runs on every commit path, so the
    // branches below don't restore again. Gate on whether this session ducked
    // (not the current mode setting, which can change mid-recording) so a
    // toggle to "off" while recording can't strand the volume low.
    void (async () => {
      if (duckingPromiseRef.current) {
        await restoreSystemAudioSafely();
      }
      playTone("stop");
    })();

    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;

    const recordingDuration = Date.now() - startTimeRef.current;
    lastRecordingDurationRef.current = recordingDuration;
    if (recordingDuration < 250) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      streamerRef.current?.cancel();
      window.api?.sendRecordingCancelled();
      resumeTranscribingOrHide();
      return;
    }

    window.api?.sendRecordingCommitted();
    setPillState("transcribing");
    startBarAnimation("speaking");

    // Streaming session transport path: the streamer already has the audio —
    // commit it over the WebSocket and wait for the server's final message.
    if (recordingSessionUsesTransportRef.current && streamerRef.current) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();

      const streamError = streamSessionErrorRef.current;
      streamSessionErrorRef.current = null;
      if (streamError?.code === "cloud_auth_required") {
        streamerRef.current.cancel();
        hidePill();
        void window.api.cloudPromptSignIn();
        return;
      }
      if (streamError?.code === "usage_exceeded") {
        streamerRef.current.cancel();
        hidePill();
        void window.api.cloudPromptUpgrade();
        return;
      }

      const transportFailure =
        streamError?.message ??
        (!streamerRef.current.isConnected()
          ? "Connection interrupted while recording"
          : null);
      if (transportFailure) {
        streamerRef.current.cancel();
        setPillNotice("retrying");
        setPendingCount((count) => count + 1);
        const fallback =
          restFallbackTranscribe(transportFailure) ??
          Promise.resolve({
            raw: "",
            cleaned: "",
            error: transportFailure,
          });
        queueRef.current.push({
          promise: fallback.finally(() => {
            setPendingCount((count) => Math.max(0, count - 1));
            if (pendingReRecordRef.current && !wantsMicRef.current) {
              pendingReRecordRef.current = false;
              void startRecording(true);
            }
          }),
        });
        void drainQueue();
        return;
      }

      // A cold cloud session at commit time is just latency, not a fault: the
      // sweeping waveform already says the dictation is being worked on, and
      // the commit timeout below is what turns a genuinely stuck session into
      // something the user is told about.
      setPendingCount((c) => c + 1);
      const transcribePromise = new Promise<TranscribeResult>((resolve) => {
        streamResolverRef.current = resolve;
        // Server-side commit timeouts fire at 12s; if no final arrived by
        // 15s the stream is dead — salvage via REST with the recorded WAV.
        setTimeout(() => {
          if (streamResolverRef.current === resolve) {
            streamResolverRef.current = null;
            const fallback = restFallbackTranscribe("Transcription timed out");
            if (fallback) {
              void fallback.then(resolve);
            } else {
              resolve({
                raw: "",
                cleaned: "",
                error: "Transcription timed out",
              });
            }
          }
        }, 15_000);
      });
      streamerRef.current.commit();
      queueRef.current.push({
        promise: transcribePromise.finally(() => {
          setPendingCount((c) => Math.max(0, c - 1));
          // Replay a re-record press that arrived while this commit was
          // finalizing (see the hotkey-down handler). Only when nothing else
          // has already taken the mic.
          if (pendingReRecordRef.current && !wantsMicRef.current) {
            pendingReRecordRef.current = false;
            void startRecording(true);
          }
        }),
      });
      void drainQueue();
      return;
    }

    // startCapture() also runs for the batch path so the analyser and a
    // retryable PCM copy stay available. Stop that auxiliary capture now;
    // otherwise it remains logically active until the next dictation.
    streamerRef.current?.cancel();
    const wavBlob = recorderRef.current.isRecording()
      ? await recorderRef.current.stop()
      : null;
    recorderRef.current.releaseStream();

    if (!pillActiveRef.current) {
      return;
    }

    if (!wavBlob) {
      if (isTranscriptionIdle()) {
        hidePill();
        window.api.showErrorDialog(
          "Recording Failed",
          "No audio captured. Try recording again.",
        );
      } else {
        resumeTranscribingOrHide();
      }
      return;
    }

    const isSubsequent = queueRef.current.length > 0 || drainingRef.current;
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "x-audio-duration-ms": String(recordingDuration),
    };
    if (appContextRef.current)
      headers["x-app-context"] = encodeAppContext(appContextRef.current);
    if (isSubsequent) headers["x-skip-post-process"] = "true";

    const serverOk = await refreshApiBase();
    if (!serverOk) {
      failedTranscriptionErrorRef.current = isRemoteServer()
        ? `Cannot reach the server at ${getApiBase()}`
        : `Cannot reach Freestyle server at ${getApiBase()}`;
      setCanRetry(streamerRef.current?.hasCapturedAudio() ?? false);
      setPillNotice("unavailable");
      setPillState("error");
      return;
    }

    setPendingCount((c) => c + 1);
    const transcribePromise: Promise<TranscribeResult> = apiFetch(
      "/api/transcribe",
      { method: "POST", body: wavBlob, headers },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            detail?: string;
          } | null;
          if (res.status === 401 && body?.error === "cloud_auth_required") {
            return {
              raw: "",
              cleaned: "",
              error: "Sign in to Freestyle Transcribe",
              cloudAuthRequired: true,
            };
          }
          if (res.status === 429 && body?.error === "usage_exceeded") {
            return {
              raw: "",
              cleaned: "",
              error: USAGE_LIMIT_DIALOG_MESSAGE,
              usageExceeded: true,
            };
          }
          const msg =
            body?.detail ||
            body?.error ||
            `Transcription failed (${res.status})`;
          return { raw: "", cleaned: "", error: msg };
        }
        const data = (await res.json()) as {
          raw?: string;
          cleaned?: string;
          provider_category?: string;
          disposition?: "deliver" | "suppressed" | "aborted";
        };
        return {
          raw: (data.raw || "").trim(),
          cleaned: (data.cleaned || data.raw || "").trim(),
          providerCategory: data.provider_category,
          disposition: data.disposition,
        };
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        const hint =
          msg.includes("fetch") || msg.includes("Failed")
            ? isRemoteServer()
              ? ` (${getApiBase()} unreachable — check Settings → Network)`
              : ` (${getApiBase()} unreachable — quit and reopen the app)`
            : "";
        return { raw: "", cleaned: "", error: `${msg}${hint}` };
      })
      .finally(() => {
        setPendingCount((c) => Math.max(0, c - 1));
      });

    queueRef.current.push({ promise: transcribePromise });
    drainQueue();
  }, [
    hidePill,
    drainQueue,
    startBarAnimation,
    setPillState,
    resumeTranscribingOrHide,
    isTranscriptionIdle,
    restoreSystemAudioSafely,
    restFallbackTranscribe,
    startRecording,
    setPillNotice,
  ]);

  // ---- Cancel ----
  const cancelRecording = useCallback(() => {
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    void restoreSystemAudioSafely();
    streamerRef.current?.cancel();
    window.api?.sendRecordingCancelled();
    hidePill();
  }, [hidePill, restoreSystemAudioSafely]);

  // ---- Commands ----
  // A command is not a dictation: it never enters the transcription queue,
  // never reaches the plugin output pipeline, and its result replaces a
  // selection rather than being inserted at a cursor. What it does share is the
  // pill — the surface, the waveform, and the mic behind it.

  const clearCommandHoldTimer = useCallback(() => {
    if (commandHoldTimerRef.current) {
      clearTimeout(commandHoldTimerRef.current);
      commandHoldTimerRef.current = null;
    }
  }, []);

  const clearCommandIdleTimer = useCallback(() => {
    if (commandIdleTimerRef.current) {
      clearTimeout(commandIdleTimerRef.current);
      commandIdleTimerRef.current = null;
    }
  }, []);

  /** Tear the session down. `hide` is false only when an error card stays up. */
  const endCommand = useCallback(
    (options: { hide?: boolean } = {}) => {
      clearCommandHoldTimer();
      clearCommandIdleTimer();
      commandRunningRef.current = false;
      // Resolve any pending await so a run blocked on the selection unwinds
      // instead of hanging on a session that no longer exists.
      commandSelectionRef.current?.resolve(null);
      commandSelectionRef.current = null;
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      setCommand(null);
      stopVisualization();
      if (options.hide !== false) window.api?.hidePill();
    },
    [
      clearCommandHoldTimer,
      clearCommandIdleTimer,
      setCommand,
      stopVisualization,
    ],
  );

  /**
   * Show a failure and leave the card up. Unlike the phases above this one
   * outlives the keypress: it is the only state the user has to answer, so it
   * waits for Escape, the Dismiss button, or another press of the hotkey.
   */
  const failCommand = useCallback(
    (title: string, body: string) => {
      clearCommandHoldTimer();
      clearCommandIdleTimer();
      commandRunningRef.current = false;
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      stopVisualization();
      setCommand({ phase: "error", selection: null, title, body });
    },
    [
      clearCommandHoldTimer,
      clearCommandIdleTimer,
      setCommand,
      stopVisualization,
    ],
  );

  /**
   * Send the edited text back to the app the selection came from.
   *
   * The paste is the commit point: main hides the pill from inside it, so the
   * card is gone by the time the text lands and the user never sees the pill
   * sitting over their own document mid-replace.
   */
  const deliverCommandResult = useCallback(
    async (text: string) => {
      const pasted = await window.api.pasteCommandResult(text);
      if (!pasted) {
        failCommand(
          "Couldn't replace the text",
          "The edit is on your clipboard — paste it yourself.",
        );
        return;
      }
      endCommand({ hide: false });
    },
    [endCommand, failCommand],
  );

  /**
   * Run one command over the captured selection.
   *
   * Waits on the selection rather than requiring it: the copy is still in
   * flight for the first ~100ms of every session, which is well inside the
   * time it takes to tap a number key.
   */
  /**
   * The selection, once the copy has answered — or null, having already put
   * the refusal on screen.
   *
   * Every path into a command goes through here, because a command without a
   * selection has no subject: there is nothing to edit, nothing to paste over,
   * and nothing worth spending a transcription or a model call on. Waiting
   * rather than requiring is deliberate — the copy is still in flight for the
   * first fraction of a second of every session.
   */
  const requireSelection = useCallback(async (): Promise<string | null> => {
    const selection = await (commandSelectionRef.current?.promise ??
      Promise.resolve(commandRef.current?.selection ?? null));
    if (!commandRef.current) return null;
    if (!selection) {
      failCommand(
        "Nothing selected",
        "Highlight some text in any app first, then press the hotkey.",
      );
      return null;
    }
    return selection;
  }, [failCommand]);

  const runCommand = useCallback(
    async (options: {
      commandId?: string;
      instruction?: string;
      label: string;
    }) => {
      if (commandRunningRef.current) return;
      commandRunningRef.current = true;
      clearCommandIdleTimer();
      patchCommand({ phase: "running", label: options.label });
      startBarAnimation("speaking");

      const selection = await requireSelection();
      if (!selection) return;

      try {
        const res = await apiFetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: selection,
            commandId: options.commandId,
            instruction: options.instruction,
          }),
        });
        if (!commandRef.current) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            detail?: string;
          } | null;
          // Cloud auth and usage limits have their own interactive prompts in
          // the main process; the card would only be a worse version of them.
          if (res.status === 401 && body?.error === "cloud_auth_required") {
            endCommand();
            void window.api.cloudPromptSignIn();
            return;
          }
          if (res.status === 429 && body?.error === "usage_exceeded") {
            endCommand();
            void window.api.cloudPromptUpgrade();
            return;
          }
          failCommand(
            "Command failed",
            body?.detail || `The model couldn't run that (${res.status}).`,
          );
          return;
        }

        const data = (await res.json()) as { text?: string };
        const edited = (data.text ?? "").trim();
        if (!commandRef.current) return;
        if (!edited) {
          failCommand("Command failed", "The model returned nothing.");
          return;
        }
        await deliverCommandResult(edited);
      } catch (err) {
        if (!commandRef.current) return;
        failCommand(
          "Command failed",
          err instanceof Error ? err.message : "Something went wrong.",
        );
      }
    },
    [
      clearCommandIdleTimer,
      deliverCommandResult,
      endCommand,
      failCommand,
      patchCommand,
      requireSelection,
      startBarAnimation,
    ],
  );

  /**
   * Transcribe the held instruction, then run it.
   *
   * This goes through the one-shot REST path rather than the streaming session
   * the dictation flow uses. An instruction is a second or two of speech whose
   * text is never shown to anyone — partials buy nothing, and the streaming
   * session belongs to dictation, which may well have one in flight.
   */
  const runSpokenCommand = useCallback(async () => {
    const durationMs = Math.round(performance.now() - commandDownAtRef.current);
    patchCommand({ phase: "running", label: "Listening…" });
    startBarAnimation("speaking");

    // The selection is the subject of the command, so a missing one ends the
    // run here — before the recording is transcribed, let alone sent to a
    // model. Nothing is edited without something highlighted to edit.
    const selected = await requireSelection();
    if (!selected) return;

    let wav: Blob | null = null;
    try {
      wav = recorderRef.current.isRecording()
        ? await recorderRef.current.stop()
        : null;
    } catch {
      wav = null;
    }
    recorderRef.current.releaseStream();
    if (!commandRef.current) return;
    if (!wav) {
      failCommand("Didn't catch that", "Hold the hotkey and say what to do.");
      return;
    }

    let instruction = "";
    try {
      const res = await apiFetch("/api/transcribe", {
        method: "POST",
        body: wav,
        headers: {
          "Content-Type": "audio/wav",
          "x-audio-duration-ms": String(durationMs),
          // Cleanup is tuned to turn speech into prose the user will read.
          // This text is a machine instruction that nobody ever sees, so the
          // raw transcript is both cheaper and closer to what was said.
          "x-skip-post-process": "true",
        },
      });
      if (!commandRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as { raw?: string; cleaned?: string };
        instruction = (data.raw || data.cleaned || "").trim();
      }
    } catch {
      instruction = "";
    }

    if (!commandRef.current) return;
    if (!instruction) {
      failCommand(
        "Didn't catch that",
        "Nothing came through — hold the hotkey and say what to do.",
      );
      return;
    }
    await runCommand({ instruction, label: instruction });
  }, [
    failCommand,
    patchCommand,
    requireSelection,
    runCommand,
    startBarAnimation,
  ]);

  /** Arm the card's idle dismissal (a card opened but never answered). */
  const armCommandIdleTimer = useCallback(() => {
    clearCommandIdleTimer();
    commandIdleTimerRef.current = setTimeout(() => {
      commandIdleTimerRef.current = null;
      if (commandRef.current?.phase === "picking") endCommand();
    }, COMMAND_IDLE_MS);
  }, [clearCommandIdleTimer, endCommand]);

  const beginCommand = useCallback(() => {
    // A dictation owns the pill while it is up. Rather than fight over it,
    // commands stand down — the user can press again a moment later.
    if (stateRef.current !== "idle" || pillActiveRef.current) return;
    // A second press while an error card is up means "try again", so tear the
    // old session down first rather than merging into it.
    if (commandRef.current) endCommand({ hide: false });

    commandDownAtRef.current = performance.now();
    commandSelectionRef.current = deferred<string | null>();
    setCommand({ phase: "capturing", selection: null });

    // Once the press has outlived the tap threshold it can only be a hold, so
    // the card commits to that reading rather than waiting for the release —
    // the user is already talking by then and should be able to see it.
    clearCommandHoldTimer();
    commandHoldTimerRef.current = setTimeout(() => {
      commandHoldTimerRef.current = null;
      if (commandRef.current?.phase === "capturing") {
        patchCommand({ phase: "listening" });
      }
    }, COMMAND_HOLD_THRESHOLD_MS);

    // The mic starts now, before we know this is a hold: a recording that only
    // began once the threshold had passed would clip the first syllable off
    // every spoken command.
    void recorderRef.current
      .start()
      .then((stream) => {
        if (!commandRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          return;
        }
        startListening(stream);
      })
      .catch(() => {
        // No mic is survivable — the preset list doesn't need one. Show the
        // idle bars so the card doesn't look broken, and let the footer's own
        // copy be the only thing that mentions speaking.
        if (commandRef.current) startBarAnimation("connecting");
      });
  }, [
    clearCommandHoldTimer,
    endCommand,
    patchCommand,
    setCommand,
    startBarAnimation,
    startListening,
  ]);

  const finishCommandPress = useCallback(() => {
    clearCommandHoldTimer();
    const session = commandRef.current;
    if (!session) return;
    if (session.phase !== "capturing" && session.phase !== "listening") return;

    const heldMs = performance.now() - commandDownAtRef.current;
    if (heldMs < COMMAND_HOLD_THRESHOLD_MS) {
      // A tap. Throw the fragment of audio away and hand over to the list.
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      stopVisualization();
      restBars();
      patchCommand({ phase: "picking" });
      armCommandIdleTimer();
      return;
    }
    void runSpokenCommand();
  }, [
    armCommandIdleTimer,
    clearCommandHoldTimer,
    patchCommand,
    restBars,
    runSpokenCommand,
    stopVisualization,
  ]);

  // ---- Preferences ----
  const applyPillPosition = useCallback((pos: string | null | undefined) => {
    const isTop =
      pos === "top-center" || pos === "top-right" || pos === "custom-top";
    setPillAlign(isTop ? "start" : "end");
    setPillSide(pos?.endsWith("right") ? "right" : "center");
  }, []);

  useEffect(() => {
    // Read every persisted preference in a single request instead of one GET
    // per key. Missing keys are simply absent from the map (no 404s), and the
    // legacy audio-playback fallbacks read from the same snapshot.
    getClient()
      .api.settings.$get()
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (!settings) return;

        if (settings[SETTINGS_KEYS.soundEnabled] === "false") {
          _soundEnabled = false;
        }

        const mode = settings.audio_playback_mode;
        if (mode) {
          _audioPlaybackMode = normalizeAudioPlaybackMode(mode);
        } else if (settings.pause_playback_while_recording === "true") {
          _audioPlaybackMode = "pause";
        } else {
          _audioPlaybackMode =
            settings.audio_ducking_enabled === "true" ? "duck" : "off";
        }

        const outputMode = settings[SETTINGS_KEYS.outputMode];
        if (outputMode) _outputMode = outputMode;

        setCancelMode(
          normalizePillCancelMode(settings[SETTINGS_KEYS.pillCancelButton]),
        );

        // Warm the cleanup-context cache from the same snapshot instead of
        // firing a second GET /api/settings.
        applyNeedsAppContextForCleanup(settings);
      })
      .catch(() => {});

    // Streaming is always active. Eagerly create the Streamer so the WebSocket
    // connects and the onConfig callback (which sets supportsSessionTransportRef)
    // fires before the first recording. Session-transport support is negotiated
    // per provider — non-streaming providers fall back to the batch path.
    getStreamer();
    window.api
      ?.getPillPosition()
      .then(applyPillPosition)
      .catch(() => {});
    // Prime the `beforeOutput` hook-presence cache so the very first dictation's
    // delivery already applies the correct fail-closed policy.
    void refreshBeforeOutputHookPresence();

    // Listen for live changes from the settings UI
    const removePillPos = window.api?.onPillPositionChanged(applyPillPosition);
    const removeOutputMode = window.api?.onOutputModeChanged((mode) => {
      _outputMode = mode;
    });
    const removeCancelMode = window.api?.onPillCancelModeChanged((mode) => {
      setCancelMode(normalizePillCancelMode(mode));
    });
    const removeAudioDucking = window.api?.onAudioDuckingChanged((enabled) => {
      _audioPlaybackMode = enabled ? "duck" : "off";
    });
    const removeAudioPlaybackMode = window.api?.onAudioPlaybackModeChanged(
      (mode) => {
        _audioPlaybackMode = normalizeAudioPlaybackMode(mode);
      },
    );
    // The server target (URL/token) changed in Settings. Re-point this window's
    // API client and tear down the streamer so its next connection uses the new
    // server — no app restart needed. A fresh streamer is created immediately so
    // session-transport support is renegotiated before the next recording.
    const removeServerChanged = window.api?.onServerChanged(() => {
      void refreshApiBase().finally(() => {
        streamerRef.current?.destroy();
        streamerRef.current = null;
        supportsSessionTransportRef.current = false;
        getStreamer();
      });
    });
    return () => {
      removePillPos?.();
      removeOutputMode?.();
      removeCancelMode?.();
      removeAudioDucking?.();
      removeAudioPlaybackMode?.();
      removeServerChanged?.();
    };
  }, [applyPillPosition, getStreamer]);

  // "always" pins the button open; "hover" lets the pointer drive it.
  useEffect(() => {
    cancelModeRef.current = cancelMode;
    cancelTargetRef.current =
      cancelMode === "always" || hoveredRef.current ? 1 : 0;
  }, [cancelMode]);

  const handlePillEnter = useCallback(() => {
    hoveredRef.current = true;
    cancelTargetRef.current = 1;
  }, []);

  const handlePillLeave = useCallback(() => {
    hoveredRef.current = false;
    if (cancelModeRef.current !== "always") cancelTargetRef.current = 0;
  }, []);

  // ---- Hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      // Dictation is the primary use of this pill; a command card sitting in
      // front of it (most likely one the user has already read and moved on
      // from) gets out of the way rather than blocking the press.
      if (commandRef.current) endCommand({ hide: false });
      // hidePill() clears pillActiveRef before React re-renders idle state.
      if (!pillActiveRef.current) {
        stateRef.current = "idle";
      }
      const s = stateRef.current;
      if (s === "idle") {
        startRecording(false);
      } else if (s === "error") {
        // A fresh hotkey press means "start a new dictation". The failed
        // capture remains retryable from the visible Retry button until then.
        setPillNotice(null);
        setCanRetry(false);
        void startRecording(false);
      } else if (s === "transcribing" && !wantsMicRef.current) {
        if (isTranscriptionIdle()) {
          hidePill();
          return;
        }
        // A pending streaming commit owns the single WebSocket + PCM buffer,
        // so a second streaming session can't run alongside it. Defer the
        // re-record until the commit resolves rather than dropping the press.
        if (streamResolverRef.current !== null) {
          pendingReRecordRef.current = true;
          return;
        }
        // A previous batch transcription is still in flight; start a new
        // recording alongside it. Its result is queued and drained normally.
        void startRecording(true);
      }
    });
    const removeUp = window.api.onHotkeyUp(() => {
      if (!pillActiveRef.current) return;
      if (stateRef.current === "recording") {
        commitRecording();
      } else if (stateRef.current === "initializing") {
        pendingCommitRef.current = true;
      } else if (
        stateRef.current === "transcribing" &&
        !wantsMicRef.current &&
        isTranscriptionIdle()
      ) {
        hidePill();
      }
    });
    const removeCancel = window.api.onPillCancel(() => {
      // Escape reaches whichever surface is up. A command owns the pill only
      // when there is no dictation, so there is never a question of which.
      if (commandRef.current) {
        endCommand();
        return;
      }
      if (stateRef.current !== "idle") cancelRecording();
    });
    return () => {
      removeDown();
      removeUp();
      removeCancel();
    };
  }, [
    startRecording,
    commitRecording,
    cancelRecording,
    endCommand,
    hidePill,
    isTranscriptionIdle,
    setPillNotice,
  ]);

  // ---- Command hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onCommandDown(beginCommand);
    const removeUp = window.api.onCommandUp(finishCommandPress);
    const removeSelection = window.api.onCommandSelection((text) => {
      if (!commandRef.current) return;
      commandSelectionRef.current?.resolve(text);
      if (text === null) {
        failCommand(
          "Nothing selected",
          "Select some text in any app, then press the commands hotkey.",
        );
        return;
      }
      patchCommand({ selection: text });
    });
    // A route shortcut: the chord plus a digit. It answers the question the
    // microphone was open to ask, so the recording is dropped on the spot.
    // The selection may still be in flight — the copy waits for the chord to
    // be released — and `runCommand` waits for it, which is why pressing a
    // digit mid-hold works without the card having to say anything.
    const removeRoute = window.api.onCommandRoute((index) => {
      const preset = COMMAND_PRESETS[index];
      const phase = commandRef.current?.phase;
      if (!preset || !phase || phase === "running" || phase === "error") return;
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      void runCommand({ commandId: preset.id, label: preset.label });
    });

    // A dictation began on the shared home key and this chord is taking over.
    const removeSupersede = window.api.onCommandSupersede(() => {
      if (stateRef.current === "idle" && !pillActiveRef.current) return;
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      void restoreSystemAudioSafely();
      streamerRef.current?.cancel();
      window.api?.sendRecordingCancelled();
      resetDictation();
    });
    return () => {
      removeDown();
      removeUp();
      removeSelection();
      removeRoute();
      removeSupersede();
    };
  }, [
    beginCommand,
    failCommand,
    finishCommandPress,
    patchCommand,
    resetDictation,
    restoreSystemAudioSafely,
    runCommand,
  ]);

  // ---- Warnings see themselves out ----
  // A warning has said everything it has to say the moment it is read. Leaving
  // it up turns the pill into something the user has to go and clear, on top
  // of whatever they were doing — so both cards time out. The command warning
  // carries no action and goes sooner; the dictation failure can offer a Retry,
  // so it waits long enough for that to be a real choice.
  useEffect(() => {
    if (command?.phase !== "error") return;
    const timer = setTimeout(() => endCommand(), COMMAND_WARNING_MS);
    return () => clearTimeout(timer);
  }, [command?.phase, endCommand]);

  useEffect(() => {
    if (state !== "error") return;
    const timer = setTimeout(hidePill, FAILURE_CARD_MS);
    return () => clearTimeout(timer);
  }, [state, hidePill]);

  // ---- Cleanup on unmount ----
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) {
          cancelRecording();
          recorderRef.current.destroy();
          streamerRef.current?.destroy();
          streamerRef.current = null;
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRecording]);

  // ---- Render ----
  // Two surfaces share one anchor: the capsule, which is the whole UI on the
  // happy path, and — only when a dictation has actually failed — a card that
  // takes over to say what happened and offer the way out. Anything short of
  // a failure (a slow connect, a retry in flight) stays in the capsule as a
  // single mark at its right-hand end. Prose belongs in the card; the capsule
  // sits over whatever the user is actually doing, so it only ever earns a
  // glyph, and the words behind it are in the tooltip and to screen readers.
  const isFreestyleCloud = providerCategoryRef.current === "freestyle_cloud";
  const showErrorCard = state === "error";
  // A command replaces the capsule outright: its own card carries the waveform,
  // so there is nothing left for the capsule to say while one is up.
  const showCommandCard = command !== null;
  const showCard = showErrorCard || showCommandCard;

  // What that mark means. Errors are the card's job, so a "working" notice
  // here is a spinner and a stalled one is the alert mark.
  const statusLabel = showCard
    ? null
    : pillNotice === "reconnecting"
      ? "Reconnecting"
      : pillNotice === "retrying"
        ? "Retrying"
        : pillNotice === "sign-in"
          ? "Sign in needed"
          : pillNotice === "limit"
            ? "Limit reached"
            : pillNotice === "unavailable"
              ? isFreestyleCloud
                ? "Cloud offline"
                : "Unavailable"
              : null;
  const statusIsAlert =
    pillNotice === "unavailable" ||
    pillNotice === "sign-in" ||
    pillNotice === "limit";

  // Only worth showing when more than one dictation is stacked up; a single
  // in-flight transcription is already implied by the sweeping waveform.
  const statusCount =
    pendingCount > 1 && !statusLabel ? String(pendingCount) : null;
  const wantsStatus = !showCard && !!(statusLabel || statusCount);

  const cardTitle =
    pillNotice === "sign-in"
      ? "Sign in to continue"
      : pillNotice === "limit"
        ? "Weekly limit reached"
        : isFreestyleCloud
          ? "Cloud offline"
          : "Transcription failed";
  const cardBody = failedTranscriptionErrorRef.current;

  // What each surface is *currently drawing*, which is not the same as what
  // the state says once it starts leaving: the notice that put it there is
  // usually cleared in the same tick it's dismissed, and re-rendering an empty
  // label (or a re-derived title) would blank the surface a beat before it has
  // finished animating out. Latching holds the last real content until the
  // surface is gone. Writing a ref during render is safe here — it's derived
  // purely from this render's own values, so a repeat render is a no-op.
  const statusContentRef = useRef({
    label: null as string | null,
    count: null as string | null,
    isAlert: false,
  });
  if (wantsStatus) {
    statusContentRef.current = {
      label: statusLabel,
      count: statusCount,
      isAlert: statusIsAlert,
    };
  }
  const status = statusContentRef.current;

  const cardContentRef = useRef({ title: "", body: "", canRetry: false });
  if (showErrorCard) {
    cardContentRef.current = { title: cardTitle, body: cardBody, canRetry };
  }
  const card = cardContentRef.current;

  const commandStatus = !command
    ? null
    : command.phase === "error"
      ? `${command.title}. ${command.body}`
      : command.phase === "running"
        ? `Applying ${command.label ?? "command"}`
        : command.phase === "listening" || command.phase === "capturing"
          ? "Listening for a command"
          : "Pick a command, or hold the hotkey and say what you want";

  const accessibleStatus = commandStatus
    ? commandStatus
    : showErrorCard
      ? `${cardTitle}. ${cardBody}`
      : (statusLabel ??
        (state === "initializing"
          ? "Preparing microphone"
          : state === "recording"
            ? "Listening"
            : state === "transcribing"
              ? "Transcribing"
              : ""));

  // ---- Room for the card ----
  // The capsule, status mark and all, fits the pill window as it is; only the
  // card needs the window grown around it first, so that it animates into
  // space that already exists instead of being clipped for a frame or two.
  // `roomReady` is that handshake; giving the room back waits for the card to
  // finish leaving.
  const [roomReady, setRoomReady] = useState(false);
  useEffect(() => {
    if (!showCard) {
      setRoomReady(false);
      const timer = setTimeout(() => window.api?.setPillExpanded(false), 300);
      return () => clearTimeout(timer);
    }
    window.api?.setPillExpanded(true, showCommandCard ? "command" : "card");
    // Two frames: one for the resize to land, one for the browser to lay the
    // card out at its start values so the transition has something to run
    // from. Setting both in the same frame would jump straight to the end.
    //
    // Both ids are held, because a dismiss (or an unmount) landing in the
    // ~16ms between them would otherwise leave the inner frame uncancelled
    // and still writing state.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRoomReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [showCard, showCommandCard]);

  const cardOpen = showCard && roomReady;
  const errorCardOpen = showErrorCard && roomReady;

  // The failure card can sit there for as long as the user takes to answer it,
  // and the waveform underneath is neither visible nor meaningful by then —
  // park the draw loop once the capsule has finished fading out. The command
  // card is the opposite case: the bars move *into* it, so leave them running.
  useEffect(() => {
    if (!showErrorCard || showCommandCard) return;
    const timer = setTimeout(stopVisualization, 260);
    return () => clearTimeout(timer);
  }, [showErrorCard, showCommandCard, stopVisualization]);

  // Grow the card out of the capsule it replaces, not out of thin air.
  const transformOrigin = `${pillSide === "right" ? "right" : "center"} ${
    pillAlign === "start" ? "top" : "bottom"
  }`;

  // The viewport the waveform is seen through. It narrows from the left as the
  // button opens; the SVG inside is pinned to its right edge, so the newest
  // samples hold their place and only the oldest slide out of view.
  const waveform = (
    <span
      ref={waveClipRef}
      style={{
        position: "relative",
        display: "block",
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <svg
        ref={captureBarLines}
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        style={
          {
            display: "block",
            position: "absolute",
            right: 0,
            top: 0,
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {BAR_X_POSITIONS.map((x) => {
          return (
            <line
              key={x}
              x1={x}
              y1={SVG_HEIGHT / 2 + BAR_WIDTH / 2}
              x2={x}
              y2={SVG_HEIGHT / 2 - BAR_WIDTH / 2}
              stroke={BAR_COLOR}
              strokeWidth={BAR_WIDTH}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </span>
  );

  const layerClass = `pill-layer absolute inset-0 flex ${
    pillAlign === "start" ? "items-start" : "items-end"
  } ${pillSide === "right" ? "justify-end pr-3" : "justify-center"}`;

  // Surfaces rise off the edge they are anchored to, so the motion always
  // reads as coming from the screen edge rather than from an arbitrary
  // direction: negative (downward) when the pill lives at the top.
  const riseBy = (distance: number): React.CSSProperties =>
    ({
      "--pill-rise": `${pillAlign === "start" ? -distance : distance}px`,
    }) as React.CSSProperties;

  // The card surface both the failure and the command card are cut from.
  //
  // Note what is deliberately *not* here: `WebkitAppRegion`. Both cards stay
  // mounted while hidden so they have something to animate out of, and a
  // draggable region is carved out of the window by the compositor from the
  // element geometry alone — `pointer-events: none` and `opacity: 0` do not
  // exempt it. A hidden card is laid out directly over the capsule, so
  // declaring the region here made it swallow every mouse event the pill
  // should have seen: no hover to reveal the cancel button, and no click
  // landing on it. Each card claims the region only while it is really up.
  const cardSurfaceStyle: React.CSSProperties = {
    // The card travels a little further than the capsule, being bigger.
    ...riseBy(14),
    width: PILL_CARD_WIDTH,
    borderRadius: 20,
    background: SURFACE,
    border: SURFACE_BORDER,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
    boxShadow: "0 8px 28px rgba(0, 0, 0, 0.3)",
    transformOrigin,
    marginBottom: pillAlign === "end" ? 8 : 0,
    marginTop: pillAlign === "start" ? 8 : 0,
    cursor: "grab",
  } as React.CSSProperties;

  // ---- Command card content ----
  // Latched for the same reason the failure card's is: the session is cleared
  // the instant a command lands, and re-rendering an empty card would blank it
  // a beat before it has finished animating away.
  const commandViewRef = useRef<CommandSession | null>(null);
  if (command) commandViewRef.current = command;
  const commandView = commandViewRef.current;
  const commandOpen = showCommandCard && roomReady;

  // "Busy" covers every phase in which the list is no longer the thing to
  // look at — the user is either mid-sentence or waiting on the model.
  // The card's headline. It is the microphone's line, so it says what the
  // microphone is doing — and once a command is running, what it is running,
  // since by then the instruction is the only thing worth reading.
  const commandLead =
    commandView?.phase === "running"
      ? (commandView.label ?? "Working…")
      : commandView?.phase === "picking"
        ? // The one state where the key is *not* down: the press was a tap, so
          // there is no microphone running and nothing to say into. This is
          // the only place the card mentions holding, and it does so without
          // naming the accelerator — the user just pressed it.
          "Hold to say what to change"
        : "Say what you want to change";

  return (
    <div className="relative h-screen w-screen select-none overflow-hidden">
      <style>
        {`
          /* One easing for every size and position change in the pill, so the
             capsule growing a label and the card taking over read as the same
             piece of motion. Out-of-view surfaces leave faster than the
             incoming one arrives — the swap should feel like a handover, not
             a crossfade of two equals. */
          .pill-layer { pointer-events: none; }

          /* The summon.
             A surface arrives by rising off the screen edge it is anchored to,
             coming up to size with a little overshoot and resolving out of a
             soft blur — three cheap things that together read as the pill
             being conjured rather than switched on. --pill-rise carries the
             direction, so a top-anchored pill drops in and a bottom-anchored
             one lifts.

             Leaving retraces it: back toward the edge, back into the blur,
             but over a shorter distance and a shorter time and with no
             overshoot. Something on its way out shouldn't ask for the
             attention that something arriving does — the exit should be over
             before you have finished looking away from it. */
          .pill-surface {
            opacity: 0;
            transform: scale(0.93)
              translateY(calc(var(--pill-rise, 10px) * 0.55));
            filter: blur(3px);
            transition: opacity 130ms ease,
              transform 170ms cubic-bezier(0.36, 0, 0.66, -0.2),
              filter 130ms ease;
            pointer-events: none;
          }
          .pill-surface[data-show="true"] {
            opacity: 1;
            transform: none;
            filter: blur(0);
            /* An overshoot curve on transform only. Opacity and blur land
               sooner, so the surface is already readable while it is still
               settling — the motion is felt more than watched. */
            transition: opacity 180ms ease,
              transform 380ms cubic-bezier(0.22, 1.12, 0.36, 1),
              filter 220ms ease;
            pointer-events: auto;
          }
          /* Contents follow the surface in, a beat behind and staggered, so
             the card assembles rather than appearing whole. Small distances
             only: this should register as depth, not as a sequence. */
          .pill-rise {
            opacity: 0;
            transform: translateY(5px);
            transition: opacity 160ms ease, transform 160ms ease;
          }
          .pill-surface[data-show="true"] .pill-rise {
            opacity: 1;
            transform: none;
            transition: opacity 240ms ease,
              transform 380ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .pill-surface[data-show="true"] .pill-rise-1 { transition-delay: 50ms; }
          .pill-surface[data-show="true"] .pill-rise-2 { transition-delay: 95ms; }

          /* ---- Command card ---- */

          /* A column whose order follows the anchored edge, so the waveform
             always ends up against the edge that stays still while the window
             grows — which is what lets the bars hold their position on screen
             as the capsule becomes the box. */
          .pill-command-body {
            display: flex;
            flex-direction: column;
            gap: 9px;
          }
          .pill-command-body[data-anchor="start"] {
            flex-direction: column-reverse;
          }

          /* The bars keep the capsule's own width and height. Only the room
             around them changes. */
          .pill-command-wave {
            display: flex;
            justify-content: center;
            height: ${SVG_HEIGHT}px;
          }

          .pill-command-lead {
            font-size: 12.5px;
            font-weight: 500;
            line-height: 1.25;
            text-align: center;
            color: rgba(245, 241, 228, 0.92);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          /* The route legend. Quiet enough to sit under the line that
             matters, and it collapses to nothing once a command is running so
             the card shrinks to just the work in progress. */
          .pill-command-routes {
            display: flex;
            justify-content: center;
            gap: 12px;
            font-size: 11px;
            line-height: 1;
            color: rgba(245, 241, 228, 0.42);
            transition: opacity 160ms ease;
          }
          .pill-command-routes[data-hidden="true"] { opacity: 0; }
          .pill-command-route {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
          }
          /* The digit is drawn as the key it is, so the legend reads as
             something to press rather than something to click. */
          .pill-command-route-key {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            border-radius: 4px;
            background: rgba(245, 241, 228, 0.11);
            color: rgba(245, 241, 228, 0.62);
            font-size: 9px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
          }

          /* The status mark's slot, opening from the capsule's right end the
             same way the cancel slot opens from its left. */
          .pill-status {
            width: 0;
            opacity: 0;
            overflow: hidden;
            flex-shrink: 0;
            transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease;
          }
          .pill-status[data-open="true"] {
            width: ${STATUS_SLOT}px;
            opacity: 1;
          }
          .pill-status-mark {
            transform: scale(0.7);
            transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .pill-status[data-open="true"] .pill-status-mark { transform: none; }

          /* Progress has no percentage to show and no text to read, so the
             turning ring is the whole message: something is still happening. */
          @keyframes pill-spin { to { transform: rotate(360deg); } }
          .pill-spinner {
            transform-origin: 50% 50%;
            animation: pill-spin 900ms linear infinite;
          }

          /* No chip behind the mark — it sits directly on the capsule, and
             reads as part of it. The button keeps its box as a hit target;
             only the glyph is drawn. */
          .pill-cancel {
            background: none;
            border: 0;
            transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          .pill-cancel:active { transform: scale(0.86); }
          /* Resting dim enough to sit alongside the quiet bars, full strength
             under the cursor so it's clearly the thing you're about to hit. */
          .pill-cancel-glyph { transition: opacity 140ms ease; }

          .pill-action {
            border: 0;
            border-radius: 999px;
            height: 26px;
            padding: 0 12px;
            font-size: 11.5px;
            font-weight: 500;
            line-height: 1;
            letter-spacing: 0.005em;
            cursor: default;
            transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;
          }
          .pill-action:active { transform: scale(0.97); }
          .pill-action-ghost {
            background: transparent;
            color: rgba(245, 241, 228, 0.6);
          }
          .pill-action-primary {
            background: ${INK};
            color: #16140F;
          }

          @media (hover: hover) and (pointer: fine) {
            .pill-cancel:hover .pill-cancel-glyph { opacity: 1; }
            .pill-action-ghost:hover {
              background: rgba(245, 241, 228, 0.1);
              color: rgba(245, 241, 228, 0.88);
            }
            .pill-action-primary:hover { background: #FFFDF5; }
          }

          @media (prefers-reduced-motion: reduce) {
            /* Keep the fade, drop the travel, the overshoot and the blur —
               those are the parts that provoke. */
            .pill-surface,
            .pill-surface[data-show="true"] {
              transform: none !important;
              filter: none !important;
            }
            .pill-rise,
            .pill-surface[data-show="true"] .pill-rise {
              transform: none !important;
              transition-delay: 0ms !important;
            }
            .pill-surface,
            .pill-surface[data-show="true"],
            .pill-rise,
            .pill-status,
            .pill-status-mark,
            .pill-cancel,
            .pill-action { transition-duration: 1ms !important; }
            .pill-card[data-show="false"] { transform: none; }
            /* A spinner that doesn't turn says nothing, so slow it rather
               than stopping it. */
            .pill-spinner { animation-duration: 2.4s; }
          }
        `}
      </style>

      {(state !== "idle" || showCommandCard) && (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            {accessibleStatus}
          </span>

          {/* ---- Capsule ---- */}
          <div className={layerClass} aria-hidden={cardOpen}>
            {/* The capsule is a status indicator, not a control, so an
                interactive role would misdescribe it. These handlers only
                reveal the cancel button, which is a real <button> with its own
                label, and the same action is on Escape — nothing here is
                pointer-only. */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: see above */}
            <div
              className="pill-surface inline-flex items-center"
              data-show={!showCard}
              onMouseEnter={handlePillEnter}
              onMouseLeave={handlePillLeave}
              style={{
                ...pillInnerStyle,
                ...riseBy(10),
                transformOrigin,
                marginBottom: pillAlign === "end" ? 8 : 0,
                marginTop: pillAlign === "start" ? 8 : 0,
              }}
            >
              {/* The fixed core: the cancel slot's width is driven by the draw
                  loop, from zero (closed) to CANCEL_SLOT — the disc plus the
                  gap to the waveform — and the waveform gives up exactly that
                  much, so the core's own width never changes. */}
              <span
                className="inline-flex items-center justify-center"
                style={{ width: PILL_CORE_WIDTH, flexShrink: 0 }}
              >
                <span
                  ref={cancelSlotRef}
                  className="inline-flex items-center justify-start"
                  style={
                    {
                      // Width alone carries the layout, so no padding — it
                      // would be added on top of the animated width.
                      width: 0,
                      height: CANCEL_SIZE,
                      opacity: 0,
                      flexShrink: 0,
                      // Grow out of the capsule's left edge rather than from
                      // the slot's centre, and don't clip the disc while it
                      // scales.
                      transformOrigin: "left center",
                      pointerEvents: "none",
                      WebkitAppRegion: "no-drag",
                    } as React.CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="pill-cancel inline-flex items-center justify-center"
                    onClick={cancelRecording}
                    // The pill window has no i18n provider (only the dashboard
                    // does), and no other string in it is translated. Not worth
                    // pulling the i18next runtime in for one label.
                    aria-label="Cancel dictation"
                    style={{
                      width: CANCEL_SIZE,
                      height: CANCEL_SIZE,
                      padding: 0,
                      flexShrink: 0,
                      cursor: "default",
                    }}
                  >
                    <svg
                      className="pill-cancel-glyph"
                      width={CANCEL_SIZE}
                      height={CANCEL_SIZE}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      style={{ opacity: 0.6 }}
                    >
                      {/* Larger and thinner than it was inside the disc: with
                          no chip to give it presence, the mark carries
                          itself. */}
                      <path
                        d="M4.7 4.7 11.3 11.3 M11.3 4.7 4.7 11.3"
                        stroke={INK}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>

                {!showCommandCard && waveform}
              </span>

              {/* Status, outside the core: the capsule grows to the right by
                  one mark's width and nothing else moves. The words are in
                  the tooltip — and in the live region above — so the glyph
                  itself doesn't have to spell anything out. */}
              <span
                className="pill-status inline-flex items-center justify-end"
                data-open={wantsStatus}
                title={status.label ?? undefined}
                aria-hidden="true"
                style={
                  {
                    height: STATUS_SIZE,
                    WebkitAppRegion: "no-drag",
                  } as React.CSSProperties
                }
              >
                <span
                  className="pill-status-mark inline-flex items-center justify-center"
                  style={{
                    width: STATUS_SIZE,
                    height: STATUS_SIZE,
                    marginRight: STATUS_GAP,
                    flexShrink: 0,
                  }}
                >
                  {status.label ? (
                    status.isAlert ? (
                      <svg
                        width={STATUS_SIZE}
                        height={STATUS_SIZE}
                        viewBox="0 0 16 16"
                      >
                        <title>{status.label}</title>
                        <circle
                          cx="8"
                          cy="8"
                          r="5.6"
                          fill="none"
                          stroke={ALERT}
                          strokeWidth={1.4}
                        />
                        <path
                          d="M8 5.1v3.3"
                          stroke={ALERT}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                        />
                        <circle cx="8" cy="10.7" r="0.8" fill={ALERT} />
                      </svg>
                    ) : (
                      <svg
                        className="pill-spinner"
                        width={STATUS_SIZE}
                        height={STATUS_SIZE}
                        viewBox="0 0 16 16"
                      >
                        <title>{status.label}</title>
                        {/* The track keeps the mark the same weight as the
                            cancel one even where the arc isn't drawn. */}
                        <circle
                          cx="8"
                          cy="8"
                          r="5.6"
                          fill="none"
                          stroke={INK}
                          strokeOpacity={0.18}
                          strokeWidth={1.4}
                        />
                        <path
                          d="M8 2.4a5.6 5.6 0 0 1 5.6 5.6"
                          fill="none"
                          stroke={INK}
                          strokeOpacity={0.8}
                          strokeWidth={1.4}
                          strokeLinecap="round"
                        />
                      </svg>
                    )
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1,
                        letterSpacing: "0.01em",
                        color: "rgba(245, 241, 228, 0.6)",
                      }}
                    >
                      {status.count}
                    </span>
                  )}
                </span>
              </span>
            </div>
          </div>

          {/* ---- Failure card ---- */}
          <div className={layerClass} aria-hidden={!errorCardOpen}>
            <div
              className="pill-surface pill-card"
              data-show={errorCardOpen}
              style={{
                ...cardSurfaceStyle,
                padding: "13px 15px 12px",
                ...(errorCardOpen ? { WebkitAppRegion: "drag" } : {}),
              }}
            >
              <div className="flex items-start" style={{ gap: 10 }}>
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    marginTop: 1,
                    borderRadius: "50%",
                    background: "rgba(224, 128, 95, 0.16)",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 3.1v3.3"
                      stroke={ALERT}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                    <circle cx="6" cy="8.7" r="0.85" fill={ALERT} />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: INK,
                    }}
                  >
                    {card.title}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 11.5,
                      lineHeight: 1.35,
                      color: "rgba(245, 241, 228, 0.58)",
                      // Two lines is enough for any message worth reading at
                      // this size; the rest is in the logs.
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {card.body}
                  </div>
                </div>
              </div>

              <div
                className="flex items-center justify-end"
                style={
                  {
                    gap: 6,
                    marginTop: 11,
                    WebkitAppRegion: "no-drag",
                  } as React.CSSProperties
                }
              >
                <button
                  type="button"
                  className="pill-action pill-action-ghost"
                  onClick={hidePill}
                >
                  Dismiss
                </button>
                {card.canRetry && (
                  <button
                    type="button"
                    className="pill-action pill-action-primary"
                    onClick={retryFailedTranscription}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- Command card ---- */}
          {/* Same surface and the same place on screen as the failure card, so
              the two read as one object the pill can turn into rather than as
              two unrelated popups. */}
          <div className={layerClass} aria-hidden={!commandOpen}>
            <div
              className="pill-surface pill-card"
              data-show={commandOpen}
              style={{
                ...cardSurfaceStyle,
                // The anchored edge gets the capsule's inset — (PILL_HEIGHT -
                // SVG_HEIGHT) / 2 — so the waveform lands exactly where it sat
                // a moment ago. The far edge is free to be roomier.
                padding:
                  pillAlign === "start"
                    ? `${(PILL_HEIGHT - SVG_HEIGHT) / 2}px 14px 13px`
                    : `13px 14px ${(PILL_HEIGHT - SVG_HEIGHT) / 2}px`,
                ...(commandOpen ? { WebkitAppRegion: "drag" } : {}),
              }}
            >
              {commandView?.phase === "error" ? (
                <>
                  <div className="flex items-start" style={{ gap: 10 }}>
                    <span
                      className="inline-flex items-center justify-center"
                      style={{
                        width: 20,
                        height: 20,
                        marginTop: 1,
                        borderRadius: "50%",
                        background: "rgba(224, 128, 95, 0.16)",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 3.1v3.3"
                          stroke={ALERT}
                          strokeWidth={1.6}
                          strokeLinecap="round"
                        />
                        <circle cx="6" cy="8.7" r="0.85" fill={ALERT} />
                      </svg>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: INK,
                        }}
                      >
                        {commandView.title}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11.5,
                          lineHeight: 1.35,
                          color: "rgba(245, 241, 228, 0.58)",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {commandView.body}
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-end"
                    style={
                      {
                        marginTop: 11,
                        WebkitAppRegion: "no-drag",
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className="pill-action pill-action-ghost"
                      onClick={() => endCommand()}
                    >
                      Dismiss
                    </button>
                  </div>
                </>
              ) : (
                <div className="pill-command-body" data-anchor={pillAlign}>
                  {/* The routes, as a legend rather than controls: these are
                      keys you press on the chord you are already holding, so
                      what the card owes you is the number, not a target to
                      click. It hides once a command is under way — by then it
                      is answering a question nobody is asking any more. */}
                  <div
                    className="pill-command-routes pill-rise pill-rise-2"
                    data-hidden={commandView?.phase === "running"}
                    aria-hidden="true"
                  >
                    {COMMAND_PRESETS.map((preset, index) => (
                      <span className="pill-command-route" key={preset.id}>
                        <span className="pill-command-route-key">
                          {index + 1}
                        </span>
                        {preset.label}
                      </span>
                    ))}
                  </div>

                  <div className="pill-command-lead pill-rise pill-rise-1">
                    {commandLead}
                  </div>

                  {/* The waveform, at the size and the spot it occupies in the
                      capsule — the box grows around it rather than replacing
                      it, so the bars never jump when the card takes over. Only
                      ever mounted here while a command is up: a second copy in
                      the tree would take the ref the draw loop writes through,
                      and the visible row would sit still. */}
                  <div className="pill-command-wave">
                    {showCommandCard && waveform}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
