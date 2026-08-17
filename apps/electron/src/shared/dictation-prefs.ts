export interface DictationPrefs {
  destination: "cursor" | "composer";
  outputMode: "paste" | "clipboard";
  soundEnabled: boolean;
  audioPlaybackMode: "off" | "duck" | "pause";
  micDeviceId: string | null;
}
