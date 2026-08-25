import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowUpRight,
  Check,
  Link2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  Card,
  RetryLoadState,
  SectionTitle,
  SettingsGroup,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type ConnectorCatalogItem,
  type ConnectorConnection,
  connectToolkit,
  connectToolkitWithCredentials,
  disconnectToolkit,
  listConnectorCatalog,
  listConnectorConnections,
} from "@/lib/cloud/connectors";

export default function ConnectedAppsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [credentialsFor, setCredentialsFor] =
    useState<ConnectorCatalogItem | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<{ key: string } | null>(
    null,
  );

  const {
    data: connections = [],
    isLoading: connectionsLoading,
    isError: connectionsError,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["connector-connections"],
    queryFn: listConnectorConnections,
    retry: 1,
  });
  const {
    data: catalog,
    isLoading: catalogLoading,
    isError: catalogError,
    refetch: refetchCatalog,
  } = useQuery({
    queryKey: ["connector-catalog", search.trim()],
    queryFn: () => listConnectorCatalog({ search: search.trim() || undefined }),
    retry: 1,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["connector-connections"] });
    void queryClient.invalidateQueries({ queryKey: ["connector-catalog"] });
  };
  const connect = useMutation({
    mutationFn: async (item: ConnectorCatalogItem) => {
      if (item.authMode === "api_key") {
        setCredentialsFor(item);
        setCredentials({});
        return;
      }
      const url = await connectToolkit(item.slug);
      await WebBrowser.openAuthSessionAsync(url, "freestyle://connected-apps");
    },
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert(
        "Couldn't connect app",
        error instanceof Error ? error.message : "Try again.",
      ),
    onSettled: () => setPendingAction(null),
  });
  const disconnect = useMutation({
    mutationFn: disconnectToolkit,
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert(
        "Couldn't disconnect app",
        error instanceof Error ? error.message : "Try again.",
      ),
    onSettled: () => setPendingAction(null),
  });
  const reconnect = useMutation({
    mutationFn: async (connection: ConnectorConnection) => {
      const url = await connectToolkit(connection.toolkitSlug);
      await WebBrowser.openAuthSessionAsync(url, "freestyle://connected-apps");
    },
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert(
        "Couldn't reconnect app",
        error instanceof Error ? error.message : "Try again.",
      ),
    onSettled: () => setPendingAction(null),
  });
  const saveCredentials = useMutation({
    mutationFn: async () => {
      if (!credentialsFor) return;
      const missing = (credentialsFor.authFields ?? []).some(
        (field) => field.required && !credentials[field.name]?.trim(),
      );
      if (missing) throw new Error("Enter every required credential.");
      await connectToolkitWithCredentials(credentialsFor.slug, credentials);
    },
    onSuccess: () => {
      setCredentialsFor(null);
      setCredentials({});
      invalidate();
    },
    onError: (error) =>
      Alert.alert(
        "Couldn't connect app",
        error instanceof Error ? error.message : "Try again.",
      ),
  });

  const activeConnections = useMemo(
    () => connections.filter((connection) => connection.status === "active"),
    [connections],
  );
  const attentionConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.status !== "active" &&
          connection.status !== "disconnected",
      ),
    [connections],
  );
  const catalogItems = useMemo(
    () =>
      (catalog?.connectors ?? []).filter(
        (item) =>
          item.connection == null || item.connection.status === "disconnected",
      ),
    [catalog],
  );
  const disconnectConnection = useCallback(
    (connection: ConnectorConnection) => {
      if (pendingAction) return;
      setPendingAction({ key: `connection:${connection.id}` });
      disconnect.mutate(connection.toolkitSlug);
    },
    [disconnect, pendingAction],
  );
  const showConnectionMenu = useCallback(
    (connection: ConnectorConnection) => {
      if (pendingAction) return;
      const onDisconnect = () => disconnectConnection(connection);
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Disconnect"],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 1,
            title: connection.toolkitName,
          },
          (selectedIndex) => {
            if (selectedIndex === 1) onDisconnect();
          },
        );
        return;
      }
      Alert.alert(connection.toolkitName, undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: onDisconnect },
      ]);
    },
    [disconnectConnection, pendingAction],
  );

  return (
    <SettingsScreenScaffold
      title="Connected apps"
      subtitle="Apps Remix can use when you ask it to help."
    >
      {connectionsLoading ? (
        <SettingsGroup title="Connected">
          <Loading />
        </SettingsGroup>
      ) : connectionsError && connections.length === 0 ? (
        <SettingsGroup title="Connected">
          <RetryLoadState
            message="Couldn't load your connected apps. Check your connection and try again."
            onRetry={() => void refetchConnections()}
          />
        </SettingsGroup>
      ) : activeConnections.length > 0 ? (
        <SettingsGroup title="Connected">
          {activeConnections.map((connection, index) => (
            <ConnectedConnectorRow
              key={connection.id}
              name={connection.toolkitName}
              logo={connection.toolkitLogo}
              last={index === activeConnections.length - 1}
              actionBusy={pendingAction?.key === `connection:${connection.id}`}
              actionDisabled={pendingAction !== null}
              onManage={() => showConnectionMenu(connection)}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {attentionConnections.length > 0 ? (
        <SettingsGroup title="Needs attention">
          {attentionConnections.map((connection, index) => (
            <AttentionConnectorRow
              key={connection.id}
              name={connection.toolkitName}
              logo={connection.toolkitLogo}
              status={connection.status}
              last={index === attentionConnections.length - 1}
              actionBusy={pendingAction?.key === `connection:${connection.id}`}
              actionDisabled={pendingAction !== null}
              onPress={() => {
                if (pendingAction) return;
                setPendingAction({ key: `connection:${connection.id}` });
                reconnect.mutate(connection);
              }}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <View
        style={[
          styles.search,
          { borderColor: theme.border, backgroundColor: theme.card },
        ]}
      >
        <Search color={theme.mutedForeground} size={16} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Find an app to connect"
          placeholderTextColor={theme.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: theme.foreground }]}
        />
      </View>

      <SettingsGroup title={search.trim() ? "Results" : "Apps"}>
        {catalogLoading ? (
          <Loading />
        ) : catalogError && catalogItems.length === 0 ? (
          <RetryLoadState
            message="Couldn't load available apps. Check your connection and try again."
            onRetry={() => void refetchCatalog()}
          />
        ) : catalogItems.length === 0 ? (
          <ThemedText themeColor="mutedForeground" style={styles.empty}>
            No matching apps found.
          </ThemedText>
        ) : (
          catalogItems.map((item, index) => (
            <AvailableConnectorRow
              key={item.slug}
              name={item.name}
              logo={item.logo}
              last={index === catalogItems.length - 1}
              actionBusy={pendingAction?.key === `catalog:${item.slug}`}
              actionDisabled={pendingAction !== null}
              onPress={() => {
                if (pendingAction) return;
                setPendingAction({ key: `catalog:${item.slug}` });
                connect.mutate(item);
              }}
            />
          ))
        )}
      </SettingsGroup>

      {credentialsFor ? (
        <Card>
          <SectionTitle icon={Link2} title={`Connect ${credentialsFor.name}`} />
          <ThemedText themeColor="mutedForeground" style={styles.empty}>
            Your credentials are sent directly to this app's connection service
            and are never saved on this device.
          </ThemedText>
          {(credentialsFor.authFields ?? []).map((field) => (
            <View key={field.name} style={styles.field}>
              <ThemedText style={styles.fieldLabel}>
                {field.displayName}
                {field.required ? " *" : ""}
              </ThemedText>
              {field.description ? (
                <ThemedText themeColor="mutedForeground" style={styles.meta}>
                  {field.description}
                </ThemedText>
              ) : null}
              <TextInput
                value={credentials[field.name] ?? ""}
                onChangeText={(value) =>
                  setCredentials((current) => ({
                    ...current,
                    [field.name]: value,
                  }))
                }
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.credentialInput,
                  { borderColor: theme.border, color: theme.foreground },
                ]}
              />
            </View>
          ))}
          <View style={styles.credentialActions}>
            <Pressable
              onPress={() => setCredentialsFor(null)}
              style={[styles.cancelButton, { borderColor: theme.border }]}
            >
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => saveCredentials.mutate()}
              disabled={saveCredentials.isPending}
              style={[styles.connectButton, { backgroundColor: theme.primary }]}
            >
              {saveCredentials.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={theme.primaryForeground}
                />
              ) : (
                <ThemedText
                  style={[
                    styles.connectText,
                    { color: theme.primaryForeground },
                  ]}
                >
                  Connect
                </ThemedText>
              )}
            </Pressable>
          </View>
        </Card>
      ) : null}
    </SettingsScreenScaffold>
  );
}

function Loading() {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

function ConnectedConnectorRow({
  name,
  logo,
  last,
  actionBusy,
  actionDisabled,
  onManage,
}: {
  name: string;
  logo?: string | null;
  last: boolean;
  actionBusy: boolean;
  actionDisabled: boolean;
  onManage: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.connectorRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <ConnectorMark name={name} logo={logo} />
      <ThemedText numberOfLines={1} style={[styles.name, styles.rowLabel]}>
        {name}
      </ThemedText>
      {actionBusy ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <>
          <View
            accessibilityLabel={`${name} connected`}
            style={[
              styles.connectedIndicator,
              { backgroundColor: theme.accent },
            ]}
          >
            <Check color={theme.primary} size={18} />
          </View>
          <Pressable
            onPress={onManage}
            disabled={actionDisabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${name}`}
            style={({ pressed }) => [
              styles.iconAction,
              pressed && styles.pressed,
            ]}
          >
            <MoreHorizontal color={theme.mutedForeground} size={20} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function AttentionConnectorRow({
  name,
  logo,
  status,
  last,
  actionBusy,
  actionDisabled,
  onPress,
}: {
  name: string;
  logo?: string | null;
  status: ConnectorConnection["status"];
  last: boolean;
  actionBusy: boolean;
  actionDisabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isPending = status === "pending";
  const action = isPending ? "Finish connecting" : "Reconnect";
  const Icon = isPending ? ArrowUpRight : RefreshCw;
  return (
    <Pressable
      onPress={onPress}
      disabled={actionDisabled}
      accessibilityRole="button"
      accessibilityLabel={`${action} ${name}`}
      style={({ pressed }) => [
        styles.connectorRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <ConnectorMark name={name} logo={logo} />
      <View style={styles.connectionCopy}>
        <ThemedText numberOfLines={1} style={styles.name}>
          {name}
        </ThemedText>
        <ThemedText themeColor="mutedForeground" style={styles.meta}>
          {action}
        </ThemedText>
      </View>
      {actionBusy ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <Icon color={theme.primary} size={20} />
      )}
    </Pressable>
  );
}

function AvailableConnectorRow({
  name,
  logo,
  last,
  actionBusy,
  actionDisabled,
  onPress,
}: {
  name: string;
  logo?: string | null;
  last: boolean;
  actionBusy: boolean;
  actionDisabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={actionDisabled}
      accessibilityRole="button"
      accessibilityLabel={`Connect ${name}`}
      style={({ pressed }) => [
        styles.connectorRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <ConnectorMark name={name} logo={logo} />
      <ThemedText numberOfLines={1} style={[styles.name, styles.rowLabel]}>
        {name}
      </ThemedText>
      {actionBusy ? (
        <ActivityIndicator color={theme.primary} size="small" />
      ) : (
        <View style={[styles.addIndicator, { backgroundColor: theme.accent }]}>
          <Plus color={theme.primary} size={18} />
        </View>
      )}
    </Pressable>
  );
}

function ConnectorMark({ name, logo }: { name: string; logo?: string | null }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    return (
      <View style={[styles.connectorMark, { borderColor: theme.border }]}>
        <Image
          accessibilityLabel={`${name} logo`}
          source={{ uri: logo }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          style={styles.connectorLogo}
        />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={`${name} icon`}
      style={[
        styles.connectorMark,
        { borderColor: theme.border, backgroundColor: theme.accent },
      ]}
    >
      <ThemedText style={[styles.connectorInitial, { color: theme.primary }]}>
        {name.slice(0, 1).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 64, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 14, lineHeight: 21 },
  connectorRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: 10,
  },
  connectorMark: {
    width: 40,
    height: 40,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  connectorLogo: { width: 28, height: 28 },
  connectorInitial: { fontFamily: Fonts.sansSemiBold, fontSize: 17 },
  connectionCopy: { flex: 1, minWidth: 0, gap: 3 },
  name: { flexShrink: 1, fontFamily: Fonts.sansMedium, fontSize: 15 },
  rowLabel: { flex: 1, minWidth: 0 },
  meta: { fontSize: 12, lineHeight: 17 },
  connectedIndicator: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  addIndicator: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  iconAction: {
    width: 28,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 15 },
  connectButton: {
    minWidth: 76,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
  },
  connectText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
  pressed: { opacity: 0.62 },
  field: { gap: Spacing.one },
  fieldLabel: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  credentialInput: {
    minHeight: 42,
    paddingHorizontal: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  credentialActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.two,
  },
  cancelButton: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
  },
});
