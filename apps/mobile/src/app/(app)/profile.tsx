import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Check, LogOut, Sparkles } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppleIcon, GitHubIcon, GoogleIcon } from "@/components/provider-icons";
import { Card, SettingsScreenScaffold } from "@/components/settings-ui";
import { Skeleton } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  linkProvider,
  listLinkedProviders,
  type SocialProvider,
  updateName,
} from "@/lib/cloud/profile";
import { openBillingPortal, startProCheckout } from "@/lib/cloud/subscription";
import { fetchCloudUsage } from "@/lib/cloud/usage";
import { formatNumber } from "@/lib/format";
import { initialsFor } from "@/lib/initials";

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signedIn, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: fetchCloudUsage,
    enabled: signedIn,
    retry: 1,
  });

  const refreshUsage = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
  }, [queryClient]);

  const onUpgrade = useCallback(async () => {
    setBusy(true);
    try {
      await startProCheckout(false); // monthly for beta; annual toggle optional later
      refreshUsage();
    } catch (e) {
      Alert.alert(
        "Checkout unavailable",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [refreshUsage]);

  const onManage = useCallback(async () => {
    setBusy(true);
    try {
      await openBillingPortal();
      refreshUsage();
    } catch (e) {
      Alert.alert(
        "Portal unavailable",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [refreshUsage]);

  const percent =
    usage && usage.limit > 0
      ? Math.round(((usage.limit - usage.remaining) / usage.limit) * 100)
      : 0;
  const resetsAtLabel = usage
    ? new Date(usage.resetsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <SettingsScreenScaffold title="Profile">
      {/* Account */}
      <Card>
        <View style={styles.accountHeader}>
          {user?.image ? (
            <Image
              source={{ uri: user.image }}
              style={styles.avatarImage}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
              <ThemedText
                style={[styles.avatarText, { color: theme.accentForeground }]}
              >
                {user ? initialsFor(user) : "?"}
              </ThemedText>
            </View>
          )}
          <View style={styles.accountInfo}>
            <ThemedText style={styles.accountName} numberOfLines={1}>
              {user?.name ?? "Signed in"}
            </ThemedText>
            {user?.email ? (
              <ThemedText
                themeColor="mutedForeground"
                style={styles.accountEmail}
                numberOfLines={1}
              >
                {user.email}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Personal information */}
      {signedIn ? <NameCard currentName={user?.name ?? ""} /> : null}

      {/* Connected accounts */}
      {signedIn ? <ConnectedAccountsCard /> : null}

      {/* Plan */}
      <Card>
        <ThemedText type="eyebrow" themeColor="mutedForeground">
          PLAN
        </ThemedText>

        {usageLoading ? (
          <Skeleton width={120} height={28} />
        ) : usage?.unlimited ? (
          <>
            <ThemedText style={styles.planName}>Pro</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.planHint}>
              Unlimited dictation
            </ThemedText>
            <Pressable
              onPress={onManage}
              disabled={busy}
              style={({ pressed }) => [
                styles.outlineButton,
                { borderColor: theme.border },
                pressed && !busy ? { backgroundColor: theme.secondary } : null,
                busy ? styles.buttonDisabled : null,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.foreground} />
              ) : (
                <ThemedText style={styles.outlineButtonText}>
                  Manage subscription
                </ThemedText>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText style={styles.planName}>Free</ThemedText>

            <View
              style={[
                styles.progressTrack,
                { backgroundColor: theme.secondary },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${percent}%`, backgroundColor: theme.primary },
                ]}
              />
            </View>

            <View style={styles.inlineRow}>
              <ThemedText themeColor="mutedForeground" style={styles.rowLabel}>
                {usage
                  ? `${formatNumber(usage.remaining)} / ${formatNumber(usage.limit)} words left this week`
                  : "—"}
              </ThemedText>
              {usage ? (
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.rowValue}
                >
                  Resets {resetsAtLabel}
                </ThemedText>
              ) : null}
            </View>

            <Pressable
              onPress={onUpgrade}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.primary },
                pressed && !busy ? { opacity: 0.9 } : null,
                busy ? styles.buttonDisabled : null,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.primaryForeground} />
              ) : (
                <>
                  <Sparkles color={theme.primaryForeground} size={16} />
                  <ThemedText
                    style={[
                      styles.primaryButtonText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Upgrade to Pro
                  </ThemedText>
                </>
              )}
            </Pressable>
          </>
        )}
      </Card>

      {/* Sign out */}
      <Pressable
        onPress={() => {
          void signOut().then(() => router.replace("/sign-in"));
        }}
        style={({ pressed }) => [
          styles.signOutCard,
          {
            backgroundColor: pressed
              ? theme.destructiveTintPressed
              : theme.destructiveTint,
          },
        ]}
      >
        <LogOut color={theme.destructive} size={18} />
        <ThemedText style={[styles.signOutText, { color: theme.destructive }]}>
          Sign out
        </ThemedText>
      </Pressable>
    </SettingsScreenScaffold>
  );
}

const PROVIDER_META: {
  id: SocialProvider;
  label: string;
  Icon: typeof GitHubIcon;
}[] = [
  { id: "github", label: "GitHub", Icon: GitHubIcon },
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "apple", label: "Apple", Icon: AppleIcon },
];

/** Editable display-name card. */
function NameCard({ currentName }: { currentName: string }) {
  const theme = useTheme();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const trimmed = name.trim();
  const dirty = trimmed !== currentName.trim();
  const canSave = dirty && trimmed.length > 0 && !saving;

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setSaved(false);
    const { error } = await updateName(trimmed);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't update name", error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [canSave, trimmed]);

  return (
    <Card>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        NAME
      </ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={theme.mutedForeground}
        maxLength={120}
        returnKeyType="done"
        onSubmitEditing={() => void onSave()}
        style={[
          styles.input,
          { borderColor: theme.border, color: theme.foreground },
        ]}
      />
      <Pressable
        onPress={() => void onSave()}
        disabled={!canSave}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.primary },
          pressed && canSave ? { opacity: 0.9 } : null,
          !canSave ? styles.buttonDisabled : null,
        ]}
      >
        {saving ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <>
            {saved ? <Check color={theme.primaryForeground} size={16} /> : null}
            <ThemedText
              style={[
                styles.primaryButtonText,
                { color: theme.primaryForeground },
              ]}
            >
              {saved ? "Saved" : "Save changes"}
            </ThemedText>
          </>
        )}
      </Pressable>
    </Card>
  );
}

/** Social-account linking card. */
function ConnectedAccountsCard() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState<SocialProvider | null>(null);

  const { data: linked, isLoading } = useQuery({
    queryKey: ["cloud-accounts"],
    queryFn: listLinkedProviders,
    retry: 1,
  });

  const onLink = useCallback(
    async (provider: SocialProvider) => {
      setLinking(provider);
      const { error } = await linkProvider(provider);
      setLinking(null);
      if (error) {
        Alert.alert("Couldn't connect", error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["cloud-accounts"] });
    },
    [queryClient],
  );

  return (
    <Card>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        CONNECTED ACCOUNTS
      </ThemedText>
      {isLoading ? (
        <Skeleton width={160} height={20} />
      ) : (
        PROVIDER_META.map(({ id, label, Icon }) => {
          const isConnected = linked?.includes(id) ?? false;
          return (
            <View
              key={id}
              style={[styles.providerRow, { borderColor: theme.border }]}
            >
              <Icon size={20} color={theme.foreground} />
              <ThemedText style={styles.providerLabel}>{label}</ThemedText>
              {isConnected ? (
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.connectedLabel}
                >
                  Connected
                </ThemedText>
              ) : (
                <Pressable
                  onPress={() => void onLink(id)}
                  disabled={linking !== null}
                  style={({ pressed }) => [
                    styles.connectButton,
                    { borderColor: theme.border },
                    pressed && linking === null
                      ? { backgroundColor: theme.secondary }
                      : null,
                    linking !== null ? styles.buttonDisabled : null,
                  ]}
                >
                  {linking === id ? (
                    <ActivityIndicator color={theme.foreground} size="small" />
                  ) : (
                    <ThemedText style={styles.connectButtonText}>
                      Connect
                    </ThemedText>
                  )}
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  avatarText: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  accountInfo: { flex: 1 },
  accountName: { fontFamily: Fonts.serif, fontSize: 22, lineHeight: 24 },
  accountEmail: { fontSize: 13, marginTop: 3 },
  inlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontFamily: Fonts.sans, fontSize: 15 },
  rowValue: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  planName: { fontFamily: Fonts.serif, fontSize: 28, lineHeight: 30 },
  planHint: { fontSize: 14 },
  progressTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 48,
    borderRadius: Radius.full,
    marginTop: Spacing.one,
  },
  primaryButtonText: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginTop: Spacing.one,
  },
  outlineButtonText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontFamily: Fonts.sans,
    fontSize: 15,
    marginTop: Spacing.two,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  providerLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  connectedLabel: { marginLeft: "auto", fontSize: 14 },
  connectButton: {
    marginLeft: "auto",
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 84,
    alignItems: "center",
  },
  connectButtonText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  signOutCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    height: 52,
    borderRadius: Radius.xl,
    marginTop: Spacing.two,
  },
  signOutText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
});
