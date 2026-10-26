export type SettingSaveState = {
  phase: "saving" | "saved" | "error";
  retry?: () => Promise<boolean>;
};
export type SettingSaveStates = Record<string, SettingSaveState>;

// Writes outlive the page that started them. Share tails across page mounts so
// an older request cannot overwrite a choice made after navigating back.
const tails = new Map<string, Promise<boolean>>();
const pendingCounts = new Map<string, number>();

/** Serialize writes per control: a slow old choice must never win on the server. */
export function createSettingSaveQueue(
  onChange: (states: SettingSaveStates) => void,
) {
  let states: SettingSaveStates = {};
  const versions = new Map<string, number>();

  function update(key: string, state: SettingSaveState) {
    states = { ...states, [key]: state };
    onChange(states);
  }

  function save(key: string, write: () => Promise<void>): Promise<boolean> {
    const version = (versions.get(key) ?? 0) + 1;
    versions.set(key, version);
    pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
    update(key, { phase: "saving" });
    const pending = (tails.get(key) ?? Promise.resolve(true))
      .then(async () => {
        try {
          await write();
          if (versions.get(key) === version) update(key, { phase: "saved" });
          return true;
        } catch {
          if (versions.get(key) === version) {
            update(key, { phase: "error", retry: () => save(key, write) });
          }
          return false;
        }
      })
      .finally(() => {
        const count = (pendingCounts.get(key) ?? 1) - 1;
        if (count > 0) pendingCounts.set(key, count);
        else pendingCounts.delete(key);
      });
    tails.set(key, pending);
    return pending;
  }

  return {
    save,
    isPending: (key: string) => (pendingCounts.get(key) ?? 0) > 0,
  };
}
