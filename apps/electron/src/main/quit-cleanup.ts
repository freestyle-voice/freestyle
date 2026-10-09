/** Bound quit even when a plugin has stalled startup before a server handle exists. */
export async function boundedQuitCleanup(
  cleanup: Promise<void>,
  timeoutMs = 25_000,
): Promise<void> {
  let deadline: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      cleanup,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("App shutdown timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}
