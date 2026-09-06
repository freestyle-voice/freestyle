export function createPetEnabledStateSync(
  setEnabled: (enabled: boolean) => void,
): {
  onInitial: (enabled: boolean) => void;
  onChanged: (enabled: boolean) => void;
  dispose: () => void;
} {
  let receivedUpdate = false;
  let disposed = false;

  return {
    onInitial: (enabled) => {
      if (!disposed && !receivedUpdate) setEnabled(enabled);
    },
    onChanged: (enabled) => {
      if (disposed) return;
      receivedUpdate = true;
      setEnabled(enabled);
    },
    dispose: () => {
      disposed = true;
    },
  };
}
