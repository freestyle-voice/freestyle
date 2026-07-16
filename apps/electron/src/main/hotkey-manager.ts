import type { HotkeyBindingKind } from "../shared/hotkey-bindings";
import { acceleratorsEqual } from "../shared/hotkey-utils";

export interface HotkeyBindings {
  hold: string;
  toggle: string | null;
}

export interface ManagedHotkeyListener {
  start(): Promise<boolean>;
  stop(): void;
  readonly isRunning: boolean;
}

export interface ManagedHotkeyListenerOptions {
  binding: HotkeyBindingKind;
  accelerator: string;
  onKeyDown: () => void;
  onKeyUp: () => void;
  onError?: (error: string) => void;
  onReady?: () => void;
  onPermanentFailure?: () => void;
}

export interface HotkeyManagerDependencies {
  createListener: (
    options: ManagedHotkeyListenerOptions,
  ) => ManagedHotkeyListener;
  registerFallback: (
    accelerator: string,
    callback: () => void,
  ) => string | null;
  unregisterFallback: (accelerator: string) => void;
  sendHotkeyDown: () => void;
  sendHotkeyUp: () => void;
  surfaceHoldUnavailableError: (accelerator: string, error?: string) => void;
  surfaceToggleUnavailableError?: (accelerator: string, error?: string) => void;
  onNativeListenerReady?: (
    binding: HotkeyBindingKind,
    accelerator: string,
  ) => void;
  log?: (message: string) => void;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export interface HotkeyBindingState {
  accelerator: string | null;
  listener: ManagedHotkeyListener | null;
  fallbackAccelerator: string | null;
}

export interface HotkeyManagerState {
  bindings: Record<HotkeyBindingKind, HotkeyBindingState>;
  generation: number;
  paused: boolean;
  destroyed: boolean;
  recording: {
    active: boolean;
    holdKeyDown: boolean;
    startedBy: HotkeyBindingKind | null;
  };
}

const HOTKEY_STUCK_TIMEOUT_MS = 5 * 60 * 1000;

function createEmptyBindingState(): HotkeyBindingState {
  return {
    accelerator: null,
    listener: null,
    fallbackAccelerator: null,
  };
}

function createInitialState(): HotkeyManagerState {
  return {
    bindings: {
      hold: createEmptyBindingState(),
      toggle: createEmptyBindingState(),
    },
    generation: 0,
    paused: false,
    destroyed: false,
    recording: {
      active: false,
      holdKeyDown: false,
      startedBy: null,
    },
  };
}

export class HotkeyManager {
  private readonly state = createInitialState();
  private watchdogTimer: unknown = null;
  private holdUnavailableReportedGeneration: number | null = null;

  constructor(readonly dependencies: HotkeyManagerDependencies) {}

  getState(): HotkeyManagerState {
    return {
      bindings: {
        hold: { ...this.state.bindings.hold },
        toggle: { ...this.state.bindings.toggle },
      },
      generation: this.state.generation,
      paused: this.state.paused,
      destroyed: this.state.destroyed,
      recording: { ...this.state.recording },
    };
  }

  getDesiredBindings(): HotkeyBindings | null {
    const hold = this.state.bindings.hold.accelerator;
    if (!hold) return null;
    return { hold, toggle: this.state.bindings.toggle.accelerator };
  }

  async registerBindings(desired: HotkeyBindings): Promise<void> {
    if (this.state.destroyed) return;

    const requestedToggle = desired.toggle?.trim() ? desired.toggle : null;
    const toggle =
      requestedToggle && acceleratorsEqual(desired.hold, requestedToggle)
        ? null
        : requestedToggle;
    if (requestedToggle && !toggle) {
      this.dependencies.log?.(
        `Rejected toggle hotkey "${requestedToggle}" because it matches the hold hotkey.`,
      );
    }

    const generation = ++this.state.generation;
    this.holdUnavailableReportedGeneration = null;
    this.teardownRegistration();
    this.stopSharedRecording();
    this.state.recording.holdKeyDown = false;
    this.state.paused = false;
    this.state.bindings.hold.accelerator = desired.hold;
    this.state.bindings.toggle.accelerator = toggle;

    const holdStart = this.createAndStartListener(
      "hold",
      desired.hold,
      generation,
    );
    const toggleStart = toggle
      ? this.createAndStartListener("toggle", toggle, generation)
      : Promise.resolve();

    await Promise.all([holdStart, toggleStart]);
  }

