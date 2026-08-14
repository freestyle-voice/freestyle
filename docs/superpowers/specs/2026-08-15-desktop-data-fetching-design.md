# Desktop Data Fetching Consistency Design

## Goal

Make every cacheable desktop read use TanStack Query, paginate every
cursor-backed collection that can grow, and replace text-only initial loading
states with layout-preserving skeletons.

## Scope

This work covers the Electron renderer. Mobile already has a QueryClient and
is outside this migration. `nuqs` is deliberately excluded: the Electron panel
does not expose URL-driven navigation or shareable query parameters, so adding
it would create unused state machinery.

## Architecture

`lib/query.ts` remains the single registry for query keys and query-option
factories. Read helpers for non-Hono endpoints live beside their endpoint
clients, then components consume them through `useQuery` or
`useInfiniteQuery`. Writes use mutations or existing imperative writes and
invalidate the exact affected keys.

The renderer retains the one-hour default cache policy. Connection catalog,
search, thread history, notifications, and brain data override it only where
their lifecycle requires shorter freshness. Existing direct reads for telemetry,
streaming, uploads, and one-shot action requests remain imperative because
they are not cacheable view data.

## Data Flows

### Settings

`SettingsView` reads `settingsQueryOptions()` and updates the cached map
optimistically before its PUT completes. A failed mutation restores the prior
map; a successful one reloads dictation preferences and invalidates the
settings key. This removes the duplicate raw GET.

### Notifications and threads

Notification history receives a stable query key, retries according to the
shared QueryClient policy, and preserves its existing signed-out/unreachable
copy. Thread clients expose `latest`, `byId`, and a cursor page. Thread history
uses `useInfiniteQuery` with the API-provided `nextCursor`, preserving loaded
pages as the user requests more. Opening a thread uses the per-thread cache;
mutations that create or clear threads invalidate the history and latest keys.

### Connector search

Search changes from a single 50-result query to a cursor-based
`useInfiniteQuery`. The debounced query string remains part of the key, so a
new term receives a distinct cached result set. The existing intersection
observer triggers subsequent pages. Initial loading includes the browse query,
so the catalog cannot appear temporarily empty while it is still in flight.

### Brain views and scheduled tasks

Brain listing and file-reading helpers continue to own their short TTL cache,
but expose query options so React Query deduplicates component reads and
controls loading/error state. Writes update or invalidate both cache layers.
Scheduled-task parsing is a derived query built from the cached brain data.

## Loading UI

A small shared desktop skeleton primitive provides row and content placeholders
with `aria-busy` on the owning region. Settings, notifications, threads, notes,
todos, scheduled tasks, and opener cards use it on their first load. Existing
connector skeletons remain because they match the catalog card geometry.

## Errors and Empty States

Loading, empty, signed-out, and error states remain separate. A failed request
does not render as an empty collection. Queries keep prior data visible while
background refreshes run.

## Testing

Unit tests cover query-option page parameters and next-cursor behavior,
settings rollback/invalidation, and query-client cache updates after writes.
Component tests cover first-load skeletons, connector search pagination, and
thread history's load-more control. Run the Electron Vitest suite, Electron
type checks, and the repository test target before opening the PR.
