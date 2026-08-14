import { QueryClient } from "@tanstack/react-query";
import { getClient } from "./api";
import {
  type ConnectorCatalogPage,
  getConnectorDetails,
  listConnectorCatalog,
  listConnectorConnections,
  listSuggestedConnectors,
} from "./connectors";
import type { AvailableModel } from "./models";

/** Common staleTime for cached queries (1 hour). */
export const ONE_HOUR = 60 * 60 * 1000;

/** Entry shape for the plugin-updates query key (name + installed version). */
type PluginUpdateEntry = { name: string; currentVersion: string };

/**
 * Single source of truth for every React Query key in the renderer.
 *
 * Query keys must match exactly across producers (`useQuery`) and consumers
 * (`invalidateQueries`/`setQueryData`) — a stray inline literal silently splits
 * or misses the cache. Keeping them here prevents that drift. Conventions:
 *   - `foo` — a static key tuple.
 *   - `foo.all` — the family base; `invalidateQueries({ queryKey: foo.all })`
 *     cascades to every key that starts with it (React Query prefix match).
 *   - `foo.list(...)` — a parameterized key derived from a base.
 * Always `as const` so tuples stay literally typed for `getQueryData<T>()`.
 */
export const queryKeys = {
  /** Full persisted settings map (`GET /api/settings`). */
  settings: ["settings-all"] as const,

  models: {
    /** Family base — invalidates available + configured together. */
    all: ["models"] as const,
    available: ["models", "available"] as const,
    configured: ["models", "configured"] as const,
  },

  /** Experimental feature flags (`GET /api/config`). */
  config: ["config"] as const,
  /** Device-local dismissed-notification keys. */
  dismissedNotifications: ["dismissed-notifications"] as const,

  /** Installed plugins list (via `listPlugins`). */
  plugins: ["plugins"] as const,
  /** Remote plugin catalog. */
  pluginCatalog: ["plugin-catalog"] as const,
  pluginUpdates: {
    all: ["plugin-updates"] as const,
    list: (entries: PluginUpdateEntry[]) =>
      ["plugin-updates", entries] as const,
  },

  history: {
    all: ["history"] as const,
    daily: ["history", "daily"] as const,
    list: (page: number, search: string, startDate: string, endDate: string) =>
      ["history", page, search, startDate, endDate] as const,
  },

  dictionary: {
    all: ["dictionary"] as const,
    list: (page: number, search: string) =>
      ["dictionary", page, search] as const,
  },
  vocabulary: {
    all: ["vocabulary"] as const,
    list: (page: number, search: string) =>
      ["vocabulary", page, search] as const,
  },

  connectors: {
    all: ["connectors"] as const,
    catalog: ["connectors", "catalog"] as const,
    connections: ["connectors", "connections"] as const,
    search: (search: string) => ["connectors", "search", search] as const,
    suggested: ["connectors", "suggested"] as const,
    details: (slug: string) => ["connectors", "details", slug] as const,
  },

  /** Empty-state opener cards (`GET /api/suggestions/home`). */
  openers: ["openers"] as const,

  /** Remix practice runs. */
  remixRuns: ["remix", "runs"] as const,

  cloud: {
    usage: ["cloud-usage"] as const,
    orgs: ["cloud-orgs"] as const,
    activeOrg: ["cloud-active-org"] as const,
    accounts: ["cloud-accounts"] as const,
    profileFields: ["cloud-profile-fields"] as const,
    config: ["cloud-config"] as const,
    pricing: ["cloud-pricing"] as const,
  },
} as const;

/**
 * Query options for the full persisted-settings map. Use with `useQuery`:
 *
 *   const { data } = useQuery(settingsQueryOptions());
 *   const { data } = useQuery({ ...settingsQueryOptions(), enabled });
 *
 * Keeps the key + fetch shape in one place across the pages that read settings
 * (settings, tone, models, onboarding, tutorial demo).
 */
export function settingsQueryOptions() {
  return {
    queryKey: queryKeys.settings,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await getClient().api.settings.$get();
      if (!res.ok) throw new Error("Failed to load settings");
      return (await res.json()) as Record<string, string>;
    },
  };
}

