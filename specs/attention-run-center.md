# Attention and Run Center

## Goal

Give every Freestyle client one trustworthy, recoverable view of work that needs
a person. The first release exposes current durable work as a small, read-only
attention feed; it does not create a competing notification, scheduler, or
agent lifecycle.

## Product decision

The initial surface is a compact **What needs me now?** section in Remix. It is
not a new launch screen. A later home screen may reuse the same API without
changing its data contract.

## Existing authority

Cloud remains authoritative for work state:

- `thread_turns` owns an agent turn's durable lifecycle.
- `thread_action_requests` owns an approval or desktop action awaiting a person.
- `scheduled_task_runs` owns scheduled execution state and links to its thread
  and notification when available.
- `connector_connections` owns connected-app status.

Courier remains the notification delivery and history authority. Attention must
not write Courier notifications or mirror a notification in a new database table.

## Phase 1: derived attention snapshot

Add `GET /v2/attention` in Cloud and a trusted Desktop proxy at
`GET /api/attention`. The endpoint returns an ordered, bounded projection of
existing data for the authenticated user. It is read-only and makes no model,
connector, Courier, or scheduler calls.

```ts
type AttentionItem = {
  id: string;
  kind: "approval" | "agent_run" | "scheduled_run" | "connection";
  priority: "requires_action" | "important" | "informational";
  status: "waiting" | "running" | "failed";
  title: string;
  detail?: string;
  createdAt: string;
  updatedAt: string;
  target:
    | { type: "thread"; threadId: string; turnId?: string; actionId?: string }
    | { type: "scheduled"; taskId: string; runId: string; threadId?: string }
    | { type: "connection"; connectionId: string };
};

type AttentionSnapshot = {
  generatedAt: string;
  items: AttentionItem[];
};
```

Ordering is deterministic: waiting approvals, failed runs, active runs, then
unhealthy connections; within a group, newest `updatedAt` first. At most 25
items are returned. Terminal successful work is absent from this first feed.

### Eligibility rules

- A pending, unexpired `thread_action_requests` row is `approval` and
  `requires_action`.
- A non-terminal `thread_turns` row is `agent_run` and `running`.
- A failed `thread_turns` row updated in the last seven days is `agent_run`
  and `failed`.
- A queued, running, or failed `scheduled_task_runs` row updated in the last
  seven days is `scheduled_run`.
- A connection with a non-active status is `connection` and `important`.

One source record creates one item. If an approval belongs to an active turn,
both may appear: the approval is the action, while the turn explains the work.
The client may visually group them by thread but must not silently drop either.

## Desktop presentation

React Query owns the snapshot cache. Desktop independently parses the versioned
HTTP response rather than importing Cloud's private TypeScript package. The first render uses a shape-matched
skeleton. Stale data remains visible during refetch, and mutations or stream
events invalidate only the attention query. Selecting an item opens the existing
thread or settings destination; the feed does not invent another thread viewer.

The pill and companion remain observers. They will consume this snapshot in a
later phase, after their cross-window transport has an explicit subscription
contract. They must not keep their own copy of turn state.

## Backward compatibility and security

- Existing `/v2/agent`, `/v2/remix`, thread, scheduled-task, and Courier
  endpoints are unchanged.
- The endpoint is additive and authenticated through existing session middleware.
- Every source query is constrained by authenticated `userId`.
- Tool input, authorization tokens, MCP credentials, connector payloads, and
  prompt text never cross the endpoint.
- Desktop supplies the session token; renderer code never sees it.
- Clients that do not call attention retain unchanged behavior.

## Follow-on phases

1. Add append-only, redacted `thread_turn_events` and a Run Center timeline
   with retry, cancel, approval history, and source links. Do not infer a
   timeline retrospectively from UI message parts.
2. Add schedule preview and delivery outcome, then connection-health details
   and reconnect actions.
3. Add Memory Review provenance and approval controls plus shared
   command-palette actions.
4. Reuse the snapshot and run API for companion, mobile continuity,
   onboarding, and a dedicated home dashboard.

## Phase 1 acceptance criteria

- An approval, failed turn, scheduled failure, and inactive connection are
  visible only to their owner.
- Empty and loading states preserve layout; refetch does not replace visible
  items with a generic loading label.
- A click opens an existing target surface.
- The endpoint performs no writes and does not duplicate Courier delivery.
- Existing endpoint contracts and regression tests remain compatible.
