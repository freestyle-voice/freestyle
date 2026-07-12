<!--
  Thanks for contributing! A few quick reminders before you submit.

  PR title must follow Conventional Commits, e.g.:
    fix: prevent duplicate settings requests
    feat(plugins): add update checks
  Allowed types: feat, fix, docs, chore, refactor, test, ci, build, perf, style, revert
  It's used for the squash commit and the release changelog. A CI check enforces this.
-->

## Summary

<!-- What does this PR do and why? -->

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): summary`)
- [ ] Ran `pnpm biome check .` (lint + formatting)
- [ ] Ran `pnpm --filter @freestyle-voice/electron typecheck:web` (if touching the app)
