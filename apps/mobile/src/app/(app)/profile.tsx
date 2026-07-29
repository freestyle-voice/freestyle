import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Building2, Check, LogOut, Sparkles } from "lucide-react-native";
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
  getActiveOrganization,
  listOrganizations,
  setActiveOrganization,
} from "@/lib/cloud/org";
import {
  linkProvider,
  listLinkedProviders,
  type SocialProvider,
  unlinkProvider,
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

      {/* Organization */}
      {signedIn ? <OrganizationCard /> : null}

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
  const [unlinking, setUnlinking] = useState<SocialProvider | null>(null);

  const { data: linked, isLoading } = useQuery({
    queryKey: ["cloud-accounts"],
    queryFn: listLinkedProviders,
    retry: 1,
  });

  const connectedCount = linked?.length ?? 0;

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

  const onUnlink = useCallback(
    (provider: SocialProvider, label: string) => {
      Alert.alert(
        `Disconnect ${label}?`,
        `You'll no longer be able to sign in with ${label}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              setUnlinking(provider);
              const { error } = await unlinkProvider(provider);
              setUnlinking(null);
              if (error) {
                Alert.alert("Couldn't disconnect", error);
                return;
              }
              void queryClient.invalidateQueries({
                queryKey: ["cloud-accounts"],
              });
            },
          },
        ],
      );
    },
    [queryClient],
  );

  const busy = linking !== null || unlinking !== null;

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
          const isOnlyMethod = isConnected && connectedCount <= 1;
          return (
            <View
              key={id}
              style={[styles.providerRow, { borderColor: theme.border }]}
            >
              <Icon size={20} color={theme.foreground} />
              <ThemedText style={styles.providerLabel}>{label}</ThemedText>
              {isConnected ? (
                <Pressable
                  onPress={() => onUnlink(id, label)}
                  disabled={busy || isOnlyMethod}
                  style={({ pressed }) => [
                    styles.connectButton,
                    { borderColor: theme.border },
                    pressed && !busy && !isOnlyMethod
                      ? { backgroundColor: theme.secondary }
                      : null,
                    busy || isOnlyMethod ? styles.buttonDisabled : null,
                  ]}
                >
                  {unlinking === id ? (
                    <ActivityIndicator color={theme.foreground} size="small" />
                  ) : (
                    <ThemedText
                      style={[
                        styles.connectButtonText,
                        { color: theme.mutedForeground },
                      ]}
                    >
                      Disconnect
                    </ThemedText>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void onLink(id)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.connectButton,
                    { borderColor: theme.border },
                    pressed && !busy
                      ? { backgroundColor: theme.secondary }
                      : null,
                    busy ? styles.buttonDisabled : null,
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

/**
 * Active-organization card with an inline switcher. Every signed-in user has a
 * default org set active by the cloud, so the active row always shows; the
 * other orgs are only listed (tappable to switch) when the user belongs to
 * more than one.
 */
function OrganizationCard() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);

  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ["cloud-orgs"],
    queryFn: listOrganizations,
    retry: 1,
  });
  const { data: activeOrg, isLoading: activeLoading } = useQuery({
    queryKey: ["cloud-active-org"],
    queryFn: getActiveOrganization,
    retry: 1,
  });

  const onSwitch = useCallback(
    async (organizationId: string) => {
      if (organizationId === activeOrg?.id) return;
      setSwitching(organizationId);
      const { error } = await setActiveOrganization(organizationId);
      setSwitching(null);
      if (error) {
        Alert.alert("Couldn't switch organization", error);
        return;
      }
      // Plans are org-scoped on the cloud, so switching orgs can change the
      // plan — refresh both the active org and usage so the PLAN card updates.
      void queryClient.invalidateQueries({ queryKey: ["cloud-active-org"] });
      void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
    },
    [activeOrg?.id, queryClient],
  );

  // Nothing to show until we know the user belongs to at least one org.
  if (!orgsLoading && (orgs?.length ?? 0) === 0) return null;

  const hasMultiple = (orgs?.length ?? 0) > 1;

  return (
    <Card>
      <ThemedText type="eyebrow" themeColor="mutedForeground">
        ORGANIZATION
      </ThemedText>
      {orgsLoading || activeLoading ? (
        <Skeleton width={160} height={20} />
      ) : hasMultiple ? (
        orgs?.map((org) => {
          const isActive = org.id === activeOrg?.id;
          return (
            <Pressable
              key={org.id}
              onPress={() => void onSwitch(org.id)}
              disabled={switching !== null || isActive}
              style={[
                styles.orgRow,
                {
                  borderColor: isActive ? theme.primary : theme.border,
                  backgroundColor: isActive ? theme.accent : "transparent",
                },
              ]}
            >
              <Building2
                size={18}
                color={isActive ? theme.accentForeground : theme.foreground}
              />
              <ThemedText
                style={[
                  styles.orgName,
                  {
                    color: isActive ? theme.accentForeground : theme.foreground,
                  },
                ]}
                numberOfLines={1}
              >
                {org.name}
              </ThemedText>
              {switching === org.id ? (
                <ActivityIndicator
                  color={theme.foreground}
                  size="small"
                  style={styles.orgTrailing}
                />
              ) : isActive ? (
                <Check
                  size={18}
                  color={theme.accentForeground}
                  style={styles.orgTrailing}
                />
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <View style={[styles.orgRow, { borderColor: theme.border }]}>
          <Building2 size={18} color={theme.foreground} />
          <ThemedText style={styles.orgName} numberOfLines={1}>
            {activeOrg?.name ?? orgs?.[0]?.name ?? "—"}
          </ThemedText>
        </View>
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
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  orgName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 15 },
  orgTrailing: { marginLeft: "auto" },
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
