export type LocalWhisperRecoveryChoice = "cloud" | "models" | "dismissed";

export async function recoverFromLocalWhisperSetup({
  prompt,
  activateCloud,
  resume,
}: {
  prompt: () => Promise<LocalWhisperRecoveryChoice>;
  activateCloud: () => Promise<boolean>;
  resume: () => void;
}): Promise<boolean> {
  if ((await prompt()) !== "cloud") return false;
  if (!(await activateCloud())) return false;
  resume();
  return true;
}
