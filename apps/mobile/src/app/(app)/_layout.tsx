import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/hooks/use-auth";

export default function AppLayout() {
  const { token, loading } = useAuth();

  // The root index shows the spinner during restore; once resolved, bounce
  // unauthenticated users back to sign-in.
  if (!loading && !token) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
