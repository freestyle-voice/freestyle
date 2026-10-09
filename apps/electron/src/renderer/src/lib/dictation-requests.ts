/** Owns requests for one pill session, including its re-recorded segments. */
export class DictationRequests {
  private epoch = 0;
  private controllers = new Set<AbortController>();

  current(): number {
    return this.epoch;
  }
  isCurrent(epoch: number): boolean {
    return this.epoch === epoch;
  }

  cancel(): void {
    this.epoch++;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }

  async run<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.controllers.add(controller);
    // Providers keep their 120-second budgets. The renderer also bounds a hung
    // transport, while retaining the WAV for an explicit user Retry.
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(130_000),
    ]);
    try {
      return await request(signal);
    } finally {
      this.controllers.delete(controller);
    }
  }
}
