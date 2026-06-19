import { VoicePill } from "@renderer/components/ui/voice-pill";
import { capture } from "@renderer/lib/analytics";
import {
  getApiBase,
  getAuthHeaders,
  getClient,
  getServerToken,
  refreshApiBase,
} from "@renderer/lib/api";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioPlaybackMode,
  normalizeAudioPlaybackMode,
} from "../../../shared/audio-playback";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

type PillState = "idle" | "initializing" | "recording" | "transcribing";

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _outputMode = "paste";
let _audioPlaybackMode: AudioPlaybackMode = "off";
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

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TranscribeResult {
  raw: string;
  cleaned: string;
  error?: string;
}

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

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const stateRef = useRef<PillState>("idle");
  const setPillState = useCallback((next: PillState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [elapsed, setElapsed] = useState(0);
  const [pillAlign, setPillAlign] = useState<"start" | "end">("end");
  const [pillSide, setPillSide] = useState<"center" | "right">("center");
  const supportsSessionTransportRef = useRef(false);
  const recordingSessionUsesTransportRef = useRef(false);

  const [pendingCount, setPendingCount] = useState(0);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number>(0);
  const wantsMicRef = useRef(false);
  /** True only while state is "recording" — used by the queue drain wait loop. */
  const recordingActiveRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const pendingCommitRef = useRef(false);
  const pillActiveRef = useRef(false);

  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const streamResolverRef = useRef<((r: TranscribeResult) => void) | null>(
    null,
  );
  const drainAgainRef = useRef(false);

  const isTranscriptionIdle = useCallback(
    (): boolean =>
      queueRef.current.length === 0 &&
      !drainingRef.current &&
      streamResolverRef.current === null,
    [],
  );

  // Mic stream handed to the voice pill while recording (drives its level bars).
  const [pillStream, setPillStream] = useState<MediaStream | null>(null);
  // The pill reports input volume each frame; forward it for system-audio ducking.
  const handlePillVolume = useCallback((v: number) => {
    window.api?.sendAudioLevel(v);
  }, []);

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

      if (
        recordingActiveRef.current ||
        wantsMicRef.current ||
        queueRef.current.length > 0
      ) {
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
          hidePill();
          window.api.showErrorDialog("Transcription Failed", errMsg);
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
      // at the single point where single-chunk, multi-chunk, and
      // session-transport paths converge and text is delivered to the user.
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
        "x-audio-duration-ms": String(Date.now() - startTimeRef.current),
        ...getAuthHeaders(),
      };
      if (appContextRef.current)
        headers["x-app-context"] = encodeAppContext(appContextRef.current);
      if (queueRef.current.length > 0 || drainingRef.current)
        headers["x-skip-post-process"] = "true";
      return fetch(`${getApiBase()}/api/transcribe`, {
        method: "POST",
        body: wavBlob,
        headers,
      })
        .then(async (res) => {
          if (!res.ok) return { raw: "", cleaned: "", error: errorMsg };
          const data = (await res.json()) as { raw?: string; cleaned?: string };
          return {
            raw: (data.raw || "").trim(),
            cleaned: (data.cleaned || data.raw || "").trim(),
          };
        })
        .catch(() => ({ raw: "", cleaned: "", error: errorMsg }));
    },
    [],
  );

  // ---- Streamer (lazy singleton) ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(
        getApiBase(),
        {
          onConfig: (config) => {
            supportsSessionTransportRef.current = config.sessionTransport;
            if (wantsMicRef.current) {
              recordingSessionUsesTransportRef.current =
                config.sessionTransport;
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
              const fallback = restFallbackTranscribe(msg);
              if (fallback) {
                void fallback.then(resolver);
                return;
              }
              resolver({ raw: "", cleaned: "", error: msg });
              return;
            }
            if (!supportsSessionTransportRef.current) return;
            if (!pillActiveRef.current) return;
            if (wantsMicRef.current) return;
            hidePill();
            window.api.showErrorDialog("Transcription Failed", msg);
          },
        },
        getServerToken(),
      );
    }
    return streamerRef.current;
  }, []);

  // The voice pill owns its analyser + bar animation; here we just stop the
  // recording timer and drop the mic stream so the pill tears down.
  const stopVisualization = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = 0;
    setPillStream(null);
    setElapsed(0);
  }, []);

  // ---- Hide pill ----
  const hidePill = useCallback(() => {
    setPillState("idle");
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
  }, [stopVisualization, setPillState]);

  const resumeTranscribingOrHide = useCallback(() => {
    if (isTranscriptionIdle()) {
      hidePill();
    } else {
      setPillState("transcribing");
      void drainQueue();
    }
  }, [hidePill, setPillState, drainQueue, isTranscriptionIdle]);

  // ---- Start recording ----
  const startRecording = useCallback(
    async (forReRecord = false) => {
      if (wantsMicRef.current) {
        return;
      }
      wantsMicRef.current = true;
      pillActiveRef.current = true;
      pendingCommitRef.current = false;

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

      setPillState("initializing");

      try {
        if (_audioPlaybackMode !== "off") {
          await window.api
            ?.prepareSystemAudio(_audioPlaybackMode)
            .catch(() => {});
        }
        if (!wantsMicRef.current) {
          window.api?.restoreSystemAudio().catch(() => {});
          return;
        }

        recordingSessionUsesTransportRef.current =
          supportsSessionTransportRef.current;

        const stream = await recorderRef.current.acquireStream();

        if (!wantsMicRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          window.api?.restoreSystemAudio().catch(() => {});
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
          window.api?.restoreSystemAudio().catch(() => {});
          streamerRef.current?.cancel();
          if (forReRecord) {
            resumeTranscribingOrHide();
          } else {
            hidePill();
          }
          return;
        }

        playTone("start");
        setPillState("recording");
        recordingActiveRef.current = true;
        startTimeRef.current = Date.now();
        timerRef.current = window.setInterval(() => {
          if (!wantsMicRef.current) return;
          setElapsed(Date.now() - startTimeRef.current);
        }, 100);

        setPillStream(stream);
        try {
          await streamer.startCapture(stream);
        } catch {}
      } catch (err) {
        pendingCommitRef.current = false;
        recorderRef.current.releaseStream();
        window.api?.restoreSystemAudio().catch(() => {});
        hidePill();
        window.api.showErrorDialog(
          "Recording Failed",
          err instanceof Error ? err.message : "Mic access denied",
        );
      }
    },
    [hidePill, getStreamer, setPillState, resumeTranscribingOrHide],
  );

  // ---- Commit recording ----
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    recordingActiveRef.current = false;
    playTone("stop");

    clearInterval(timerRef.current);
    timerRef.current = 0;
    setElapsed(0);
    setPillStream(null);

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 500) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      window.api?.restoreSystemAudio().catch(() => {});
      streamerRef.current?.cancel();
      resumeTranscribingOrHide();
      return;
    }

    setPillState("transcribing");

    if (recordingSessionUsesTransportRef.current && streamerRef.current) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      window.api?.restoreSystemAudio().catch(() => {});

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
        }, 15000);
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
    window.api?.restoreSystemAudio().catch(() => {});

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
      ...getAuthHeaders(),
    };
    if (appContextRef.current)
      headers["x-app-context"] = encodeAppContext(appContextRef.current);
    if (isSubsequent) headers["x-skip-post-process"] = "true";

    const serverOk = await refreshApiBase();
    if (!serverOk) {
      hidePill();
      window.api.showErrorDialog(
        "Server Unreachable",
        `Cannot reach Freestyle server at ${getApiBase()}. Quit and reopen the app.`,
      );
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
          return { raw: "", cleaned: "", error: msg };
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
  }, [
    hidePill,
    drainQueue,
    restFallbackTranscribe,
    setPillState,
    resumeTranscribingOrHide,
    isTranscriptionIdle,
  ]);

  // ---- Cancel ----
  const cancelRecording = useCallback(() => {
    const resolver = streamResolverRef.current;
    if (resolver) {
      streamResolverRef.current = null;
      resolver({ raw: "", cleaned: "" });
    }
    streamerRef.current?.cancel();
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    window.api?.restoreSystemAudio().catch(() => {});
    hidePill();
  }, [hidePill]);

  // ---- Preferences ----
  const applyPillPosition = useCallback((pos: string | null | undefined) => {
    const isTop =
      pos === "top-center" || pos === "top-right" || pos === "custom-top";
    setPillAlign(isTop ? "start" : "end");
    setPillSide(pos?.endsWith("right") ? "right" : "center");
  }, []);

  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.soundEnabled } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "false") _soundEnabled = false;
      })
      .catch(() => {});
    void (async () => {
      try {
        const modeResponse = await getClient().api.settings[":key"].$get({
          param: { key: "audio_playback_mode" },
        });
        const modeData = modeResponse.ok ? await modeResponse.json() : null;
        if (modeData?.value) {
          _audioPlaybackMode = normalizeAudioPlaybackMode(modeData.value);
          return;
        }

        const legacyPauseResponse = await getClient().api.settings[":key"].$get(
          {
            param: { key: "pause_playback_while_recording" },
          },
        );
        const legacyPauseData = legacyPauseResponse.ok
          ? await legacyPauseResponse.json()
          : null;
        if (legacyPauseData?.value === "true") {
          _audioPlaybackMode = "pause";
          return;
        }

        const legacyDuckResponse = await getClient().api.settings[":key"].$get({
          param: { key: "audio_ducking_enabled" },
        });
        const legacyDuckData = legacyDuckResponse.ok
          ? await legacyDuckResponse.json()
          : null;
        _audioPlaybackMode = legacyDuckData?.value === "true" ? "duck" : "off";
      } catch {}
    })();
    getClient()
      .api.settings[":key"].$get({ param: { key: SETTINGS_KEYS.outputMode } })
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
    const removeAudioDucking = window.api?.onAudioDuckingChanged((enabled) => {
      _audioPlaybackMode = enabled ? "duck" : "off";
    });
    const removeAudioPlaybackMode = window.api?.onAudioPlaybackModeChanged(
      (mode) => {
        _audioPlaybackMode = normalizeAudioPlaybackMode(mode);
      },
    );
    return () => {
      removePillPos?.();
      removeOutputMode?.();
      removeAudioDucking?.();
      removeAudioPlaybackMode?.();
    };
  }, [applyPillPosition]);

  // ---- Hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      // hidePill() clears pillActiveRef before React re-renders idle state.
      if (!pillActiveRef.current) {
        stateRef.current = "idle";
      }
      const s = stateRef.current;
      if (s === "idle") {
        startRecording(false);
      } else if (s === "transcribing" && !wantsMicRef.current) {
        if (isTranscriptionIdle()) {
          hidePill();
          return;
        }
        // Resolve the pending stream promise so the previous transcription
        // does not hang for 30 s waiting for a result that will be dropped
        // by the generation counter on the server side. Start re-record
        // first so wantsMicRef is set before the empty resolve reaches
        // drainQueue.
        void startRecording(true);
        const resolver = streamResolverRef.current;
        if (resolver) {
          streamResolverRef.current = null;
          resolver({ raw: "", cleaned: "" });
        }
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
    hidePill,
    isTranscriptionIdle,
  ]);

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
  const badge =
    state === "recording"
      ? formatTimer(elapsed)
      : state === "transcribing" && pendingCount > 0
        ? `x${pendingCount}`
        : null;

  return (
    <VoicePill
      state={state}
      stream={pillStream}
      badge={badge}
      align={pillAlign}
      side={pillSide}
      onVolume={handlePillVolume}
    />
  );
}
