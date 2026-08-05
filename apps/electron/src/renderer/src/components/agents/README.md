# Vendored agent components (beUI)

These components come from [beUI](https://beui.dev) (MIT), pulled via the shadcn
registry declared in `apps/electron/components.json`:

```
npx shadcn@latest add @beui/<name>
```

They are checked in the same way `components/ui/*` is — the registry is meant to
be consumed by vendoring, not installed as a package. If you re-run the CLI to
update or add one, four traps are waiting:

1. **The CLI clobbers `lib/utils.ts`.** The beUI registry ships its own `cn`
   helper and overwrites ours on add. Discard that change — keep our `lib/utils.ts`.

2. **It writes a self-referential import.** Generated files may import from their
   own path (e.g. a component importing itself). Rewrite those to the real source.

3. **`m.*`, never `motion.*`.** Everything here renders under
   `<LazyMotion features={domMax} strict>` in `remix-chat.tsx`. `strict` forbids
   the eager `motion.*` API and throws at runtime if it slips in — rewrite every
   `motion.foo` the CLI emits to the tree-shakeable `m.foo`.

4. **Keep the code split.** The chat (and its Motion deps) is lazy-loaded at the
   `app.tsx` boundary so the dictation entry chunk stays small. Don't import these
   components into anything that loads on the pill's hot path; keep them behind the
   `remix-chat` lazy import.

`tool-result` and `agent-code` are deliberately **not** vendored: they pull in
shiki for syntax highlighting, and Remix's disclosure shows JSON, not source.
</content>
</invoke>