  pause(): void {
    if (this.state.destroyed || this.state.paused) return;
    ++this.state.generation;
    this.teardownRegistration();
    this.stopSharedRecording();
    this.state.recording.holdKeyDown = false;
    this.state.paused = true;
  }

  async resume(): Promise<void> {
    if (this.state.destroyed || !this.state.paused) return;
    const desired = this.getDesiredBindings();
    if (!desired) {
      this.state.paused = false;
      return;
    }
    await this.registerBindings(desired);
  }

  acknowledgeRecordingEnded(): void {
    this.clearWatchdog();
    this.state.recording.active = false;
    this.state.recording.holdKeyDown = false;
    this.state.recording.startedBy = null;
  }

  stop(): void {
    if (this.state.destroyed) return;
    this.state.destroyed = true;
    ++this.state.generation;
    this.teardownRegistration();
    this.stopSharedRecording();
    this.state.recording.holdKeyDown = false;
    this.state.paused = false;
  }

  private async createAndStartListener(
    binding: HotkeyBindingKind,
    accelerator: string,
    generation: number,
  ): Promise<void> {
    let nativeError = "";
    let listener: ManagedHotkeyListener;
    listener = this.dependencies.createListener({
      binding,
      accelerator,
      onKeyDown: () => {
        if (!this.isCurrentListener(binding, listener, generation)) return;
        if (binding === "hold") this.handleHoldDown();
        else this.handleToggleDown();
      },
      onKeyUp: () => {
        if (!this.isCurrentListener(binding, listener, generation)) return;
        if (binding === "hold") this.handleHoldUp();
      },
      onError: (error) => {
        nativeError = error;
        this.dependencies.log?.(
          `Native ${binding} hotkey listener error: ${error}`,
        );
      },
      onReady: () => {
        if (!this.isCurrentListener(binding, listener, generation)) return;
        this.dependencies.onNativeListenerReady?.(binding, accelerator);
      },
      onPermanentFailure: () => {
        this.handlePermanentFailure(
          binding,
          accelerator,
          listener,
          generation,
          nativeError,
        );
      },
    });
    this.state.bindings[binding].listener = listener;

    let started = false;
    try {
      started = await listener.start();
    } catch (error) {
      nativeError = error instanceof Error ? error.message : String(error);
    }

    if (!this.isCurrentListener(binding, listener, generation)) {
      listener.stop();
      return;
    }
    if (started) return;

    listener.stop();
    this.state.bindings[binding].listener = null;
    if (binding === "hold") {
      this.reportHoldUnavailable(accelerator, nativeError, generation);
      return;
    }
    this.installToggleFallback(accelerator, generation, nativeError);
  }

  private handlePermanentFailure(
    binding: HotkeyBindingKind,
    accelerator: string,
    listener: ManagedHotkeyListener,
    generation: number,
    error: string,
  ): void {
    if (!this.isCurrentListener(binding, listener, generation)) return;

    listener.stop();
    this.state.bindings[binding].listener = null;
    if (this.state.recording.startedBy === binding) {
      this.stopSharedRecording();
    }
    if (binding === "hold") {
      this.state.recording.holdKeyDown = false;
      this.reportHoldUnavailable(accelerator, error, generation);
      return;
    }
    this.installToggleFallback(accelerator, generation, error);
  }

