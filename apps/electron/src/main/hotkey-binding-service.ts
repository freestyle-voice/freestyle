import type {
  HotkeyBindingError,
  HotkeyBindingKind,
  SetHotkeyBindingResult,
} from "../shared/hotkey-bindings";
import type { HotkeyBindings } from "./hotkey-manager";

interface HotkeyBindingServiceDependencies {
  readPersistedBinding: (kind: HotkeyBindingKind) => string | null;
  persistBinding: (kind: HotkeyBindingKind, accelerator: string | null) => void;
  registerBindings: (bindings: HotkeyBindings) => Promise<void>;
  resumeIfPaused: () => Promise<void>;
  defaultHold: string;
  validateAccelerator: (accelerator: string) => boolean;
  normalizeAccelerator: (accelerator: string) => string;
  acceleratorsEqual: (a: string, b: string) => boolean;
  logRecoveryFailure: (message: string, error: unknown) => void;
}

export class HotkeyBindingService {
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: HotkeyBindingServiceDependencies,
  ) {}

  setBinding(
    kind: unknown,
    accelerator: unknown,
  ): Promise<SetHotkeyBindingResult> {
    const operation = this.updateQueue.then(() =>
      this.applyBinding(kind, accelerator),
    );
    this.updateQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async applyBinding(
    kind: unknown,
    accelerator: unknown,
  ): Promise<SetHotkeyBindingResult> {
    if (kind !== "hold" && kind !== "toggle") {
      return this.failAndResume("invalid_kind");
    }

    const trimmed = typeof accelerator === "string" ? accelerator.trim() : "";
    if (kind === "hold" && !trimmed) {
      return this.failAndResume("hold_required");
    }
    if (
      kind === "toggle" &&
      (accelerator === null || (typeof accelerator === "string" && !trimmed))
    ) {
      accelerator = null;
    } else if (typeof accelerator !== "string") {
      return this.failAndResume("invalid_accelerator");
    }
    if (trimmed && !this.dependencies.validateAccelerator(trimmed)) {
      return this.failAndResume("invalid_accelerator");
    }

    let normalized: string | null = null;
    try {
      normalized = trimmed
        ? this.dependencies.normalizeAccelerator(trimmed)
        : null;
    } catch {
      return this.failAndResume("invalid_accelerator");
    }

    let previousPersisted: Record<HotkeyBindingKind, string | null>;
    try {
      previousPersisted = {
        hold: this.dependencies.readPersistedBinding("hold"),
        toggle: this.dependencies.readPersistedBinding("toggle"),
      };
    } catch (error) {
      this.dependencies.logRecoveryFailure(
        "Failed to load existing hotkey bindings",
        error,
      );
      return this.failAndResume("load_failed");
    }

    const previous: HotkeyBindings = {
      hold: this.normalizePersistedBinding("hold", previousPersisted.hold)!,
      toggle: this.normalizePersistedBinding(
        "toggle",
        previousPersisted.toggle,
      ),
    };

    const opposite = kind === "hold" ? previous.toggle : previous.hold;
    if (
      normalized &&
      opposite &&
      this.dependencies.acceleratorsEqual(normalized, opposite)
    ) {
      await this.resumeAfterRejectedUpdate();
      return {
        ok: false,
        conflictingKind: kind === "hold" ? "toggle" : "hold",
      };
    }

    const next: HotkeyBindings = {
      hold: kind === "hold" ? normalized! : previous.hold,
      toggle: kind === "toggle" ? normalized : previous.toggle,
    };

    try {
      this.dependencies.persistBinding(kind, normalized);
      await this.dependencies.registerBindings(next);
      return { ok: true, accelerator: normalized };
    } catch (saveError) {
      const oldValue = previousPersisted[kind];
      try {
        this.dependencies.persistBinding(kind, oldValue);
      } catch (rollbackError) {
        this.dependencies.logRecoveryFailure(
          "Failed to roll back persisted hotkey binding",
          rollbackError,
        );
      }
      try {
        await this.dependencies.registerBindings(previous);
      } catch (rollbackError) {
        this.dependencies.logRecoveryFailure(
          "Failed to restore runtime hotkey bindings",
          rollbackError,
        );
      }
      this.dependencies.logRecoveryFailure(
        "Failed to save hotkey binding",
        saveError,
      );
      return { ok: false, error: "save_failed" };
    }
  }

  private normalizePersistedBinding(
    kind: HotkeyBindingKind,
    accelerator: string | null,
  ): string | null {
    if (accelerator && this.dependencies.validateAccelerator(accelerator)) {
      return this.dependencies.normalizeAccelerator(accelerator);
    }
    return kind === "hold" ? this.dependencies.defaultHold : null;
  }

  private async failAndResume(
    error: HotkeyBindingError,
  ): Promise<SetHotkeyBindingResult> {
    await this.resumeAfterRejectedUpdate();
    return { ok: false, error };
  }

  private async resumeAfterRejectedUpdate(): Promise<void> {
    try {
      await this.dependencies.resumeIfPaused();
    } catch (resumeError) {
      this.dependencies.logRecoveryFailure(
        "Failed to resume hotkeys after rejected binding update",
        resumeError,
      );
    }
  }
}
