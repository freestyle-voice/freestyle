import {
  INDUSTRY_LABELS,
  type Industry,
  industrySchema,
} from "@freestyle-voice/validations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  LogOut,
  Pencil,
  PlugZap,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { AppleIcon, GitHubIcon, GoogleIcon } from "@/components/provider-icons";
import { SelectSheet } from "@/components/select-sheet";
import {
  Card,
  SettingsGroup,
  SettingsNavRow,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
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
  getProfileFields,
  linkProvider,
  listLinkedProviders,
  type SocialProvider,
  unlinkProvider,
  updateName,
  updateProfileFields,
} from "@/lib/cloud/profile";
import { openBillingPortal, startProCheckout } from "@/lib/cloud/subscription";
import { fetchCloudUsage } from "@/lib/cloud/usage";
import { formatNumber } from "@/lib/format";
import { initialsFor } from "@/lib/initials";

export default function ProfileScreen() {
  return <ProfileContent />;
}

export function ProfileContent() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signedIn, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: () => fetchCloudUsage(),
    enabled: signedIn,
    retry: 1,
  });

  // Refresh the cached usage/plan. Pass `fresh` after a checkout so the cloud
  // bypasses its plan cache and the upgrade is reflected immediately; a plain
  // refresh (e.g. on org switch) uses the cached path.
  const refreshUsage = useCallback(
    (opts: { fresh?: boolean } = {}) => {
      if (opts.fresh) {
        void queryClient
          .fetchQuery({
            queryKey: ["cloud-usage"],
            queryFn: () => fetchCloudUsage({ fresh: true }),
          })
          .catch(() => {});
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
    },
    [queryClient],
  );

  const onUpgrade = useCallback(async () => {
    setBusy(true);
    try {
      await startProCheckout(false); // monthly for beta; annual toggle optional later
      refreshUsage({ fresh: true });
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
      refreshUsage({ fresh: true });
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

  const content = (
    <>
      <Pressable
        onPress={() => setNameEditorOpen(true)}
        disabled={!signedIn}
        accessibilityRole="button"
        accessibilityLabel="Edit name"
        accessibilityState={{ disabled: !signedIn }}
        style={({ pressed }) => [
          styles.accountHero,
          pressed && signedIn && styles.accountHeroPressed,
        ]}
      >
        <View style={styles.avatarWrap}>
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
          {signedIn ? (
            <View
              style={[
                styles.nameEditBadge,
                { backgroundColor: theme.secondary },
              ]}
            >
              <Pencil color={theme.mutedForeground} size={14} />
            </View>
          ) : null}
        </View>
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
      </Pressable>

      <SettingsGroup>
        <SettingsNavRow
          icon={SlidersHorizontal}
          label="Dictation settings"
          value="Language, cleanup, and privacy"
          onPress={() => router.push("/(app)/settings")}
        />
        <SettingsNavRow
          icon={PlugZap}
          label="Connected apps & MCPs"
          value="Give Remix access to your tools"
          onPress={() => router.push("/(app)/connected-apps")}
        />
        <SettingsNavRow
          icon={CalendarClock}
          label="Automations"
          value="Scheduled work and briefs"
          onPress={() => router.push("/(app)/automations")}
        />
        <SettingsNavRow
          icon={Bell}
          label="Notifications"
          value="Updates from Remix"
          onPress={() => router.push("/(app)/notifications")}
          last
        />
      </SettingsGroup>

      {/* Professional details */}
      {signedIn ? <ProfileDetailsCard /> : null}

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

      <NameEditorSheet
        visible={nameEditorOpen}
        currentName={user?.name ?? ""}
        onClose={() => setNameEditorOpen(false)}
      />
    </>
  );

  return (
    <SettingsScreenScaffold title="Settings">{content}</SettingsScreenScaffold>
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

/** A small native sheet keeps editing out of the everyday account surface. */
function NameEditorSheet({
  visible,
  currentName,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
}) {
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
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 550);
  }, [canSave, onClose, trimmed]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.nameSheet, { backgroundColor: theme.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
        <View style={styles.nameSheetHeader}>
          <ThemedText style={styles.nameSheetTitle}>Edit name</ThemedText>
          <Pressable onPress={onClose} accessibilityLabel="Close name editor">
            <ThemedText
              style={[styles.nameSheetDone, { color: theme.primary }]}
            >
              Cancel
            </ThemedText>
          </Pressable>
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.mutedForeground}
          maxLength={120}
          autoFocus
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
              {saved ? (
                <Check color={theme.primaryForeground} size={16} />
              ) : null}
              <ThemedText
                style={[
                  styles.primaryButtonText,
                  { color: theme.primaryForeground },
                ]}
              >
                {saved ? "Saved" : "Save"}
              </ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

/** Professional details: industry, job title, company + detected location. */
function ProfileDetailsCard() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [industry, setIndustry] = useState<Industry | undefined>(undefined);
  const [industryPickerOpen, setIndustryPickerOpen] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  // Re-seed tone + vocabulary defaults for the new industry (opt-out). Only
  // surfaced while the industry is actually changing. Mirrors the dashboard.
  const [updatePreferences, setUpdatePreferences] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["cloud-profile-fields"],
    queryFn: getProfileFields,
    retry: 1,
  });

  useEffect(() => {
    if (!profile) return;
    const parsed = industrySchema.safeParse(profile.industry);
    setIndustry(parsed.success ? parsed.data : undefined);
    setJobTitle(profile.jobTitle ?? "");
    setCompany(profile.company ?? "");
    setUpdatePreferences(true);
  }, [profile]);

  const savedIndustry = industrySchema.safeParse(profile?.industry).success
    ? (profile?.industry as Industry)
    : undefined;
  // Show the re-seed toggle only when switching to a real industry (clearing it
  // never reseeds).
  const industryWillChange =
    industry !== savedIndustry && industry !== undefined;
  const dirty =
    industry !== savedIndustry ||
    jobTitle.trim() !== (profile?.jobTitle ?? "") ||
    company.trim() !== (profile?.company ?? "");
  const canSave = dirty && !saving;

  const onSave = useCallback(async (): Promise<boolean> => {
    if (!canSave) return false;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfileFields({
        // Send `null` (not `undefined`) to clear a field — `undefined` is
        // dropped by JSON serialization, which the server reads as "unchanged".
        industry: industry ?? null,
        jobTitle: jobTitle.trim() || null,
        company: company.trim() || null,
        // Only meaningful on an industry change; harmless otherwise.
        updatePreferences,
      });
      queryClient.setQueryData(["cloud-profile-fields"], updated);
      // The cloud re-seeds tone/vocabulary defaults into member_preferences on
      // ANY industry change (unless opted out). Invalidate the preferences query
      // so the seeded values are pulled in immediately.
      const industryChanged = (savedIndustry ?? null) !== (industry ?? null);
      if (industryChanged && industry && updatePreferences) {
        void queryClient.invalidateQueries({
          queryKey: ["cloud-preferences"],
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e) {
      Alert.alert(
        "Couldn't update profile",
        e instanceof Error ? e.message : "Try again.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    industry,
    savedIndustry,
    jobTitle,
    company,
    updatePreferences,
    queryClient,
  ]);

  if (isLoading) {
    return (
      <SettingsGroup title="Personalization">
        <Skeleton width={180} height={20} />
      </SettingsGroup>
    );
  }

  if (!editing) {
    return (
      <SettingsGroup title="Personalization">
        <SettingsNavRow
          icon={SlidersHorizontal}
          label="Work profile"
          value={
            industry
              ? INDUSTRY_LABELS[industry]
              : jobTitle || company
                ? "Details added"
                : "Optional"
          }
          onPress={() => setEditing(true)}
          last
        />
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup title="Work profile">
      <Pressable
        onPress={() => setIndustryPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose industry"
        accessibilityValue={{
          text: industry ? INDUSTRY_LABELS[industry] : "Not set",
        }}
        style={({ pressed }) => [
          styles.selectField,
          { borderColor: theme.border },
          pressed && { backgroundColor: theme.secondary },
        ]}
      >
        <ThemedText
          style={[
            styles.selectFieldLabel,
            !industry && { color: theme.mutedForeground },
          ]}
        >
          {industry ? INDUSTRY_LABELS[industry] : "Choose an industry"}
        </ThemedText>
        <ChevronDown color={theme.mutedForeground} size={18} />
      </Pressable>
      <SelectSheet
        visible={industryPickerOpen}
        title="Industry"
        options={industrySchema.options.map((value) => ({
          value,
          label: INDUSTRY_LABELS[value],
        }))}
        selectedValue={industry}
        onSelect={(value) => {
          setIndustry(value as Industry);
          setIndustryPickerOpen(false);
        }}
        onClear={() => {
          setIndustry(undefined);
          setIndustryPickerOpen(false);
        }}
        onClose={() => setIndustryPickerOpen(false)}
      />

      {industryWillChange ? (
        <View style={[styles.reseedRow, { borderColor: theme.border }]}>
          <ThemedText style={styles.reseedLabel}>
            Update tone and vocabulary to match the new industry's defaults
          </ThemedText>
          <Switch
            value={updatePreferences}
            onValueChange={setUpdatePreferences}
            trackColor={{ true: theme.primary, false: theme.secondary }}
          />
        </View>
      ) : null}

      <ThemedText
        type="eyebrow"
        themeColor="mutedForeground"
        style={styles.detailsLabel}
      >
        JOB TITLE
      </ThemedText>
      <TextInput
        value={jobTitle}
        onChangeText={setJobTitle}
        placeholder="e.g. Product Manager"
        placeholderTextColor={theme.mutedForeground}
        maxLength={120}
        style={[
          styles.input,
          { borderColor: theme.border, color: theme.foreground },
        ]}
      />

      <ThemedText
        type="eyebrow"
        themeColor="mutedForeground"
        style={styles.detailsLabel}
      >
        COMPANY
      </ThemedText>
      <TextInput
        value={company}
        onChangeText={setCompany}
        placeholder="e.g. Acme Inc."
        placeholderTextColor={theme.mutedForeground}
        maxLength={120}
        style={[
          styles.input,
          { borderColor: theme.border, color: theme.foreground },
        ]}
      />

      <Pressable
        onPress={() => {
          void onSave().then((didSave) => {
            if (didSave) setEditing(false);
          });
        }}
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
      <Pressable
        onPress={() => setEditing(false)}
        accessibilityRole="button"
        style={styles.cancelEditButton}
      >
        <ThemedText themeColor="mutedForeground" style={styles.cancelEditText}>
          Cancel
        </ThemedText>
      </Pressable>
    </SettingsGroup>
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
    <SettingsGroup title="Sign-in methods">
      {isLoading ? (
        <Skeleton width={160} height={20} />
      ) : (
        PROVIDER_META.map(({ id, label, Icon }, index) => {
          const isConnected = linked?.includes(id) ?? false;
          const isOnlyMethod = isConnected && connectedCount <= 1;
          return (
            <Pressable
              key={id}
              onPress={() =>
                isConnected ? onUnlink(id, label) : void onLink(id)
              }
              disabled={busy || isOnlyMethod}
              accessibilityRole="button"
              accessibilityLabel={
                isOnlyMethod
                  ? `${label} is your primary sign-in method`
                  : `${isConnected ? "Manage" : "Connect"} ${label}`
              }
              style={({ pressed }) => [
                styles.providerRow,
                index < PROVIDER_META.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
                pressed && !busy && !isOnlyMethod
                  ? styles.providerPressed
                  : null,
                (busy || isOnlyMethod) && styles.buttonDisabled,
              ]}
            >
              <Icon size={20} color={theme.foreground} />
              <View style={styles.providerContent}>
                <ThemedText style={styles.providerLabel}>{label}</ThemedText>
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.providerState}
                >
                  {isConnected
                    ? isOnlyMethod
                      ? "Primary sign-in"
                      : "Connected"
                    : "Not connected"}
                </ThemedText>
              </View>
              {linking === id || unlinking === id ? (
                <ActivityIndicator color={theme.foreground} size="small" />
              ) : isOnlyMethod ? (
                <Check color={theme.primary} size={18} />
              ) : (
                <ChevronRight color={theme.mutedForeground} size={18} />
              )}
            </Pressable>
          );
        })
      )}
    </SettingsGroup>
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ["cloud-orgs"],
    queryFn: listOrganizations,
    retry: 1,
  });
  const hasMultiple = (orgs?.length ?? 0) > 1;
  const { data: activeOrg, isLoading: activeLoading } = useQuery({
    queryKey: ["cloud-active-org"],
    queryFn: getActiveOrganization,
    enabled: hasMultiple,
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
      // Member preferences (cleanup tones/languages) and profile fields are
      // per-org — reload the new org's snapshot so the settings/profile screens
      // reflect the switch instead of the previous org's cached values.
      // Vocabulary reloads via the active-org change in `EntriesProvider`.
      void queryClient.invalidateQueries({ queryKey: ["cloud-preferences"] });
      void queryClient.invalidateQueries({
        queryKey: ["cloud-profile-fields"],
      });
    },
    [activeOrg?.id, queryClient],
  );

  // A default personal organization is an implementation detail. Surface a
  // workspace switcher only when it gives the person a real choice.
  if (orgsLoading || activeLoading || !hasMultiple) return null;

  return (
    <SettingsGroup title="Workspace">
      <Pressable
        onPress={() => setPickerOpen(true)}
        disabled={switching !== null}
        accessibilityRole="button"
        accessibilityLabel="Choose organization"
        accessibilityValue={{ text: activeOrg?.name ?? "Not set" }}
        style={({ pressed }) => [
          styles.orgRow,
          pressed && switching === null && styles.providerPressed,
        ]}
      >
        <Building2 size={20} color={theme.foreground} />
        <ThemedText style={styles.orgName} numberOfLines={1}>
          {activeOrg?.name ?? "Choose organization"}
        </ThemedText>
        {switching ? (
          <ActivityIndicator color={theme.foreground} size="small" />
        ) : (
          <ChevronRight color={theme.mutedForeground} size={18} />
        )}
      </Pressable>
      <SelectSheet
        visible={pickerOpen}
        title="Organization"
        options={(orgs ?? []).map((org) => ({
          value: org.id,
          label: org.name,
        }))}
        selectedValue={activeOrg?.id}
        onSelect={(organizationId) => {
          setPickerOpen(false);
          void onSwitch(organizationId);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </SettingsGroup>
  );
}

const styles = StyleSheet.create({
  accountHero: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  accountHeroPressed: { opacity: 0.7 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
  },
  avatarText: { fontFamily: Fonts.sansSemiBold, fontSize: 24 },
  nameEditBadge: {
    position: "absolute",
    right: -5,
    bottom: -4,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: { alignItems: "center" },
  accountName: { fontFamily: Fonts.sansSemiBold, fontSize: 22, lineHeight: 27 },
  accountEmail: { fontSize: 14, marginTop: 2 },
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
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  nameSheet: {
    marginTop: "auto",
    borderTopLeftRadius: Radius["2xl"],
    borderTopRightRadius: Radius["2xl"],
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: "center",
  },
  nameSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.three,
  },
  nameSheetTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 18 },
  nameSheetDone: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  selectField: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  selectFieldLabel: { flex: 1, fontFamily: Fonts.sans, fontSize: 15 },
  detailsLabel: { marginTop: Spacing.four },
  reseedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  reseedLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 60,
    paddingVertical: Spacing.two,
  },
  providerPressed: { opacity: 0.6 },
  providerContent: { flex: 1 },
  providerLabel: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  providerState: { fontSize: 13, marginTop: 1 },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 60,
    paddingVertical: Spacing.two,
  },
  orgName: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 15 },
  cancelEditButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelEditText: { fontFamily: Fonts.sansMedium, fontSize: 15 },
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
