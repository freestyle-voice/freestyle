import { Orb } from "@renderer/components/ui/orb";
import { capture } from "@renderer/lib/analytics";
import { getApiBase, getClient, refreshApiBase } from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { useCallback, useEffect, useRef, useState } from "react";

const BARS = 14;
const RISE = 0.55;
const FALL = 0.22;
const SVG_WIDTH = 117;
const SVG_HEIGHT = 25;

type PillState =
  | "idle"
  | "initializing"
  | "recording"
  | "transcribing"
  | "error";

type BarMode = "connecting" | "listening" | "speaking";

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _outputMode = "paste";
let _toneCtx: AudioContext | null = null;

function getToneCtx(): AudioContext {
  if (!_toneCtx || _toneCtx.state === "closed") _toneCtx = new AudioContext();
  return _toneCtx;
}

type TonePreset = "start" | "stop";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 880, ms: 100 },
  stop: { freq: 660, ms: 100 },
};

async function playTone(preset: TonePreset, volume = 0.3): Promise<void> {
  if (!_soundEnabled) return;
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = getToneCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {}
}

function smoothBars(prev: number[], next: number[]): number[] {
  return prev.map((p, i) => {
    const n = next[i] ?? 0;
    const k = n > p ? RISE : FALL;
    return p + (n - p) * k;
  });
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PILL_WIDTH = 216;

const pillInnerStyle: React.CSSProperties = {
  height: 43,
  width: PILL_WIDTH,
  padding: "0 9px",
  borderRadius: 25,
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  fontWeight: 500,
  WebkitAppRegion: "no-drag",
} as React.CSSProperties;

const pillTextStyle: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 12,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 7,
};

interface TranscribeResult {
  raw: string;
  cleaned: string;
  error?: string;
}

