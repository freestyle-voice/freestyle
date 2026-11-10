export type PanelRendererMessage = {
  channel: "dashboard:navigate";
  payload: "/settings" | "/settings/models" | "/today";
};

/**
 * Holds panel messages until React has registered its IPC listeners. Electron's
 * `did-finish-load` fires before those effects run, so it is not a renderer
 * readiness signal.
 */
export class PanelRendererMessageQueue {
  private ready = false;
  private initialNavigation = true;
  private pendingNavigation: PanelRendererMessage | null = null;

  constructor(
    private readonly deliver: (message: PanelRendererMessage) => void,
  ) {}

  send(message: PanelRendererMessage): void {
    if (this.ready) {
      this.deliver(message);
      return;
    }
    this.pendingNavigation = message;
  }

  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    if (this.pendingNavigation) this.deliver(this.pendingNavigation);
    this.pendingNavigation = null;
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
    this.pendingNavigation = null;
  }
}
