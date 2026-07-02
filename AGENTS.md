<!-- This section is maintained by the coding agent via lore (https://github.com/BYK/loreai) -->
## Long-term Knowledge

For long-term knowledge entries managed by [lore](https://github.com/BYK/loreai) (gotchas, patterns, decisions, architecture), see [`.lore.md`](.lore.md) in the project root.
<!-- End lore-managed section -->

## Engineering specs & audits (`specs/`)

Internal design docs, technical specs, and audits written before/alongside
implementation live in [`specs/`](specs/). Consult them for the *why* behind
refactors and the investigation trail for past changes — they're high-quality
context when working on a related area. Examples:

- Technical specs: `freestyle-cloud-auth.md`, `freestyle-transcribe-ui-refactor.md`,
  `redesign-models-page.md`, `mlx-hub-download-migration.md`.
- Audits: `cross-platform-audit.md`, `language-setting-audit.md`, `transcription-audit.md`.

Note: `specs/` is **internal engineering documentation**. The user-facing product
docs (published via Mintlify) are a separate tree at [`apps/docs/`](apps/docs/).
