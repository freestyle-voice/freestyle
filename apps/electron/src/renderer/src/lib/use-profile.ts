import { useCloudAuth } from "@renderer/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getClient } from "./api";

/** Social providers the profile page can link against. */
export const SOCIAL_PROVIDERS = ["github", "google", "apple"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const ACCOUNTS_QUERY_KEY = ["cloud-accounts"] as const;

/** The set of providers currently linked to the signed-in user. */
export function useLinkedAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<string[]> => {
      const res = await getClient().api.auth.accounts.$get();
      if (!res.ok) throw new Error("Failed to load connected accounts");
      const { accounts } = await res.json();
      return accounts.map((a) => a.providerId);
    },
  });
}

/** Update the display name and keep the sidebar/session in sync. */
export function useUpdateName() {
  const { refresh } = useCloudAuth();
  return useMutation({
    mutationFn: async (name: string): Promise<void> => {
      const res = await getClient().api.auth.profile.$post({ json: { name } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to update profile");
      }
      // The server updated the local session; pull the fresh user so the
      // sidebar tile reflects the new name immediately.
      await refresh();
    },
  });
}

/**
 * Start linking a social account: opens the provider's OAuth page in the
 * system browser. The linked-accounts list is refetched when the window
 * regains focus (see {@link useProfileRefocus}).
 */
export function useLinkSocial() {
  return useMutation({
    mutationFn: async (provider: SocialProvider): Promise<void> => {
      const res = await getClient().api.auth["link-social"].$post({
        json: { provider },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to start account linking");
      }
      const { url } = await res.json();
      await window.api.openExternal(url);
    },
  });
}

/**
 * Refetch linked accounts when the window regains focus — the OAuth link
 * completes in the external browser, so we can't observe it directly.
 */
export function useRefreshAccountsOnFocus(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
    };
    window.addEventListener("focus", invalidate);
    return () => window.removeEventListener("focus", invalidate);
  }, [enabled, queryClient]);
}
