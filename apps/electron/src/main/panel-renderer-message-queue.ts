export type PanelDictationEvent = {
  kind: "partial" | "final" | "error";
  text: string;
};

export type PanelRendererMessage =
  | { channel: "panel:focus-composer" }
  | { channel: "panel:dictation"; payload: PanelDictationEvent }
  | { channel: "panel:open-thread"; payload: string };

/**
 * Holds panel messages until React has registered its IPC listeners. Electron's
 * `did-finish-load` fires before those effects run, so it is not a renderer
 * readiness signal.
 */
export class PanelRendererMessageQueue {
  private ready = false;
  private initialNavigation = true;
  private focusComposerPending = false;
  private pendingDictation: PanelRendererMessage | null = null;
  private pendingOpenThread: PanelRendererMessage | null = null;

  constructor(
    private readonly deliver: (message: PanelRendererMessage) => void,
  ) {}

  send(message: PanelRendererMessage): void {
    if (this.ready) {
      this.deliver(message);
      return;
    }
    if (message.channel === "panel:focus-composer") {
      this.focusComposerPending = true;
      return;
    }
    if (message.channel === "panel:open-thread") {
      this.pendingOpenThread = message;
      return;
    }
    // The final transcript supersedes every prior partial. Retaining only the
    // newest event avoids unbounded buffering if a renderer fails to mount.
    this.pendingDictation = message;
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    if (this.focusComposerPending)
      this.deliver({ channel: "panel:focus-composer" });
    if (this.pendingDictation) this.deliver(this.pendingDictation);
    if (this.pendingOpenThread) this.deliver(this.pendingOpenThread);
    this.focusComposerPending = false;
    this.pendingDictation = null;
    this.pendingOpenThread = null;
  }

  handleNavigationStart(): void {
    if (this.initialNavigation) {
      this.initialNavigation = false;
      return;
    }
    this.clear();
  }

  reset(): void {
    this.initialNavigation = true;
    this.clear();
  }

  private clear(): void {
    this.ready = false;
    this.focusComposerPending = false;
    this.pendingDictation = null;
    this.pendingOpenThread = null;
  }
}