/**
 * Query options for the available-models catalog. Use with `useQuery`, or read
 * the shared cache from a handler via
 * `queryClient.ensureQueryData(availableModelsQueryOptions())`.
 */
export function availableModelsQueryOptions() {
  return {
    queryKey: queryKeys.models.available,
    queryFn: async (): Promise<AvailableModel[]> => {
      const res = await getClient().api.models.available.$get();
      if (!res.ok) throw new Error("Failed to load available models");
      return (await res.json()) as AvailableModel[];
    },
  };
}

export type FreestyleConfig = {
  version: number;
  flags: Record<string, boolean>;
};

/**
 * Query options for `config.freestyle.json` (experimental feature flags). Keeps
 * the flags load on the same React Query cache as the rest of the settings page
 * instead of re-fetching on every visit. Invalidate `queryKeys.config` after a
 * flag mutation to refresh.
 */
export function configQueryOptions() {
  return {
    queryKey: queryKeys.config,
    queryFn: async (): Promise<FreestyleConfig> => {
      const res = await getClient().api.config.$get();
      if (!res.ok) throw new Error("Failed to load config");
      return (await res.json()) as FreestyleConfig;
    },
  };
}

/**
 * Query options for the device-local dismissed-notification key list. Use with
 * `useQuery`:
 *
 *   const { data } = useQuery(dismissedNotificationsQueryOptions());
 */
export function dismissedNotificationsQueryOptions() {
  return {
    queryKey: queryKeys.dismissedNotifications,
    queryFn: async (): Promise<string[]> => {
      const res = await getClient().api["dismissed-notifications"].$get();
      if (!res.ok) throw new Error("Failed to load dismissed notifications");
      return (await res.json()) as string[];
    },
  };
}

/**
 * Connected-app catalog and status snapshot. Keep it warm across Settings
 * navigation, but refresh after five minutes so lifecycle changes made outside
 * the desktop app do not remain hidden for the full default cache lifetime.
 */
export const CONNECTOR_CATALOG_PAGE_SIZE = 24;

export function connectorCatalogInfiniteQueryOptions() {
  return {
    queryKey: queryKeys.connectors.catalog,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listConnectorCatalog({
        cursor: pageParam ?? undefined,
        limit: CONNECTOR_CATALOG_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage: ConnectorCatalogPage) =>
      lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_HOUR,
  };
}

export function connectorConnectionsQueryOptions() {
  return {
    queryKey: queryKeys.connectors.connections,
    queryFn: listConnectorConnections,
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_HOUR,
  };
}

export const CONNECTOR_SEARCH_PAGE_SIZE = 50;

export function connectorSearchQueryOptions(search: string) {
  return {
    queryKey: queryKeys.connectors.search(search),
    queryFn: () =>
      listConnectorCatalog({ search, limit: CONNECTOR_SEARCH_PAGE_SIZE }),
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_HOUR,
    enabled: search.length > 0,
  };
}

export function connectorSuggestedQueryOptions() {
  return {
    queryKey: queryKeys.connectors.suggested,
    queryFn: listSuggestedConnectors,
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_HOUR,
  };
}

export function connectorDetailsQueryOptions(slug: string) {
  return {
    queryKey: queryKeys.connectors.details(slug),
    queryFn: () => getConnectorDetails(slug),
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_HOUR,
  };
}

/**
 * Shared QueryClient factory for the renderer. Defaults suit a desktop SPA:
 * - `refetchOnWindowFocus: false` — the user switches apps constantly; focus
 *   refetches would be noisy. Freshness is driven by explicit invalidation
 *   (mutations + IPC events) instead.
 * - `staleTime: ONE_HOUR` — avoid redundant refetches on remount/navigation.
 *   Queries that need fresher data override this locally.
 * - `retry: 1` — one retry for transient loopback hiccups, no aggressive loop.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: ONE_HOUR,
        retry: 1,
      },
    },
  });
}
