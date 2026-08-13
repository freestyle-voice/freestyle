# Voice pill — motion design

Status: **implemented** on `design/voice-pill-motion`. Verified by driving the
real renderer headlessly (see §9) — arrival ramp, bar stagger, settle beat,
outside-in close, check draw, capsule contraction, cancel exit, silence
flatline, and the capsule→card morph are all measured, not eyeballed.

Target: `apps/electron/src/renderer/src/pages/app.tsx`, with one change to the
paste path in `apps/electron/src/main/index.ts` (§7) and one deletion in
`apps/electron/src/renderer/src/lib/streamer.ts`.

---

## 1. Why

The pill's waveform is the strongest thing in the product — the response curve,
the peak-hold shift register and the cancel-slot width budget are all carefully
built. What the pill doesn't have is a **body**: it blinks into existence on the
hotkey and vanishes the instant the paste resolves. The two moments a user
actually notices are the two with no design in them.

Everything below serves one thesis: **the pill is an object that arrives,
listens, works and leaves** — not a texture that flickers on and off over
someone's sentence.

## 2. Principles

1. **The bars never lie.** The waveform draws real audio and nothing else. The
   `connecting` breath — a generated ripple during `getUserMedia` — is cut.
2. **Every exit is a sentence ending.** Delivered, cancelled and failed are
   three different endings; today they are one instant disappearance.
   Confirmation is earned motion. Cancellation earns none.
3. **Prose stays in the card.** The capsule may grow by one 16px mark, never by
   a label. Words go to the tooltip, the `aria-live` region, and the card.
4. **Exit faster than you entered.** 260ms in, 140ms out. The one ending
   allowed to take its time is the one with something to say — and it spends
   that time holding the mark, not performing the departure.

Curves, both already in the file: `cubic-bezier(0.22, 1, 0.36, 1)` for
arrivals, `cubic-bezier(0.4, 0, 1, 1)` for departures. No new easing vocabulary.

## 3. Pain points this answers

| # | Defect | Evidence |
|---|---|---|
| 01 | The entrance animation never runs. `.pill-surface` is authored to start at `opacity: 0; scale(0.96)`, but React mounts the subtree with `data-show="true"` already set and CSS transitions don't fire on first paint. `showInactive()` reveals an opaque window. | `app.tsx` `.pill-surface`; `index.ts:863` |
| 02 | Nothing acknowledges success. The renderer hides the window in the same tick the paste resolves — and the main process had already hidden it before the keystroke (§7) — so a working dictation and a silently-swallowed paste look identical. | `app.tsx` `hidePill`; `index.ts` `deliverOutput` |
| 03 | The waveform fakes it while the mic opens — the `connecting` ripple reads as "I hear you, quietly" at the one moment nothing is heard. | `runBars`, `mode === "connecting"` |
| 04 | Commit deletes the last syllable: `targetsRef.fill(0)` plus both easing constants swapped in one frame. | `startBarAnimation` |
| 05 | A dead microphone is indistinguishable from a quiet room until the `"No audio captured"` dialog. | `commitRecording` |
| 06 | The capsule has no shadow on any background — a 1px 10%-white border is its only separation, and `cursor: grab` has no visual partner. | `pillInnerStyle` |
| 07 | The failure card crossfades with the capsule instead of growing out of it, so it reads as a second window. | the two `layerClass` layers |

## 4. The score

Nine moments. Timings are the full sequence length; overlapping segments are
noted.

### 1 · Arrival — 260ms
Capsule enters at `opacity 0`, `scale(0.88)`, offset 6px from the anchored edge
(`+6` bottom-anchored, `-6` top). Opacity over 160ms, transform over 260ms.
The ten bars enter as resting dots, staggered **right-to-left** at 12ms — the
direction samples actually travel through the row — capped at 108ms.

No OS-level window fade is needed or wanted: the pill window is already
`transparent: true`, so it is invisible until the capsule paints. The fix is
purely the mount handshake — render one frame at `data-show="false"`, then flip,
using the same double-`requestAnimationFrame` the card already uses for
`roomReady`.

### 2 · Listening — continuous, unchanged
The live meter and the hover-driven cancel slot ship as-is. Two additions:
- **Permanent soft shadow** `0 2px 10px rgba(0,0,0,0.22)` so the capsule
  survives a busy backdrop.
- **Hover lift** `translateY(-1px)`, border 10% → 16% white, shadow to
  `0 5px 16px rgba(0,0,0,0.26)`, 140ms. Hover already reaches the drag region
  (the shipped cancel reveal proves it).

