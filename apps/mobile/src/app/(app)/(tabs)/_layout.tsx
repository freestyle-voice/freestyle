import { Stack } from "expo-router";

/** The group is retained for its stable home route, but no longer renders tabs. */
export default function HomeLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
