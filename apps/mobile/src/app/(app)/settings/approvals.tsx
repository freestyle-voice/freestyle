import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import {
  Card,
  SectionTitle,
  SettingsScreenScaffold,
} from "@/components/settings-ui";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getConnectorApprovalPreference,
  setConnectorApprovalPreference,
} from "@/lib/cloud/connector-approvals";

export default function ActionApprovalsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["connector-approval-preference"],
    queryFn: getConnectorApprovalPreference,
    retry: 1,
  });
  const autoApprove = data?.autoApproveMutations ?? false;
  const mutation = useMutation({
    mutationFn: setConnectorApprovalPreference,
    onSuccess: (preference) => {
      queryClient.setQueryData(["connector-approval-preference"], preference);
    },
    onError: () => {
      Alert.alert(
        "Couldn't update approvals",
        "Your previous setting is still active. Try again in a moment.",
      );
    },
  });

  const onChange = (next: boolean) => {
    if (mutation.isPending) return;
    if (!next) return mutation.mutate(false);
    Alert.alert(
      "Allow connected-app changes automatically?",
      "Remix will be able to make changes in connected apps without showing an approval card. You can turn this off at any time.",
      [
        { text: "Keep asking", style: "cancel" },
        {
          text: "Allow automatically",
          style: "destructive",
          onPress: () => mutation.mutate(true),
        },
      ],
    );
  };

  return (
    <SettingsScreenScaffold title="Action approvals">
      <Card>
        <SectionTitle icon={ShieldCheck} title="Connected apps" />
        <ThemedText themeColor="mutedForeground">
          Freestyle always asks before a connected app changes something. This
          keeps actions visible in your Remix conversation.
        </ThemedText>
        <View style={styles.row}>
          <View style={styles.copy}>
            <ThemedText>Allow automatically</ThemedText>
            <ThemedText themeColor="mutedForeground" style={styles.caption}>
              Skip approval cards for connected-app changes.
            </ThemedText>
          </View>
          {isLoading ? (
            <ActivityIndicator color={theme.mutedForeground} />
          ) : (
            <Switch
              value={autoApprove}
              onValueChange={onChange}
              disabled={mutation.isPending}
              trackColor={{ true: theme.primary, false: theme.secondary }}
            />
          )}
        </View>
      </Card>
    </SettingsScreenScaffold>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.one,
  },
  copy: { flex: 1, gap: 2, paddingRight: Spacing.four },
  caption: { fontSize: 13 },
});
