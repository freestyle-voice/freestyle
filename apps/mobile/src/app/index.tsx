import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Image
          source={require("@/assets/images/freestyle-mark.png")}
          style={styles.mark}
          contentFit="contain"
        />

        <ThemedText type="eyebrow" themeColor="mutedForeground">
          Freestyle
        </ThemedText>

        <ThemedText type="display" style={styles.title}>
          <ThemedText type="displayItalic" themeColor="primary">
            hello
          </ThemedText>
          <ThemedText type="display">.</ThemedText>
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 20,
    marginBottom: Spacing.two,
  },
  title: {
    textAlign: "center",
  },
});
