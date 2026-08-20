import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Link2, PlugZap, Search, Unplug } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import {
  Card,
  RetryLoadState,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type ConnectorCatalogItem,
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
  });
  const disconnect = useMutation({
    mutationFn: disconnectToolkit,
    onSuccess: invalidate,
    onError: (error) =>
      Alert.alert(
        "Couldn't disconnect app",
        error instanceof Error ? error.message : "Try again.",
      ),
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

  const catalogItems = useMemo(() => catalog?.connectors ?? [], [catalog]);

  return (
    <SettingsScreenScaffold
      title="Connected apps"
      subtitle="Connect the tools Remix can use for you. Review connections here and disconnect any app you no longer want to use."
    >
      <Card>
        <SectionTitle icon={PlugZap} title="Connected" />
        {connectionsLoading ? (
          <Loading />
        ) : connectionsError && connections.length === 0 ? (
          <RetryLoadState
            message="Couldn't load your connected apps. Check your connection and try again."
            onRetry={() => void refetchConnections()}
          />
        ) : connections.length === 0 ? (
          <ThemedText themeColor="mutedForeground" style={styles.empty}>
            No apps connected yet. Add one below to let Remix work with it.
          </ThemedText>
        ) : (
          connections.map((connection, index) => (
            <View
              key={connection.id}
              style={[
                styles.connection,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.connectionCopy}>
                <ThemedText style={styles.name}>
                  {connection.toolkitName}
                </ThemedText>
                <ThemedText themeColor="mutedForeground" style={styles.meta}>
                  {connection.status === "active"
                    ? `${connection.toolCount} tools available`
                    : connection.status === "needs_reconnect"
                      ? "Reconnect needed"
                      : "Connecting…"}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => disconnect.mutate(connection.toolkitSlug)}
                disabled={disconnect.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${connection.toolkitName}`}
                style={({ pressed }) => [
                  styles.iconButton,
                  { borderColor: theme.border },
                  pressed && { opacity: 0.6 },
                ]}
              >
                {disconnect.isPending ? (
                  <ActivityIndicator size="small" color={theme.destructive} />
                ) : (
                  <Unplug size={16} color={theme.destructive} />
                )}
              </Pressable>
            </View>
          ))
        )}
      </Card>

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

      <Card>
        <SectionTitle
          icon={Link2}
          title={search.trim() ? "Results" : "Available apps"}
        />
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
            <View
              key={item.slug}
              style={[
                styles.connection,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.connectionCopy}>
                <ThemedText style={styles.name}>{item.name}</ThemedText>
                <ThemedText
                  themeColor="mutedForeground"
                  style={styles.meta}
                  numberOfLines={2}
                >
                  {item.connection?.status === "active"
                    ? "Connected"
                    : (item.description ?? `${item.toolsCount ?? 0} tools`)}
                </ThemedText>
              </View>
              {item.connection?.status === "active" ? null : (
                <Pressable
                  onPress={() => connect.mutate(item)}
                  disabled={connect.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Connect ${item.name}`}
                  style={({ pressed }) => [
                    styles.connectButton,
                    { backgroundColor: theme.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {connect.isPending ? (
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
              )}
            </View>
          ))
        )}
      </Card>

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

const styles = StyleSheet.create({
  loading: { minHeight: 64, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 14, lineHeight: 21 },
  connection: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  connectionCopy: { flex: 1, gap: 3 },
  name: { fontFamily: Fonts.sansMedium, fontSize: 15 },
  meta: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 16 },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: Radius.full,
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
