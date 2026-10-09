/** Native output is committed once dispatched, even if its cosmetic exit ends. */
export async function deliverDictation(options: {
  dispatch: () => Promise<unknown>;
  onDispatched: () => void;
  onDelivered: () => void;
}): Promise<void> {
  const delivery = options.dispatch();
  options.onDispatched();
  await delivery;
  options.onDelivered();
}
