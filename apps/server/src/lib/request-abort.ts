/** Combine cancellation with the provider's existing request budget. */
export function requestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/** Stops awaiting shared native work; its owner still finishes resource cleanup. */
export function abortable<T>(
  work: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new DOMException("Canceled", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
