/**
 * Shared TanStack React Query client for the mobile app.
 *
 * One `QueryClient` instance is created at module scope — import it anywhere
 * you need programmatic cache access (invalidation, prefetching).
 */

import { QueryClient } from "@tanstack/react-query";

const ONE_HOUR = 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_HOUR,
      retry: 1,
    },
  },
});