### 3 · Silence — 260ms, new
1600ms continuously under `BAR_NOISE_FLOOR` while the analyser exists, and the
row admits it: dots dim to 45% and a hairline draws outward from the centre over
220ms. Retracts on the first real sample. Gated on
`analyserNodeRef.current !== null` so the `getUserMedia` window can't trip it.
No capsule text — tooltip and live region carry "No audio from your microphone".

### 4 · Long dictation — 260ms, new
Past 60s the existing status slot opens with a mono elapsed readout (`1:00`,
ticking). This reuses the mechanism already built for exactly this — the capsule
grows right by one mark's width and the waveform does not move.

### 5 · Handover — 480ms, new
Bars ease from wherever they are to rest over 180ms (rise = fall = 0.24, no
`fill(0)`), then **120ms of stillness**, then the sweep begins. The pivot from your voice to the machine gets a beat instead of a jump
cut.

Implementation: a `settle` phase inside the draw loop, not a React state.

### 6 · Delivered — 670ms, new · **the focal moment**
| Window | What |
|---|---|
| 0–182ms | the row **closes from the outside in**: each bar collapses `scaleY` → 0 *in place*, five pairs, outermost first, 18ms apart, 110ms each |
| 90–240ms | the check draws out of the centre the row closed on — `stroke-dasharray`, in the **same white as the bars**, because it is the meter resolving, not an icon fading in on top. It starts while the innermost pair is still collapsing, which is what binds the two gestures into one. |
| 240–560ms | **held.** The mark is the point; the closing was only clearing a path to it. |
| 560–670ms | capsule leaves on `opacity` + `scale(0.94)`, then `window.api.hidePill()` |

**Start it on dispatch, not on completion.** `window.api.pasteText` does not
resolve until the main process has waited out `pasteSettleMs` — 300ms, up to
600ms on the legacy backends — long after the text is actually in the document.
Awaiting it before beginning the close left the transcribing sweep running over
a document that already had the dictation in it, then closed the pill from a
standing start. The renderer now fires `dismissPill("delivered")` the moment
delivery is dispatched and awaits the promise afterwards. Measured
paste→close-start: **5–17ms**.

**Do not converge the bars by scaling the group.** A `scaleX` on the row
translates ten round-capped strokes toward each other, and the caps collide into
a clump with jarring slivers between them before they merge. Extinguishing each
bar where it stands keeps the row's pitch intact for the whole gesture, and no
two marks ever touch. The draw loop must be stopped (`mode = "off"`) before the
close so it stops rewriting bar geometry underneath the CSS transitions.

**Do not animate the capsule's width.** An earlier cut contracted it to a 30px
disc around the check, which meant transitioning `width` — a full layout pass
every frame, on a renderer that may still be cold on the first dictation of a
session. It read as sluggish and janked precisely where the design wanted to
feel most exact. The capsule now holds its shape and leaves on transform and
opacity alone; the mark simply takes the place the row occupied. The check is an
overlay, so `pillInnerStyle` carries `position: relative` to be its containing
block rather than depending on `backdrop-filter` incidentally making one.

Budget the time where the meaning is: the close is business and moves briskly;
the mark is what the user reads and gets a 320ms hold. The reverse — a leisurely
close and a mark that starts leaving 20ms after it finishes drawing — is a
confirmation you can miss by blinking.

Reduced motion: skip the choreography, hold the check, hide.

### 7 · Cancelled — 140ms, new
`scale(0.7)`, `translateY(+4px)`, `opacity 0`. Half the entrance, no mark,
deliberately dismissive. The sub-250ms "nothing said" path uses the same exit at
120ms without the drop.

### 8 · Failed — 360ms, new
The card grows out of the capsule's footprint. Card starts at
`scale(0.32, 0.34)` — its true ratio to the capsule — with `border-radius: 60px`
so the corner *looks* constant through the inflation, `transform-origin` at the
capsule's centre. Capsule leaves over 120ms from t=0; card arrives 60–360ms.
Transform and radius only; no width/height animation. The existing
`setPillExpanded` + double-rAF room handshake already provides the window space.

### 9 · Recovered — 240ms, new
Retry runs the morph backwards: card deflates over 110ms, capsule inflates over
240ms already showing the sweep, with the "Retrying" mark in the status slot.

## 5. Removals

- **The `connecting` BarMode**, with its `runBars` branch and its
  `startBarAnimation("connecting")` call. `initializing` stays as internal state
  (the hotkey-release path needs it) but renders identically to `recording`:
  the pill arrives and the bars sit at rest until real audio moves them.
  Recording begins the moment the pill is summoned.