interface QueueEntry {
  promise: Promise<TranscribeResult>;
}

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [pillAlign, setPillAlign] = useState<"start" | "end">("end");
  const [pillSide, setPillSide] = useState<"center" | "right">("center");
  const useStreamingRef = useRef(false);
  const sessionStreamingRef = useRef(false);

  const [isReRecording, setIsReRecording] = useState(false);
  const isReRecordingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<number[]>(new Array(BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  /** True only while state is "recording" — used by the queue drain wait loop. */
  const recordingActiveRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const pendingCommitRef = useRef(false);
  const pillActiveRef = useRef(false);
  const barModeRef = useRef<BarMode | null>(null);
  const scanIndexRef = useRef(0);
  const scanTickRef = useRef(0);
  const speakingStartRef = useRef(0);
  const lastIpcTimeRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const streamResolverRef = useRef<((r: TranscribeResult) => void) | null>(
    null,
  );
  const drainAgainRef = useRef(false);

  const getInputVolume = useCallback(() => volumeRef.current, []);

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

      if (recordingActiveRef.current || queueRef.current.length > 0) {
        const resolved = results
          .filter((r) => r.raw.trim())
          .map((r) => ({ promise: Promise.resolve(r) }));
        queueRef.current = [...resolved, ...queueRef.current];
        return;
      }

      const nonEmpty = results.filter((r) => r.raw.trim());
      if (nonEmpty.length === 0) {
        const errMsg = results.find((r) => r.error)?.error;
        if (errMsg) {
          setState("error");
          setMessage(errMsg);
          setTimeout(() => hidePill(), 3000);
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
          const res = await fetch(`${getApiBase()}/api/post-process`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: combined,
              appContext: appContextRef.current,
            }),
          });
          if (!pillActiveRef.current) {
            return;
          }
          if (res.ok) {
            const data = await res.json();
            finalText = data.cleaned || combined;
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
        if (_outputMode === "clipboard") {
          await window.api.copyText(finalText);
        } else {
          await window.api.pasteText(finalText);
        }
      } catch (err) {
        console.error("[pill] paste/copy failed:", err);
      }
      window.api.sendTranscriptionDone();

      // North-star usage metric: fires exactly once per completed dictation,
      // at the single point where single-chunk, multi-chunk, and streaming
      // paths converge and text is delivered to the user.
      capture("dictation completed", {
        segments: nonEmpty.length,
        multi_segment: nonEmpty.length > 1,
        output_mode: _outputMode,
        char_count: finalText.length,
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
      }
    }
  }, []);

  // ---- Streamer (lazy singleton) ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), {
        onConfig: (config) => {
          useStreamingRef.current = config.streaming;
          if (wantsMicRef.current) {
            sessionStreamingRef.current = config.streaming;
          }
        },
        onReady: () => {},
        onPartial: () => {},
        onFinal: (text) => {
          const resolver = streamResolverRef.current;
          if (!resolver) return;
          streamResolverRef.current = null;
          resolver({ raw: text, cleaned: text });
        },
        onCleaned: () => {},
        onError: (msg) => {
          const resolver = streamResolverRef.current;
          if (resolver) {
            streamResolverRef.current = null;
            const wavBlob = streamerRef.current?.getWavBlob() ?? null;
            if (wavBlob) {
              const durationMs = Date.now() - startTimeRef.current;
              const headers: Record<string, string> = {
                "Content-Type": "audio/wav",
                "x-audio-duration-ms": String(durationMs),
              };
              if (appContextRef.current)
                headers["x-app-context"] = appContextRef.current;
              if (queueRef.current.length > 0 || drainingRef.current)
                headers["x-skip-post-process"] = "true";
              fetch(`${getApiBase()}/api/transcribe`, {
                method: "POST",
                body: wavBlob,
                headers,
              })
                .then(async (res) => {
                  if (!res.ok) return { raw: "", cleaned: "", error: msg };
                  const data = await res.json();
                  return {
                    raw: (data.raw || "").trim(),
                    cleaned: (data.cleaned || data.raw || "").trim(),
                  };
                })
                .catch(() => ({ raw: "", cleaned: "", error: msg }))
                .then(resolver);
              return;
            }
            resolver({ raw: "", cleaned: "", error: msg });
            return;
          }
          if (!useStreamingRef.current) return;
          if (!pillActiveRef.current) return;
          if (wantsMicRef.current) return;
          setState("error");
          setMessage(msg);
          setTimeout(() => hidePill(), 2000);
        },
      });
    }
    return streamerRef.current;
  }, []);

  // ---- Bar animation loop ----
  const applyBarsToSvg = useCallback(() => {
    const svg = barsSvgRef.current;
    if (!svg) return;
    const lines = svg.querySelectorAll("line");
    for (let i = 0; i < lines.length; i++) {
      const val = barsRef.current[i] ?? 0;
      const h = Math.max(2, val * SVG_HEIGHT * 1.25);
      lines[i].setAttribute("y1", String((SVG_HEIGHT + h) / 2));
      lines[i].setAttribute("y2", String((SVG_HEIGHT - h) / 2));
      lines[i].style.opacity = String(0.5 + val * 0.5);
    }
  }, []);

  const runBars = useCallback(() => {
    const mode = barModeRef.current;
    if (!mode) return;

    if (mode === "connecting") {
      const now = performance.now();
      if (now - scanTickRef.current >= 150) {
        scanTickRef.current = now;
        scanIndexRef.current = (scanIndexRef.current + 1) % BARS;
      }
      const raw: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const distA = Math.abs(i - scanIndexRef.current);
        const distB = Math.abs(i - (BARS - 1 - scanIndexRef.current));
        const dist = Math.min(distA, distB);
        raw.push(dist === 0 ? 0.7 : dist === 1 ? 0.3 : 0.05);
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.15;
    } else if (mode === "listening") {
      const analyser = analyserNodeRef.current;
      const dataArray = freqDataRef.current;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const sliceSize = Math.floor(analyser.frequencyBinCount / BARS);
        const raw: number[] = [];
        let totalSum = 0;
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < sliceSize; j++)
            sum += dataArray[i * sliceSize + j];
          const val = sum / sliceSize / 255;
          raw.push(val);
          totalSum += val;
        }
        barsRef.current = smoothBars(barsRef.current, raw);
        const volume = Math.min(1, (totalSum / BARS) * 2.5);
        volumeRef.current = volume;
        const now = performance.now();
        if (now - lastIpcTimeRef.current >= 100) {
          lastIpcTimeRef.current = now;
          window.api?.sendAudioLevel(volume);
        }
      }
    } else if (mode === "speaking") {
      const time = (performance.now() - speakingStartRef.current) / 1000;
      const raw: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const wave = Math.sin(time * 2 + i * 0.5) * 0.3 + 0.5;
        const noise = Math.sin(time * 7.3 + i * 2.1) * 0.1;
        raw.push(Math.max(0.1, Math.min(1, wave + noise)));
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.4;
    }

    applyBarsToSvg();
    rafRef.current = requestAnimationFrame(runBars);
  }, [applyBarsToSvg]);

  // ---- Visualization control ----
  const startBarAnimation = useCallback(
    (mode: BarMode) => {
      cancelAnimationFrame(rafRef.current);
      barModeRef.current = mode;
      if (mode === "connecting") {
        scanIndexRef.current = 0;
        scanTickRef.current = performance.now();
      } else if (mode === "speaking") {
        speakingStartRef.current = performance.now();
      }
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
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      audioSourceRef.current = source;
      analyserNodeRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      startBarAnimation("listening");
    },
    [startBarAnimation],
  );

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    barModeRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = 0;
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;
    barsRef.current = new Array(BARS).fill(0);
    volumeRef.current = 0;
    setElapsed(0);
  }, []);

  // ---- Hide pill ----
  const hidePill = useCallback(() => {
    setState("idle");
    setMessage("");
    setIsReRecording(false);
    isReRecordingRef.current = false;
    setPendingCount(0);
    wantsMicRef.current = false;
    pillActiveRef.current = false;
    queueRef.current = [];
    drainingRef.current = false;
    drainAgainRef.current = false;
    recordingActiveRef.current = false;
    streamResolverRef.current = null;
    stopVisualization();
    window.api.hidePill();
  }, [stopVisualization]);

  // ---- Start recording ----
  const startRecording = useCallback(
    async (forReRecord = false) => {
      if (wantsMicRef.current) {
        return;
      }
      wantsMicRef.current = true;
      pillActiveRef.current = true;
      pendingCommitRef.current = false;
      setMessage("");

      if (forReRecord) {
        isReRecordingRef.current = true;
        setIsReRecording(true);
      } else {
        isReRecordingRef.current = false;
        setIsReRecording(false);
      }

      appContextRef.current = null;
      const streamer = getStreamer();
      try {
        streamer.setContext(null);
      } catch {}

      window.api
        ?.getFrontmostApp()
        .then((app) => {
          appContextRef.current = app;
          try {
            streamer.setContext(app);
          } catch {}
        })
        .catch(() => {
          appContextRef.current = null;
          try {
            streamer.setContext(null);
          } catch {}
        });

      if (!forReRecord) {
        setState("initializing");
        startBarAnimation("connecting");
      }

      try {
        sessionStreamingRef.current = useStreamingRef.current;
        const stream = await recorderRef.current.acquireStream();

        if (!wantsMicRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          return;
        }
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          streamerRef.current?.cancel();
          if (!forReRecord) hidePill();
          return;
        }

        playTone("start");
        setState("recording");
        recordingActiveRef.current = true;
        startTimeRef.current = Date.now();
        timerRef.current = window.setInterval(() => {
          if (!wantsMicRef.current) return;
          setElapsed(Date.now() - startTimeRef.current);
        }, 100);

        startListening(stream);
        try {
          await streamer.startCapture(stream);
        } catch {}
      } catch (err) {
        wantsMicRef.current = false;
        pendingCommitRef.current = false;
        isReRecordingRef.current = false;
        setIsReRecording(false);
        recorderRef.current.releaseStream();
        stopVisualization();
        setState("error");
        setMessage(err instanceof Error ? err.message : "Mic access denied");
        setTimeout(() => hidePill(), 2000);
      }
    },
    [
      startBarAnimation,
      startListening,
      stopVisualization,
      hidePill,
      getStreamer,
    ],
  );

  // ---- Commit recording ----
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    recordingActiveRef.current = false;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    playTone("stop");

    clearInterval(timerRef.current);
    timerRef.current = 0;
    setElapsed(0);
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
    if (recordingDuration < 500) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      streamerRef.current?.cancel();
      if (queueRef.current.length === 0 && !drainingRef.current) {
        hidePill();
      } else {
        setState("transcribing");
        startBarAnimation("speaking");
      }
      return;
    }

    setState("transcribing");
    startBarAnimation("speaking");

    const empty: TranscribeResult = { raw: "", cleaned: "" };

    if (sessionStreamingRef.current && streamerRef.current) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();

      setPendingCount((c) => c + 1);
      const transcribePromise = new Promise<TranscribeResult>((resolve) => {
        streamResolverRef.current = resolve;
        setTimeout(() => {
          if (streamResolverRef.current === resolve) {
            streamResolverRef.current = null;
            resolve({
              raw: "",
              cleaned: "",
              error: "Transcription timed out",
            });
          }
        }, 30000);
      }).finally(() => {
        setPendingCount((c) => Math.max(0, c - 1));
      });
      streamerRef.current.commit();
      queueRef.current.push({ promise: transcribePromise });
      drainQueue();
      return;
    }

    streamerRef.current?.commit();

    let wavBlob: Blob | null = null;
    if (recorderRef.current.isRecording()) {
      wavBlob = await recorderRef.current.stop();
    } else {
      wavBlob = streamerRef.current?.getWavBlob() ?? null;
    }
    recorderRef.current.releaseStream();

    if (!pillActiveRef.current) {
      return;
    }

    if (!wavBlob) {
      if (queueRef.current.length === 0 && !drainingRef.current) {
        setState("error");
        setMessage("No audio captured. Try recording again.");
        setTimeout(() => hidePill(), 2500);
      }
      return;
    }

    const isSubsequent = queueRef.current.length > 0 || drainingRef.current;
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "x-audio-duration-ms": String(recordingDuration),
    };
    if (appContextRef.current) headers["x-app-context"] = appContextRef.current;
    if (isSubsequent) headers["x-skip-post-process"] = "true";

    const serverOk = await refreshApiBase();
    if (!serverOk) {
      setState("error");
      setMessage(
        `Cannot reach Freestyle server at ${getApiBase()}. Quit and reopen the app.`,
      );
      setTimeout(() => hidePill(), 4000);
      return;
    }

    setPendingCount((c) => c + 1);
    const transcribePromise: Promise<TranscribeResult> = fetch(
      `${getApiBase()}/api/transcribe`,
      { method: "POST", body: wavBlob, headers },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            detail?: string;
          } | null;
          const msg =
            body?.detail ||
            body?.error ||
            `Transcription failed (${res.status})`;
          if (pillActiveRef.current && !wantsMicRef.current) {
            setState("error");
            setMessage(msg);
            setTimeout(() => hidePill(), 3000);
          }
          return empty;
        }
        const data = (await res.json()) as {
          raw?: string;
          cleaned?: string;
        };
        return {
          raw: (data.raw || "").trim(),
          cleaned: (data.cleaned || data.raw || "").trim(),
        };
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        const hint =
          msg.includes("fetch") || msg.includes("Failed")
            ? ` (${getApiBase()} unreachable — quit and reopen the app)`
            : "";
        return { raw: "", cleaned: "", error: `${msg}${hint}` };
      })
      .finally(() => {
        setPendingCount((c) => Math.max(0, c - 1));
      });

    queueRef.current.push({ promise: transcribePromise });
    drainQueue();
  }, [hidePill, drainQueue, startBarAnimation]);

  // ---- Cancel ----
  const cancelRecording = useCallback(() => {
    wantsMicRef.current = false;
    recordingActiveRef.current = false;
    pillActiveRef.current = false;
    isReRecordingRef.current = false;
    setIsReRecording(false);
    queueRef.current = [];
    drainingRef.current = false;
    drainAgainRef.current = false;
    streamResolverRef.current = null;
    setPendingCount(0);
    stopVisualization();
    streamerRef.current?.cancel();
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    hidePill();
  }, [stopVisualization, hidePill]);

  // ---- Preferences ----
  const applyPillPosition = useCallback((pos: string | null | undefined) => {
    setPillAlign(pos?.startsWith("top") ? "start" : "end");
    setPillSide(pos?.endsWith("right") ? "right" : "center");
  }, []);

  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: "sound_enabled" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "false") _soundEnabled = false;
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "output_mode" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) _outputMode = data.value;
      })
      .catch(() => {});
    window.api
      ?.getPillPosition()
      .then(applyPillPosition)
      .catch(() => {});

    // Listen for live changes from the settings UI
    const removePillPos = window.api?.onPillPositionChanged(applyPillPosition);
    const removeOutputMode = window.api?.onOutputModeChanged((mode) => {
      _outputMode = mode;
    });
    return () => {
      removePillPos?.();
      removeOutputMode?.();
    };
  }, [applyPillPosition]);

  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      const s = stateRef.current;
      if (s === "idle" || s === "error") {
        startRecording(false);
      } else if (s === "transcribing" && !recordingActiveRef.current) {
        startRecording(true);
      }
    });
    const removeUp = window.api.onHotkeyUp(() => {
      if (stateRef.current === "recording") {
        commitRecording();
      } else if (stateRef.current === "initializing") {
        pendingCommitRef.current = true;
      }
    });
    const removeCancel = window.api.onPillCancel(() => {
      if (stateRef.current !== "idle") cancelRecording();
    });
    return () => {
      removeDown();
      removeUp();
      removeCancel();
    };
  }, [startRecording, commitRecording, cancelRecording]);

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
  const gap = SVG_WIDTH / BARS;
  const barWidth = Math.min(gap * 0.55, 5);

  const topGlow =
    state === "initializing"
      ? "glow-initializing"
      : state === "recording"
        ? "glow-recording"
        : state === "transcribing" && !isReRecording
          ? "glow-transcribing"
          : state === "error"
            ? "glow-error"
            : "glow-idle";

  const badge =
    state === "recording"
      ? formatTimer(elapsed)
      : state === "transcribing" && pendingCount > 0
        ? `x${pendingCount}`
        : null;

  const showBars =
    state === "initializing" ||
    state === "recording" ||
    state === "transcribing";

  const renderBars = (ref?: React.RefObject<SVGSVGElement | null>) => (
    <svg
      ref={ref}
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      style={{ display: "block", flexShrink: 0 }}
      role="img"
      aria-label="Audio levels"
    >
      {Array.from({ length: BARS }, (_, i) => {
        const x = gap * (i + 0.5);
        return (
          <line
            key={i}
            x1={x}
            y1={SVG_HEIGHT / 2 + 1}
            x2={x}
            y2={SVG_HEIGHT / 2 - 1}
            stroke="var(--muted-foreground)"
            strokeWidth={barWidth}
            strokeLinecap="round"
            style={{ opacity: 0.5 }}
          />
        );
      })}
    </svg>
  );

  return (
    <div
      className={`flex h-screen w-screen select-none ${
        pillAlign === "start" ? "items-start" : "items-end"
      } ${pillSide === "right" ? "justify-end pr-3" : "justify-center"}`}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <style>
        {`
          @keyframes glow-pulse-amber {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(251,191,36,0.12), 0 0 13px 3px rgba(251,191,36,0.05); }
            50% { box-shadow: 0 0 10px 2px rgba(251,191,36,0.22), 0 0 16px 4px rgba(251,191,36,0.09); }
          }
          @keyframes glow-pulse-green {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(138,182,42,0.12), 0 0 13px 3px rgba(138,182,42,0.05); }
            50% { box-shadow: 0 0 10px 2px rgba(138,182,42,0.20), 0 0 16px 4px rgba(138,182,42,0.08); }
          }
          @keyframes glow-pulse-blue {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(96,165,250,0.14), 0 0 13px 3px rgba(96,165,250,0.06); }
            50% { box-shadow: 0 0 10px 2px rgba(96,165,250,0.22), 0 0 16px 4px rgba(96,165,250,0.09); }
          }
          @keyframes glow-pulse-red {
            0%, 100% { box-shadow: 0 0 6px 2px rgba(221,110,78,0.12); }
            50% { box-shadow: 0 0 10px 2px rgba(221,110,78,0.20); }
          }
          .glow-initializing { animation: glow-pulse-amber 1s ease-in-out infinite; }
          .glow-recording { animation: glow-pulse-green 2s ease-in-out infinite; }
          .glow-transcribing { animation: glow-pulse-blue 1.5s ease-in-out infinite; }
          .glow-error { animation: glow-pulse-red 1.5s ease-in-out infinite; }
          .glow-idle { box-shadow: 0 0 5px 2px rgba(0,0,0,0.05); transition: box-shadow 300ms ease; }
          @keyframes shimmer {
            0% { background-position: 100% center; }
            100% { background-position: 0% center; }
          }
          .shimmer-text {
            font-style: italic;
            background: linear-gradient(90deg, var(--muted-foreground) calc(50% - 40px), var(--foreground), var(--muted-foreground) calc(50% + 40px));
            background-size: 250% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
            animation: shimmer 2s linear infinite;
          }
          @keyframes stack-slide-down {
            from { opacity: 0; transform: translateX(-50%) scale(0.87) translateY(-8px); }
            to   { opacity: 0.95; transform: translateX(-50%) scale(0.87) translateY(0); }
          }
          @keyframes stack-slide-up {
            from { opacity: 0; transform: translateX(-50%) scale(0.87) translateY(8px); }
            to   { opacity: 0.95; transform: translateX(-50%) scale(0.87) translateY(0); }
          }
          .stack-enter-down { animation: stack-slide-down 100ms ease-out both; }
          .stack-enter-up   { animation: stack-slide-up 100ms ease-out both; }
        `}
      </style>

      <div
        style={{
          position: "relative",
          marginBottom: pillAlign === "end" ? 8 : "auto",
          marginTop: pillAlign === "start" ? 8 : "auto",
        }}
      >
        {isReRecording && (
          <div
            className={
              pillAlign === "end" ? "stack-enter-up" : "stack-enter-down"
            }
            style={{
              borderRadius: 25,
              position: "absolute",
              ...(pillAlign === "end" ? { top: -18 } : { bottom: -18 }),
              left: "50%",
              transform: "translateX(-50%) scale(0.87)",
              opacity: 0.95,
              pointerEvents: "none",
              zIndex: 0,
              width: "100%",
            }}
          >
            <div
              className="inline-flex items-center gap-2.5"
              style={pillInnerStyle}
            >
              <div
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Orb
                  colors={["#60A5FA", "#3B82F6"]}
                  agentState="talking"
                  className="h-full w-full"
                />
              </div>
              <span style={pillTextStyle}>
                <span className="shimmer-text">Transcribing...</span>
              </span>
              {pendingCount > 0 && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    opacity: 0.6,
                    flexShrink: 0,
                    color: "var(--muted-foreground)",
                    paddingRight: 5,
                  }}
                >
                  x{pendingCount}
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className={topGlow}
          style={{
            borderRadius: 25,
            visibility: state === "idle" ? "hidden" : "visible",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="inline-flex items-center gap-2.5"
            style={pillInnerStyle}
          >
            <div
              style={{
                width: 29,
                height: 29,
                borderRadius: "50%",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <Orb
                colors={
                  state === "error"
                    ? ["#DD6E4E", "#B85C3A"]
                    : state === "transcribing"
                      ? ["#60A5FA", "#3B82F6"]
                      : state === "initializing"
                        ? ["#FBBF24", "#F59E0B"]
                        : ["#8AB62A", "#6B8F12"]
                }
                agentState={
                  state === "initializing"
                    ? "talking"
                    : state === "recording"
                      ? "listening"
                      : state === "transcribing"
                        ? "talking"
                        : null
                }
                getInputVolume={
                  state === "recording" ? getInputVolume : undefined
                }
                className="h-full w-full"
              />
            </div>

            {showBars && renderBars(barsSvgRef)}

            {state === "error" && (
              <span style={pillTextStyle}>{message || "Error"}</span>
            )}

            {badge && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  opacity: 0.6,
                  flexShrink: 0,
                  color: "var(--muted-foreground)",
                  paddingRight: 5,
                }}
              >
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
