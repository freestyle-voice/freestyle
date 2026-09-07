/**
 * Runs listener registration work one lifecycle at a time.
 *
 * A setting change can arrive while a native helper is still stopping or
 * starting. Coalescing those requests prevents two event-tap helpers from
 * racing each other, while preserving one final pass for the latest settings.
 */
export class SerializedRegistration {
  private running = false;
  private rerunRequested = false;
  private stopped = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  schedule(): void {
    if (this.stopped) return;
    this.rerunRequested = true;
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  shutdown(): void {
    this.stopped = true;
    this.rerunRequested = false;
  }

  get isActive(): boolean {
    return this.running || this.rerunRequested;
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.rerunRequested) {
      this.rerunRequested = false;
      try {
        await this.run();
      } catch (error) {
        this.onError(error);
      }
    }
    this.running = false;
  }
}
