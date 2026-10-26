# UI clarity and provider choice

## Intent

Make Freestyle explain what its controls do, reflect actual saved state, and keep navigation useful when collapsed. Preserve the existing serif typography, warm colors, and compact Models layout. The scope covers the UI audit, an icon sidebar, and direct access to registered cleanup providers and exact model IDs.

## Scope and decisions

- Tone settings report saving, success, and recoverable failure; pending changes never silently look persisted.
- Dictation instruction and practice states reflect hold/toggle and paste/clipboard settings, with an explicit first-use action.
- Remix waiting copy stays factual; existing durable run/tool activity remains authoritative.
- Phrase shortcuts, keyboard shortcuts, prompt starters, and automation setup use distinct labels and action verbs.
- Models explain transcription, cleanup, and independent Remix selection, including processing location and automatic cleanup pairing.
- Vocabulary explains recognition versus phrase replacement and guidance follows the selected model rather than a static provider list.
- Attention preserves stale items during error, exposes Retry, and allows all returned items to be viewed with direct destinations.
- Utility pages use the quieter compact heading hierarchy already present in Models.
- A collapsed desktop sidebar is a narrow rail of accessible navigation icons with tooltips, workspace access, active state, and an expand control. It must remain usable at narrow widths and in both workspaces.
- Investigate 0.7 and current provider registries. Enable every actually runnable cleanup provider in browsing, including OpenRouter. Support explicit model IDs for supported providers so catalog availability never blocks choosing a model. Keep credentials server-side and plugin/managed-chat boundaries intact.

## Implementation plan

1. Capture baseline dashboard screenshots using the existing isolated Electron fixture harness before product edits.
2. Implement provider/model selection with regression coverage for OpenRouter and catalog/manual selection.
3. Implement collapsed navigation rail and test navigation, tooltips, active state, persistence, and narrow widths.
4. Implement Tone save feedback and mode-aware dictation instructions with failure and activation regression tests.
5. Implement actionable attention, factual Remix status, precise capability actions, model-aware vocabulary guidance, and compact utility headers. Test behavior changes through existing unit/static-render and Electron fixture patterns.
6. Run formatting, renderer/main type checks, relevant unit suites, and isolated Electron visual/behavior checks. Compare light/dark and expanded/collapsed states.
7. Review the complete diff, fix actionable findings, capture after screenshots, and open one draft PR with before/after image pairs and concise validation evidence.

## Validation focus

- A failed or racing save does not claim success or lose the user's pending choice.
- Collapsed controls remain labeled, keyboard reachable, and distinguish active destinations in both workspaces.
- Selecting OpenRouter preserves vendor/model slashes and routes cleanup through the registered provider.
- Explicit model selection works without a successful remote catalog request, and unsupported providers are rejected.
- Attention errors do not imply there is no pending work; all returned items can be reached.
- Screenshots use disposable fixture accounts and no production credentials or personal content.

## Implementation and evidence

- Baseline: main `efaef3b8` (0.9.4). The 0.7.1 comparison confirmed that OpenRouter/Vercel adapters still existed; the changes improve discovery and remove the catalog-entry requirement for registered providers.
- Implemented all scoped surfaces. Freestyle Transcribe retains its bundled cleanup; independent cleanup providers are available with other transcription configurations.
- Save queues serialize per setting across page mounts as well as within one page. Account/managed-plugin execution boundaries are preserved.
- New regression coverage includes OpenRouter namespace handling, catalog-independent selection, custom endpoint configuration, setting write races/retries, model-aware vocabulary, attention failure/recovery/expansion, and collapsed keyboard navigation.
- Before/after captures and additional state evidence are in `assets/ui-clarity/`. All use disposable fixture accounts and isolated user data.
- Verification: 443 Electron unit tests, 600 server tests, desktop main/renderer and server typechecks, Electron build, and repository-wide Biome checks passed. The full 30-scenario dashboard suite passed; the additional model-selection recovery regression and four affected model flows also passed after the final fix.
- Manual model selection recovers from rejected configuration writes with both newly saved and existing keys, preserving the form and displaying an actionable error.
- Review found a cross-navigation save race, now covered by a regression and serialized writes. Visual checks also cover both sidebar widths and light/dark Models views.

