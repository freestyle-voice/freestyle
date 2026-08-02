import type { CloudProfile, ProfileInput } from "@freestyle-voice/validations";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getClient } from "./api";
import { SETTINGS_QUERY_KEY } from "./query";

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

const PROFILE_FIELDS_QUERY_KEY = ["cloud-profile-fields"] as const;

/** The user's profile fields (industry / job title / company) + detected geo. */
export function useProfileFields(enabled: boolean) {
  return useQuery({
    queryKey: PROFILE_FIELDS_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<CloudProfile> => {
      const res = await getClient().api.auth["profile-fields"].$get();
      if (!res.ok) throw new Error("Failed to load profile");
      const { profile } = await res.json();
      // `profile` is null when the user has no active org yet (post-signup
      // window); surface an empty profile so the form renders cleanly.
      return (profile ?? {}) as CloudProfile;
    },
  });
}

/** Update the profile fields; refreshes the cached profile (with fresh geo). */
export function useUpdateProfileFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProfileInput): Promise<CloudProfile> => {
      const res = await getClient().api.auth["profile-fields"].$put({
        json: data,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to update profile");
      }
      const { profile } = await res.json();
      return profile as CloudProfile;
    },
    onSuccess: (profile) => {
      const previous = queryClient.getQueryData<CloudProfile>(
        PROFILE_FIELDS_QUERY_KEY,
      );
      queryClient.setQueryData(PROFILE_FIELDS_QUERY_KEY, profile);
      // The cloud re-seeds tone + vocabulary defaults into member_preferences on
      // ANY industry change (not just a first-time set); the local server
      // re-pulls them (settings table + vocabulary table) before this response
      // returns (see the profile-fields route). Invalidate both caches so the
      // tone and vocabulary pages re-read the freshly-seeded values.
      const industryChanged =
        (previous?.industry ?? null) !== (profile.industry ?? null);
      if (industryChanged && profile.industry) {
        void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
      }
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
 * Unlink a social account from the signed-in user. Invalidates the
 * linked-accounts query on success so the UI updates immediately.
 */
export function useUnlinkSocial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (providerId: SocialProvider): Promise<void> => {
      const res = await getClient().api.auth["unlink-account"].$post({
        json: { providerId },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to unlink account");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });
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

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

const ORGS_QUERY_KEY = ["cloud-orgs"] as const;
const ACTIVE_ORG_QUERY_KEY = ["cloud-active-org"] as const;

/** List all organizations the signed-in user belongs to. */
export function useListOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: ORGS_QUERY_KEY,
    enabled,
    queryFn: async () => {
      const res = await getClient().api.org.list.$get();
      if (!res.ok) throw new Error("Failed to list organizations");
      const { organizations } = await res.json();
      return organizations;
    },
  });
}

/** An organization the signed-in user belongs to (from the org list). */
type Organization = NonNullable<
  ReturnType<typeof useListOrganizations>["data"]
>[number];

/** The user's active organization from Freestyle Cloud. */
export function useActiveOrganization(enabled: boolean) {
  return useQuery({
    queryKey: ACTIVE_ORG_QUERY_KEY,
    enabled,
    queryFn: async () => {
      const res = await getClient().api.org.active.$get();
      if (!res.ok) throw new Error("Failed to load active organization");
      const { organization } = await res.json();
      return organization;
    },
  });
}

/**
 * Switch the user's active organization. Optimistically updates the active-org
 * cache so the UI reflects the change instantly, then refetches to confirm.
 *
 * Plans are org-scoped on the cloud (the subscription's `referenceId` is the
 * org id), so switching orgs can change the user's plan. We invalidate the
 * usage query too so the Pro/Free badge and word balance re-resolve for the
 * newly-active org instead of showing the previous org's plan.
 */
export function useSetActiveOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string): Promise<void> => {
      const res = await getClient().api.org["set-active"].$post({
        json: { organizationId },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to switch organization");
      }
    },
    onMutate: async (organizationId) => {
      // Cancel in-flight fetches so they don't overwrite the optimistic update.
      await queryClient.cancelQueries({ queryKey: ACTIVE_ORG_QUERY_KEY });

      const previous = queryClient.getQueryData(ACTIVE_ORG_QUERY_KEY);

      // Optimistically swap the active org from the cached org list. The list
      // rows are a subset of the full active-org shape (no `members`), which is
      // fine for the sidebar (reads only `name`); `onSettled` refetches the
      // authoritative full object.
      const orgs = queryClient.getQueryData<Organization[]>(ORGS_QUERY_KEY);
      const next = orgs?.find((o) => o.id === organizationId);
      if (next) {
        queryClient.setQueryData(ACTIVE_ORG_QUERY_KEY, next);
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Roll back on failure.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(ACTIVE_ORG_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      // Refetch the active org, and re-resolve usage/plan since it's scoped to
      // the now-active org.
      void queryClient.invalidateQueries({ queryKey: ACTIVE_ORG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
      // Preferences (cleanup tones/languages), vocabulary, and profile fields
      // are per-org too. The server re-pulled the new org's snapshot into the
      // local settings/vocabulary tables before this response returned (see the
      // org set-active route), so re-read them here to update every settings
      // page instead of showing the previous org's values.
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["vocabulary"] });
      void queryClient.invalidateQueries({
        queryKey: PROFILE_FIELDS_QUERY_KEY,
      });
    },
  });
}
