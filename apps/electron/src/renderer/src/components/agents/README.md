# Vendored beUI components

`components/agents/*` and `components/motion/*` are copied in from
[beUI](https://beui.dev) (MIT) through the shadcn registry, the same way
`components/ui/*` comes from shadcn. They are checked in on purpose: that is how
the registry is meant to be consumed, and it is what lets us hold them to the
rules below.

Add more with:

```bash
pnpm dlx shadcn@latest add @beui/<name>
```

The registry is declared in `apps/electron/components.json`.

## Three things the CLI gets wrong here

Check all three after every add — none of them fail loudly.

1. **It overwrites `src/renderer/src/lib/utils.ts`** with its own bare `cn`,
   dropping `ON_DEVICE_PHRASE` (used by onboarding, models, history and
   model-setup-panel). Back the file up before adding, restore it after.
2. **It writes self-referential imports.** `motion/text-shimmer.tsx` arrived
   importing `TEXT_SHIMMER_*` from itself rather than from
   `@renderer/lib/text-shimmer`. Typecheck catches it as TS2303/TS2459.
3. **It pulls transitive components you did not ask for.** `tool-result` drags
   in `agent-code`, which drags in `shiki` — far too heavy for the pill window,
   and Remix's tool disclosure shows JSON, not source. That one was dropped
   deliberately; don't re-add it without a reason.

## Two rules these files have to keep

**Rewrite `motion.*` to `m.*`.** Remix wraps its tree in
`<LazyMotion features={domMax} strict>`, and `strict` throws on a full
`motion.*` component — that is the point of it, since `motion.*` defeats the
tree-shaking `LazyMotion` exists for. Freshly added files arrive using
`motion.*` and must be converted. It must be `domMax`, not `domAnimation`:
`agent-activity` and `prompt-input` use `layout="position"` and
`AnimatePresence mode="popLayout"`, which need layout projection and silently
do nothing without it.

**Keep them behind the code split.** `pages/app.tsx` lazy-loads
`remix-chat.tsx`, which is why the pill's entry chunk is ~128kB rather than
~600kB — dictation is that window's hot path and wants none of this. Importing
any of these from code that dictation reaches undoes it. The sizes `app.tsx`
needs on every render live in `components/remix-chat-surface.ts` precisely so
they can stay statically imported.

## Theming

These components consume the app's semantic Tailwind tokens. Remix floats over
the user's editor rather than over the app, so its root carries `className="dark"`
to pin them to the dark palette in both themes. `globals.css` declares
`@custom-variant dark (&:is(.dark *))`, so descendants get both the CSS
variables and the `dark:` variants.

`globals.css` also defines the `scrollbar-hide` utility, which these components
reach for as a plugin utility that this project otherwise does not have.