- **Live partial plumbing.** `onPartial` is a live wire into a no-op. Product
  position is that partials belong nowhere in the UI, so the callback and its
  `case "partial"` dispatch come out rather than tempting a future reader.

## 6. Accepted as-is

- `.pill-status` animates `width`. It is a 22px slot and the capsule genuinely
  must grow; FLIP here would be more machinery than the problem deserves.
- The capsule is not keyboard-reachable (`focusable: false` on the window).
  Escape is a global shortcut and remains the keyboard path.
- **Drag** gets hover feedback only. A deeper shadow *while dragging* would need
  a `pill:dragging` IPC message off the main process's existing `will-move` /
  `moved` listeners — worth doing, but it is the one item here that adds IPC, so
  it is called out rather than assumed.

## 7. The pill must stay up through the paste

`deliverOutput` used to hide the pill window from inside `pasteIntoFocusedApp`'s
`beforePaste` callback, immediately before the synthetic keystroke. That made
the delivered animation **unobservable in principle**: the renderer only starts
it once `pasteText` resolves, by which point the window it draws into had been
gone for hundreds of milliseconds. The check had never once been seen.

Nothing about pasting needed the window down. The pill is created
`focusable: false`, plus a non-activating `panel` on macOS, so it is never the
focused window and the keystroke reaches the same application either way.
Hiding now belongs entirely to the renderer, which owns the end of the session
and sends `pill:hide` when its exit finishes. Both callers of `deliverOutput`
are renderer-driven, so there is always something on the other side to do it.

**Regression test to keep:** measure the gap between the `pasteText` IPC and the
`pill:hide` IPC. It must be ≥ the delivered exit's length (~430ms). Anything
that re-introduces an earlier hide silently deletes the confirmation while
every renderer-side assertion still passes.

## 8. Three traps

All three looked correct in review and were only visible under measurement or on a real first run.

**Endings race, and the vague one wins by default.** The success path asks for
`"delivered"`, and then `drainQueue`'s own `finally` — which has no way to know
a delivery just happened — asks for `"quiet"` a moment later. State hasn't
re-rendered in between, so the second call overwrote the first and every
successful dictation left via the *cancelled* gesture. `dismissPill` now guards
on a ref (`exitingRef`), first ending wins. Anything that adds a new call site
must keep that ordering property: the specific ending is always requested
before the generic cleanup one.

**A clock that hasn't started reads as the age of the epoch.** The elapsed
readout was gated on `recording || initializing`, but `startTimeRef` is only set
once the mic is actually open. On the first press of a fresh process it is still
`0`, so `Date.now() - 0` cleared the 60s threshold instantly and the status slot
opened on a `29763131:43` readout — a stray number at the pill's right edge,
every first startup. It is now gated on `recording` alone plus a non-zero start,
and the ref is reset between sessions so a stale one can't leak either.

**An inline style silently outranks an animated property.** The card carried
`borderRadius: 20` in its inline style object, so the
`.pill-card[data-show="false"] { border-radius: 60px }` start value never
applied and the corner stayed pinned at 20px through the whole morph — which
still *looks* plausible in a screenshot, because the scale animation is doing
the visible work. Anything the stylesheet animates must not also be set inline.

## 9. Verifying it

`getBoundingClientRect()` sampling across a transition is what proves motion
actually runs — the outside-in close, for instance, is confirmed by the
bar-to-bar gap holding at exactly 6.0px for every frame of the collapse, which
is the property that distinguishes it from the group-scale version that
clumped.

See `[[freestyle-pill-preview-harness]]` for the recipe. Two corrections to it:
resolve `ws` from `.pnpm` as well (and take `ws@8` — `ws@7` has no
`WebSocketServer` export), and pass an explicit `executablePath` for Chromium,
which currently only exists as `chromium_headless_shell-*`.

Silence needs a genuinely silent input — the fake device emits a tone, so the
flatline correctly never fires against it. Generate one with
`ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 12 silence.wav` and pass
`--use-file-for-fake-audio-capture=<path>%noloop`.

## 10. Rebuilding the prototype

The prototype reimplements the pill in vanilla JS at true geometry (30px
capsule, 96px core, 10 bars at 6px pitch) with the shipped response curve, so
what you see is dimensionally the component. Levels are synthesised — there is
no mic in a static page — while the real waveform runs the same math on real
audio. See `[[freestyle-pill-preview-harness]]` for driving the *actual*
renderer headlessly, which is how the implementation should be verified.
