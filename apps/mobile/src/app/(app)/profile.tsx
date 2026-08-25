import {
  INDUSTRY_LABELS,
  type Industry,
  industrySchema,
  type ProfileInput,
} from "@freestyle-voice/validations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  LogOut,
  PlugZap,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppleIcon, GitHubIcon, GoogleIcon } from "@/components/provider-icons";
import {
  Card,
  SettingsGroup,
  SettingsNavRow,
  SettingsScreenScaffold,
  SettingsValueRow,
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
      <View style={styles.accountHero}>
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
      </View>

      <SettingsGroup title="Account">
        <SettingsValueRow
          label="Name"
          value={user?.name ?? "Not set"}
          onPress={() => setNameEditorOpen(true)}
        />
        <SettingsValueRow
          label="Email"
          value={user?.email ?? "Not available"}
          valueMaxWidth="68%"
          last
        />
      </SettingsGroup>

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
          icon={ShieldCheck}
          label="Action approvals"
          value="Confirm connected-app changes"
          // Expo's generated route declarations refresh when Metro starts; keep
          // this new nested settings route usable in a clean typecheck too.
          onPress={() => router.push("/(app)/settings/approvals" as never)}
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

const CUSTOM_JOB_TITLE_VALUE = "__custom_job_title__";
const JOB_TITLE_OPTIONS = [
  "Founder",
  "Product Manager",
  "Software Engineer",
  "Designer",
  "Marketing Manager",
  "Sales Manager",
  "Operations Manager",
  "Consultant",
  "Researcher",
  "Teacher",
  "Student",
  "Financial Analyst",
  "Healthcare Professional",
  "Attorney",
] as const;
const INDUSTRY_WHEEL_OPTIONS = [
  { value: "", label: "Not set" },
  ...industrySchema.options.map((value) => ({
    value,
    label: INDUSTRY_LABELS[value],
  })),
];

/** Keyboard-safe native sheet used for the small, focused account edits. */
function NameEditorSheet({
  visible,
  currentName,
  onClose,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
}) {
  return (
    <TextEditorSheet
      visible={visible}
      title="Edit name"
      value={currentName}
      placeholder="Your name"
      onClose={onClose}
      onSave={async (name) => {
        const { error } = await updateName(name);
        if (error) throw new Error(error);
      }}
    />
  );
}

function TextEditorSheet({
  visible,
  title,
  value,
  placeholder,
  allowEmpty = false,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  value: string;
  placeholder: string;
  allowEmpty?: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const trimmed = draft.trim();
  const canSave =
    !saving && trimmed !== value.trim() && (allowEmpty || trimmed.length > 0);
  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(trimmed);
      onClose();
    } catch (error) {
      Alert.alert(
        `Couldn't update ${title.toLowerCase()}`,
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [canSave, onClose, onSave, title, trimmed]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        // iOS form sheets already track the software keyboard. Let the
        // native presentation own that transition; Android still needs the
        // standard height adjustment for its full-screen modal fallback.
        enabled={Platform.OS !== "ios"}
        behavior="height"
        style={[styles.editorSheet, { backgroundColor: theme.background }]}
      >
        <View style={styles.editorNav}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cancel">
            <ThemedText
              style={[styles.editorNavAction, { color: theme.primary }]}
            >
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.editorTitle}>{title}</ThemedText>
          <Pressable
            onPress={() => void save()}
            disabled={!canSave}
            hitSlop={10}
            accessibilityLabel={`Save ${title.toLowerCase()}`}
          >
            {saving ? (
              <ActivityIndicator color={theme.primary} size="small" />
            ) : (
              <ThemedText
                style={[
                  styles.editorNavAction,
                  { color: canSave ? theme.primary : theme.mutedForeground },
                ]}
              >
                Save
              </ThemedText>
            )}
          </Pressable>
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={theme.mutedForeground}
          maxLength={120}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={[
            styles.editorInput,
            { backgroundColor: theme.secondary, color: theme.foreground },
          ]}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Small, focused account details instead of one large legacy profile form. */
function ProfileDetailsCard() {
  const queryClient = useQueryClient();
  const [industryPickerOpen, setIndustryPickerOpen] = useState(false);
  const [jobTitlePickerOpen, setJobTitlePickerOpen] = useState(false);
  const [editingField, setEditingField] = useState<
    "jobTitle" | "company" | null
  >(null);
  const { data: profile, isLoading } = useQuery({
    queryKey: ["cloud-profile-fields"],
    queryFn: getProfileFields,
    retry: 1,
  });
  const industry = industrySchema.safeParse(profile?.industry).success
    ? (profile?.industry as Industry)
    : undefined;

  const saveProfile = useCallback(
    async (input: ProfileInput) => {
      const updated = await updateProfileFields(input);
      queryClient.setQueryData(["cloud-profile-fields"], updated);
      if (input.industry && input.updatePreferences !== false) {
        void queryClient.invalidateQueries({ queryKey: ["cloud-preferences"] });
      }
    },
    [queryClient],
  );

  const selectIndustry = useCallback(
    (next?: Industry) => {
      setIndustryPickerOpen(false);
      if (next === industry) return;
      const update = (updatePreferences: boolean) => {
        void saveProfile({ industry: next ?? null, updatePreferences }).catch(
          (error) =>
            Alert.alert(
              "Couldn't update industry",
              error instanceof Error ? error.message : "Try again.",
            ),
        );
      };
      if (!next) {
        update(false);
        return;
      }
      Alert.alert(
        "Update writing defaults?",
        "You can also update your default tone and vocabulary for this industry.",
        [
          { text: "Keep current", onPress: () => update(false) },
          { text: "Update defaults", onPress: () => update(true) },
        ],
      );
    },
    [industry, saveProfile],
  );

  const selectJobTitle = useCallback(
    (next: string) => {
      setJobTitlePickerOpen(false);
      if (next === CUSTOM_JOB_TITLE_VALUE) {
        setEditingField("jobTitle");
        return;
      }
      const value = next || null;
      if (value === (profile?.jobTitle ?? null)) return;
      void saveProfile({ jobTitle: value }).catch((error) =>
        Alert.alert(
          "Couldn't update job title",
          error instanceof Error ? error.message : "Try again.",
        ),
      );
    },
    [profile?.jobTitle, saveProfile],
  );

  const jobTitle = profile?.jobTitle ?? "";
  const jobTitleOptions = useMemo(
    () => [
      { value: "", label: "Not set" },
      ...(jobTitle && !JOB_TITLE_OPTIONS.some((option) => option === jobTitle)
        ? [{ value: jobTitle, label: jobTitle }]
        : []),
      ...JOB_TITLE_OPTIONS.map((value) => ({ value, label: value })),
      { value: CUSTOM_JOB_TITLE_VALUE, label: "Custom title" },
    ],
    [jobTitle],
  );

  if (isLoading) {
    return (
      <SettingsGroup title="Work profile">
        <Skeleton width={180} height={20} />
      </SettingsGroup>
    );
  }

  const fieldValue = editingField ? (profile?.[editingField] ?? "") : "";
  const fieldTitle =
    editingField === "company" ? "Edit company" : "Edit job title";
  const fieldPlaceholder =
    editingField === "company" ? "e.g. Acme Inc." : "e.g. Product Manager";

  return (
    <>
      <SettingsGroup title="Work profile">
        <SettingsValueRow
          label="Industry"
          value={industry ? INDUSTRY_LABELS[industry] : "Not set"}
          onPress={() => setIndustryPickerOpen(true)}
        />
        <SettingsValueRow
          label="Job title"
          value={profile?.jobTitle || "Not set"}
          onPress={() => setJobTitlePickerOpen(true)}
        />
        <SettingsValueRow
          label="Company"
          value={profile?.company || "Not set"}
          onPress={() => setEditingField("company")}
          last
        />
      </SettingsGroup>
      <WheelPickerSheet
        visible={industryPickerOpen}
        title="Industry"
        options={INDUSTRY_WHEEL_OPTIONS}
        selectedValue={industry ?? ""}
        onSelect={(value) =>
          selectIndustry(value ? (value as Industry) : undefined)
        }
        onClose={() => setIndustryPickerOpen(false)}
      />
      <WheelPickerSheet
        visible={jobTitlePickerOpen}
        title="Job title"
        options={jobTitleOptions}
        selectedValue={jobTitle}
        onSelect={selectJobTitle}
        hint="Choose a common role, or add the title that fits you."
        onClose={() => setJobTitlePickerOpen(false)}
      />
      <TextEditorSheet
        visible={editingField !== null}
        title={fieldTitle}
        value={fieldValue}
        placeholder={fieldPlaceholder}
        allowEmpty
        onClose={() => setEditingField(null)}
        onSave={async (value) => {
          if (!editingField) return;
          await saveProfile({ [editingField]: value || null });
        }}
      />
    </>
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
            <SettingsValueRow
              key={id}
              icon={Icon}
              label={label}
              value={
                isConnected ? (isOnlyMethod ? "Primary" : "Connected") : "Add"
              }
              onPress={
                isOnlyMethod
                  ? undefined
                  : () => (isConnected ? onUnlink(id, label) : void onLink(id))
              }
              disabled={busy}
              last={index === PROVIDER_META.length - 1}
              trailing={
                linking === id || unlinking === id ? (
                  <ActivityIndicator color={theme.foreground} size="small" />
                ) : isOnlyMethod ? (
                  <Check color={theme.primary} size={18} />
                ) : undefined
              }
            />
          );
        })
      )}
    </SettingsGroup>
  );
}