  private installToggleFallback(
    accelerator: string,
    generation: number,
    error: string,
  ): void {
    if (!this.isCurrentGeneration(generation)) return;

    let registeredAccelerator: string | null = null;
    const callback = (): void => {
      if (
        !this.isCurrentGeneration(generation) ||
        this.state.bindings.toggle.fallbackAccelerator !== registeredAccelerator
      ) {
        return;
      }
      this.handleToggleDown();
    };
    registeredAccelerator = this.dependencies.registerFallback(
      accelerator,
      callback,
    );

    if (!this.isCurrentGeneration(generation)) {
      if (registeredAccelerator) {
        this.dependencies.unregisterFallback(registeredAccelerator);
      }
      return;
    }
    if (registeredAccelerator) {
      this.state.bindings.toggle.fallbackAccelerator = registeredAccelerator;
      return;
    }
    this.dependencies.surfaceToggleUnavailableError?.(accelerator, error);
  }

  private reportHoldUnavailable(
    accelerator: string,
    error: string,
    generation: number,
  ): void {
    if (
      !this.isCurrentGeneration(generation) ||
      this.holdUnavailableReportedGeneration === generation
    ) {
      return;
    }
    this.holdUnavailableReportedGeneration = generation;
    this.dependencies.surfaceHoldUnavailableError(
      accelerator,
      error || undefined,
    );
  }

  private handleHoldDown(): void {
    if (this.state.recording.holdKeyDown) return;
    this.state.recording.holdKeyDown = true;
    if (this.state.recording.active) return;
    this.startSharedRecording("hold");
    this.armWatchdog();
  }

  private handleHoldUp(): void {
    if (!this.state.recording.holdKeyDown) return;
    this.state.recording.holdKeyDown = false;
    this.clearWatchdog();
    this.stopSharedRecording();
  }

  private handleToggleDown(): void {
    if (this.state.recording.active) {
      this.stopSharedRecording();
    } else {
      this.startSharedRecording("toggle");
    }
  }

  private startSharedRecording(startedBy: HotkeyBindingKind): void {
    if (this.state.recording.active) return;
    this.state.recording.active = true;
    this.state.recording.startedBy = startedBy;
    this.dependencies.sendHotkeyDown();
  }

  private stopSharedRecording(): void {
    this.clearWatchdog();
    if (!this.state.recording.active) {
      this.state.recording.startedBy = null;
      return;
    }
    this.state.recording.active = false;
    this.state.recording.startedBy = null;
    this.dependencies.sendHotkeyUp();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    const setTimer = this.dependencies.setTimer ?? setTimeout;
    this.watchdogTimer = setTimer(() => {
      this.watchdogTimer = null;
      if (
        !this.state.recording.active ||
        !this.state.recording.holdKeyDown ||
        this.state.recording.startedBy !== "hold"
      ) {
        return;
      }
      this.dependencies.log?.(
        "Hold hotkey saw no key-up for 5 minutes; forcing release.",
      );
      this.state.recording.holdKeyDown = false;
      this.stopSharedRecording();
    }, HOTKEY_STUCK_TIMEOUT_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer === null) return;
    if (this.dependencies.clearTimer) {
      this.dependencies.clearTimer(this.watchdogTimer);
    } else {
      clearTimeout(this.watchdogTimer as ReturnType<typeof setTimeout>);
    }
    this.watchdogTimer = null;
  }

  private teardownRegistration(): void {
    for (const binding of ["hold", "toggle"] as const) {
      const state = this.state.bindings[binding];
      state.listener?.stop();
      state.listener = null;
      if (state.fallbackAccelerator) {
        this.dependencies.unregisterFallback(state.fallbackAccelerator);
        state.fallbackAccelerator = null;
      }
    }
  }

  private isCurrentListener(
    binding: HotkeyBindingKind,
    listener: ManagedHotkeyListener,
    generation: number,
  ): boolean {
    return (
      this.isCurrentGeneration(generation) &&
      this.state.bindings[binding].listener === listener
    );
  }

  private isCurrentGeneration(generation: number): boolean {
    return !this.state.destroyed && this.state.generation === generation;
  }
}
