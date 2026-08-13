import { Alert } from "react-native";

/** Shared destructive confirmation used by History and Settings. */
export function confirmClearHistory(clearHistory: () => void): void {
  Alert.alert(
    "Clear history?",
    "This permanently removes every saved dictation on this device.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Clear all", style: "destructive", onPress: clearHistory },
    ],
  );
}