/** A native-style workspace wheel, only visible when the person has a real choice. */
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
      const selected = orgs?.find((org) => org.id === organizationId);
      if (selected) {
        queryClient.setQueryData(["cloud-active-org"], selected);
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
    [activeOrg?.id, orgs, queryClient],
  );

  // A default personal organization is an implementation detail. Surface a
  // workspace switcher only when it gives the person a real choice.
  if (orgsLoading || activeLoading || !hasMultiple) return null;

  return (
    <SettingsGroup title="Workspace">
      <SettingsValueRow
        icon={Building2}
        label="Current workspace"
        value={activeOrg?.name ?? "Choose workspace"}
        onPress={() => setPickerOpen(true)}
        disabled={switching !== null}
        last
        trailing={
          switching ? (
            <ActivityIndicator color={theme.foreground} size="small" />
          ) : undefined
        }
      />
      <WorkspacePickerSheet
        visible={pickerOpen}
        organizations={orgs ?? []}
        selectedOrganizationId={activeOrg?.id}
        onSelect={(organizationId) => {
          setPickerOpen(false);
          void onSwitch(organizationId);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </SettingsGroup>
  );
}

type Organization = Awaited<ReturnType<typeof listOrganizations>>[number];
type WheelPickerOption = { value: string; label: string };
const WHEEL_ITEM_HEIGHT = 52;
const WHEEL_VISIBLE_ITEMS = 5;

/** Preserves the explicit workspace API while sharing the native wheel. */
function WorkspacePickerSheet({
  visible,
  organizations,
  selectedOrganizationId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  organizations: Organization[];
  selectedOrganizationId?: string;
  onSelect: (organizationId: string) => void;
  onClose: () => void;
}) {
  return (
    <WheelPickerSheet
      visible={visible}
      title="Workspace"
      options={organizations.map((organization) => ({
        value: organization.id,
        label: organization.name,
      }))}
      selectedValue={selectedOrganizationId}
      onSelect={onSelect}
      hint="Your profile, preferences, and plan follow this workspace."
      onClose={onClose}
    />
  );
}

/** A native-style wheel for deliberate single-value profile choices. */
function WheelPickerSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  hint,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: WheelPickerOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  hint?: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [pendingValue, setPendingValue] = useState(
    selectedValue ?? options[0]?.value ?? "",
  );
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === pendingValue),
  );

  useEffect(() => {
    if (!visible) return;
    const initialValue = selectedValue ?? options[0]?.value ?? "";
    setPendingValue(initialValue);
    const initialIndex = Math.max(
      0,
      options.findIndex((option) => option.value === initialValue),
    );
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: initialIndex * WHEEL_ITEM_HEIGHT,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [options, selectedValue, visible]);

  const settleAtOffset = useCallback(
    (offsetY: number) => {
      const index = Math.max(
        0,
        Math.min(options.length - 1, Math.round(offsetY / WHEEL_ITEM_HEIGHT)),
      );
      const next = options[index];
      if (next) setPendingValue(next.value);
    },
    [options],
  );

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleAtOffset(event.nativeEvent.contentOffset.y);
    },
    [settleAtOffset],
  );

  const selectOption = useCallback(
    (option: WheelPickerOption, index: number) => {
      setPendingValue(option.value);
      scrollRef.current?.scrollTo({
        y: index * WHEEL_ITEM_HEIGHT,
        animated: true,
      });
    },
    [],
  );

  const confirm = useCallback(() => {
    if (options.some((option) => option.value === pendingValue)) {
      onSelect(pendingValue);
    }
  }, [onSelect, options, pendingValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.wheelPickerOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title} picker`}
        />
        <View
          style={[
            styles.wheelPickerSheet,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardRing,
              paddingBottom: Math.max(insets.bottom, Spacing.five),
            },
          ]}
        >
          <View
            style={[
              styles.wheelPickerHandle,
              { backgroundColor: theme.border },
            ]}
          />
          <View style={styles.wheelPickerNav}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Cancel ${title} selection`}
            >
              <ThemedText
                style={[styles.wheelPickerAction, { color: theme.primary }]}
              >
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText style={styles.wheelPickerTitle}>{title}</ThemedText>
            <Pressable
              onPress={confirm}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Confirm ${title} selection`}
            >
              <ThemedText
                style={[styles.wheelPickerAction, { color: theme.primary }]}
              >
                Done
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.wheel}>
            <View
              pointerEvents="none"
              style={[
                styles.wheelSelection,
                { backgroundColor: theme.secondary, borderColor: theme.border },
              ]}
            />
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={WHEEL_ITEM_HEIGHT}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              onMomentumScrollEnd={onScrollEnd}
              onScrollEndDrag={onScrollEnd}
              contentContainerStyle={styles.wheelContent}
            >
              {options.map((option, index) => {
                const selected = index === selectedIndex;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => selectOption(option, index)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    style={styles.wheelRow}
                  >
                    <ThemedText
                      numberOfLines={1}
                      style={[
                        styles.wheelLabel,
                        {
                          color: selected
                            ? theme.foreground
                            : theme.mutedForeground,
                        },
                        !selected && styles.wheelLabelMuted,
                      ]}
                    >
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          {hint ? (
            <ThemedText
              themeColor="mutedForeground"
              style={styles.wheelPickerHint}
            >
              {hint}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  accountHero: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
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
  editorSheet: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  editorNav: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  editorNavAction: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  editorInput: {
    minHeight: 52,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans,
    fontSize: 16,
    marginTop: Spacing.three,
  },
  wheelPickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.44)",
  },
  wheelPickerSheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius["2xl"],
    borderTopRightRadius: Radius["2xl"],
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
  },
  wheelPickerHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.two,
  },
  wheelPickerNav: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wheelPickerTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  wheelPickerAction: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  wheel: {
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS,
    marginTop: Spacing.two,
    overflow: "hidden",
  },
  wheelSelection: {
    position: "absolute",
    top: WHEEL_ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  wheelContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT * 2,
  },
  wheelRow: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  wheelLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 17,
    lineHeight: 22,
    textAlign: "center",
  },
  wheelLabelMuted: { opacity: 0.42, transform: [{ scale: 0.92 }] },
  wheelPickerHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
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
