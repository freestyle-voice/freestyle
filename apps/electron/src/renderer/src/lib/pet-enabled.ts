export function createPetEnabledStateSync(
  setEnabled: (enabled: boolean) => void,
): {
  onInitial: (enabled: boolean) => void;
  onChanged: (enabled: boolean) => void;
} {
  let receivedUpdate = false;

  return {
    onInitial: (enabled) => {
      if (!receivedUpdate) setEnabled(enabled);
    },
    onChanged: (enabled) => {
      receivedUpdate = true;
      setEnabled(enabled);
    },
  };
}
