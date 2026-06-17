# Freestyle — Design System

> The single source of truth for building Freestyle UI. Read this before adding
> any screen, component, or marketing surface. Values here are lifted directly
> from `apps/electron/src/renderer/src/globals.css` and the shipped settings
> pages — match them exactly. When in doubt, copy an existing page's recipe
> rather than inventing a new one.

---

## 1. Essence

Freestyle is **voice dictation for your desktop** — hold a key, speak, and it
types itself anywhere. The interface is **editorial, calm, and warm**: it reads
like a well-set magazine, not a SaaS dashboard.

Three principles govern every decision:

1. **Warm paper, not cold white.** The whole product sits on a cream substrate
   (`#F4F0E4`). Never use pure white (`#FFF`) or pure black (`#000`).
2. **Serif for voice, mono for machinery.** A large Instrument Serif headline
   with one italic, olive-accented word is the signature. Monospace, uppercase,
   widely-tracked micro-labels do the structural/metadata work.
3. **Restraint.** Olive is a seasoning, not a flood. One accent word, one active
   state, one meter — never a page of green. Lots of air; hairline borders; no
   drop shadows except on things that truly float (modals, popovers).

**Avoid:** gradients, glassmorphism, emoji, neon, heavy shadows, rounded-pill
buttons everywhere, icon soup, and "data slop" (decorative stats/badges that
don't inform a decision).

---

## 2. Color

Tokens are CSS variables on `:root` (light) and `.dark`. Always consume the
**semantic token**, never a raw hex, in product UI. Raw hex is listed only so
you can reproduce the palette in a standalone HTML artifact.

### Light (default)

| Token | Hex | Use |
|---|---|---|
| `--background` | `#F4F0E4` | App canvas (warm paper) |
| `--foreground` | `#16140F` | Primary text (near-black ink) |
| `--card` | `#FBF8EE` | Card / panel / popover surface |
| `--card-foreground` | `#16140F` | Text on cards |
| `--primary` | `#6B8F12` | Olive accent — italic headline word, active state, meters, primary CTA fill |
| `--primary-foreground` | `#FBF8EE` | Text/icon on olive |
| `--secondary` | `#ECE7D6` | Subtle fills — segmented tracks, sidebar, hover |
| `--secondary-foreground` | `#34302A` | Text on secondary |
| `--muted` | `#ECE7D6` | Muted fill |
| `--muted-foreground` | `#7B7461` | Secondary text, eyebrows, metadata |
| `--accent` | `#E8EFC9` | Pale olive wash — on-device / positive highlight |
| `--accent-foreground` | `#2E3F05` | Text on accent wash |
| `--destructive` | `#DD6E4E` | Terracotta — destructive actions, errors, warnings |
| `--border` | `#D6CDB8` | Hairline borders, dividers |
| `--input` | `#E3DCC8` | Input borders |
| `--ring` | `#6B8F12` | Focus ring (olive) |
| `--plum` (`--chart-3`) | `#5E4E78` | Tertiary data accent only — never a UI accent |

### Dark

| Token | Hex |
|---|---|
| `--background` | `#16140F` |
| `--foreground` | `#ECE7D6` |
| `--card` | `#1E1C16` |
| `--primary` | `#8AB62A` (brighter olive for contrast) |
| `--primary-foreground` | `#16140F` |
| `--secondary` / `--muted` | `#2A2720` |
| `--muted-foreground` | `#9E977F` |
| `--accent` | `#2E3F05` |
| `--accent-foreground` | `#E8EFC9` |
| `--destructive` | `#E0805F` |
| `--border` / `--input` | `#3A362D` |
| `--ring` | `#8AB62A` |

### Rules

- **Olive is rationed.** A typical screen has olive in exactly 2–3 places: the
  italic headline word, the active/selected state, and a single CTA or meter.
- **On-device = `--accent` wash + olive.** Privacy/local affordances use the
  pale olive (`--accent` / `--accent-foreground`). Cloud/neutral uses
  `--secondary`.
- **Selection tint:** active rows use `rgba(107,143,18,0.06)` (olive at 6%), not
  a solid fill.
- **Text selection** is olive at 25%: `::selection { background: rgba(107,143,18,0.25) }`.

---

## 3. Typography

Three families, three jobs. Load weights 300–800 for DM Sans; 400 for the
others.

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300..800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

| Role | Family | Where |
|---|---|---|
| **Display** | `Instrument Serif` (`.serif`, `.serif-italic`) | Page titles, hero numbers, the model name in a "current" slot |
| **Body / UI** | `DM Sans` | Everything functional — labels, paragraphs, buttons, inputs. Base 14px / line-height 1.5 |
| **Mono / micro-label** | `JetBrains Mono` (`.mono`) | Eyebrows, metadata, badges, keycaps, status. Always uppercase + tracked when used as a label |

Helper classes (from `globals.css`):

```css
.serif        { font-family:"Instrument Serif",serif; letter-spacing:-0.01em; line-height:0.95; }
.serif-italic { font-family:"Instrument Serif",serif; font-style:italic; letter-spacing:-0.005em; line-height:0.95; }
.mono         { font-family:"JetBrains Mono",ui-monospace,monospace; }
```

### The signature page title

Every top-level page uses this exact pattern — an italic, olive accent word
followed by an upright period:

```html
<h1 class="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
  <span class="serif-italic text-primary">Models</span><span>.</span>
</h1>
```

Optionally followed by one muted sentence (`text-muted-foreground text-[14px] leading-[1.5] max-w-[580px]`).

### Eyebrows / kickers

Mono, 10px, uppercase, tracking `0.14em`–`0.18em`, muted (or `text-primary` when
it labels the required/primary thing):

```html
<span class="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">Providers & keys</span>
```

### Type scale (observed)

| Use | Size / class |
|---|---|
| Page title | `48px` serif |
| "Current value" serif (e.g. selected model) | `30–34px` serif |
| Section heading | `mono 10px` eyebrow (structure comes from labels, not big H2s) |
| Body | `14px` |
| Secondary / metadata | `11–13px` |
| Badge / keycap | `9–10px` mono |

Tracking convention: the **smaller** the mono label, the **wider** the tracking
(9–10px → `0.14–0.18em`; 11px → `0.04em`).

---

## 4. Spacing, radius, borders, shadows

- **Spacing**: Tailwind 4px scale. Common rhythm — card padding `p-6` (24px),
  gaps `gap-2.5 / gap-3 / gap-6`, section spacing `mt-7` (28px).
- **Radius**: `--radius: 0.625rem` (10px) is the base. In practice:
  - Cards / panels / modals → `rounded-[14px]`
  - Buttons, inputs, small controls → `7–8px`
  - Pills, badges, toggles, chips → `rounded-full`
- **Borders**: always `1px solid var(--border)`. Hairlines everywhere — they do
  the work shadows would in other systems. Empty states use the same border
  `border-dashed`.
- **Shadows**: only on floating layers.
  - Popover/picker: `0 24px 50px -34px rgba(20,12,4,0.4)`
  - Modal: `0_24px_60px_-16px_rgba(20,12,4,0.4)`
  - Resting cards: **no shadow.**

---

## 5. Iconography

- **Library:** `lucide-react`. (In standalone HTML, hand-draw matching 24×24
  paths at `stroke-width:1.7`, round caps/joins.)
- **Size:** 12–16px inline; default color `--muted-foreground`, shifting to
  `--primary` only when active/selected or signalling on-device/privacy.
- **Vocabulary in use:** `Mic` (voice), `Sparkles` (LLM cleanup), `HardDrive` /
  `Cpu` (local / hardware), `Download`, `Check`, `Search`, `RefreshCw`,
  `AlertTriangle` (errors), `Key` (API keys), `Trash2`, `Plus`, `X`,
  `ChevronRight`.
- Keep icons functional. Don't decorate headings with icons.

---

## 6. Components

> **Component-first rule.** Every interactive control comes from
> `apps/electron/src/renderer/src/components/ui/*` (our themed shadcn/ui kit).
> **Do not hand-roll `<button>`, `<input>`, `<textarea>`, switches, badges,
> modals, segmented controls, sliders, or progress bars** with bare Tailwind —
> import the component and pick a variant. The kit is already themed to the
> tokens in this doc, so you get the editorial look for free and we stay
> consistent. The class strings below are the **contract each component
> satisfies**, not copy-paste markup. To add a new primitive, install it with
> `pnpm dlx shadcn@latest add <name>` and theme it to these tokens.

### Card / panel → `Card`
`import { Card } from "@renderer/components/ui/card"` — themed
`border-border bg-card rounded-[14px] border p-6`. Compose with
`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`. The legacy inline
`border-border bg-card rounded-[14px] border p-6` is still acceptable for
layout-only wrappers, but prefer `Card` for content panels.

### Badge / status pill → `Badge`
`import { Badge } from ".../ui/badge"`. Variants map to the palette: `default`
(olive `bg-primary`) for active; `secondary` for neutral; `destructive` for
errors/warnings; `outline` for hairline chips; `ghost`/`link` for inline.
Keep mono micro-label typography via `className="mono text-[9px] tracking-[0.14em]"`.

### Filter chip / segmented option → `ToggleGroup` (single)
`import { ToggleGroup, ToggleGroupItem } from ".../ui/toggle-group"`. Use
`type="single"`. Give the group the segmented "track" look with
`className="border border-border bg-secondary rounded-[9px] p-[3px]"` and items
`data-[state=on]:bg-card data-[state=on]:shadow-sm`. Selected = lifts to
`bg-card`; idle = transparent + muted text.

### Buttons → `Button`
`import { Button } from ".../ui/button"`. Pick the variant — never restyle:
- **`ink`** — primary CTA, near-black ink on paper (`bg-foreground text-background`).
- **`default`** — olive fill (`bg-primary`); reserved for selection states/CTAs
  where the ink button would compete.
- **`outline`** — secondary, hairline border on transparent, hover `bg-muted`.
- **`ghost`** — borderless, hover-only (icon buttons, row actions).
- **`destructive`** — soft terracotta (`bg-destructive/10 text-destructive`).
- **`link`** — inline text link.
Sizes: `default` (h-8), `sm`, `xs`, `lg`, and `icon`/`icon-sm`/`icon-xs`/`icon-lg`
for square icon buttons. Icons inside a button take `data-icon="inline-start"`
or `data-icon="inline-end"` (the component sizes them — no `size`/`w-/h-` on the icon).

### Toggle (switch) → `Switch`
`import { Switch } from ".../ui/switch"`. `<Switch checked={on} onCheckedChange={…} />`.
On = `bg-primary` track with a light knob; off = `bg-input`. Use `size="sm"` for dense rows.

### Input → `Input` / `InputGroup`
`import { Input } from ".../ui/input"`. For a leading icon, trailing button
(show/hide key), or `⌘K` addon, use `InputGroup` + `InputGroupInput` +
`InputGroupAddon` + `InputGroupButton` (see `settings.tsx` Server section).
Pair labels with `Label` (`import { Label } from ".../ui/label"`).
Multi-line → `Textarea`. Dropdowns → `Select` (`SelectTrigger`/`SelectValue`/
`SelectContent`/`SelectItem`) — note `SelectItem` cannot use an empty-string value.

### List row (selectable)
Hairline-divided rows inside a `Card`; selected row tinted `bg-primary/5` with a
trailing `Check` in `--primary`. Use CSS grid with explicit columns + `gap`,
never inline-flow siblings.

### Meter (speed / quality)
Five 5px dots, filled to value in `--primary`, empty in `--border`. (Bespoke —
not a shadcn primitive.)

### Progress bar → `Progress` ; range → `Slider`
`import { Progress } from ".../ui/progress"` — track `bg-muted`, fill
`bg-primary`, height `h-1` (override via `className`). Pair with mono 10px
byte/percent readout. For a draggable value use `Slider`
(`<Slider value={[n]} onValueChange={([v]) => …} />`).

### Empty state
```html
<div class="border-border bg-card rounded-[14px] border border-dashed px-9 py-[52px] text-center"> … </div>
```
Use `Button` (variant `default`) for the call-to-action inside it.

### Modal → `Dialog` ; confirm → `AlertDialog`
`import { Dialog, DialogContent, DialogHeader, DialogTitle, … } from ".../ui/dialog"`.
Already themed: centered `bg-card max-w-md rounded-[14px] border p-6` with the
modal shadow, warm-ink (`rgba(20,12,4,0.35)`) blurred backdrop. **Always render a
`DialogTitle`** (use `className="sr-only"` if visually hidden) — Radix handles
Esc, focus-trap, and backdrop dismissal, so don't re-implement them. For
destructive confirmations use `AlertDialog` (`AlertDialogCancel` +
`AlertDialogAction variant="destructive"`). Side panels use `Sheet`.

### Keycaps → `Kbd`
`import { Kbd } from ".../ui/kbd"` for `⌘K`-style hints and keycaps.

---

## 7. Layout & page shell

- The app is an Electron desktop window. The top 36–38px is a **draggable
  titlebar** (`WebkitAppRegion: drag`); interactive content sets `no-drag`.
- Page scroll area uses `.responsive-page-scroll` — `padding-inline: 3rem`
  (→ 2rem ≤1080px → 1rem ≤820px), `padding-bottom: 3rem`.
- Content **max-width ~760px**, centered, for settings/editorial pages — keep
  measure comfortable; don't run full-bleed text.
- Page rhythm: `Title` → one muted sentence → primary card → supporting
  sections separated by `mt-7` and a mono eyebrow each.
- Left nav (settings): `bg-secondary` rail, active item lifts to `bg-card` with a
  1px shadow and olive icon.

---

## 8. Motion

- Subtle and quick: `transition` ~`0.15s ease` on color, background, border,
  opacity, and toggle/knob `transform`.
- Disabled/secondary content dims via `opacity` (e.g. optional pane at `0.55–0.6`
  when its toggle is off) rather than disappearing.
- No bounces, no long eases, no parallax. The pill/recording states may pulse,
  nothing else.

---

## 9. Writing & microcopy

- **Voice:** plain, confident, second person. "Choose how Freestyle listens."
  "Audio never leaves your Mac." Short sentences. No marketing fluff, no
  exclamation marks.
- **Labels:** mono eyebrows are terse and categorical — `VOICE · REQUIRED`,
  `LLM CLEANUP · OPTIONAL`, `PROVIDERS & KEYS`.
- **Wordmark:** lowercase `freestyle` with an olive period — `freestyle.` Never
  capitalize it mid-sentence; never drop the period in the logo lockup.
- Numbers/metadata (sizes, RAM, $/hr, percentages) are mono.
- Sentence case for everything except mono labels (which are UPPERCASE).

---

## 10. Do / Don't

**Do**
- Reach for a `components/ui/*` component (§6) before writing any styled
  `<button>`/`<input>`/`<div>`. Pick a variant; don't restyle.
- Start from an existing page's structure and swap the content.
- Keep one olive accent word per title; keep one primary action per view.
- Use hairline borders + generous whitespace to separate, before reaching for
  fills or shadows.
- Make every badge/stat earn its place by informing a choice.

**Don't**
- Hand-roll a control (button, switch, badge, modal, segmented toggle, slider,
  progress) with bare Tailwind when a `components/ui/*` component exists.
- Introduce new hues, gradients, or a second accent color.
- Use pure white/black, emoji, or drop shadows on resting elements.
- Build big `<h2>` section headers — structure with mono eyebrows.
- Lay out rows of controls as bare inline siblings — use flex/grid + `gap`.
- Add placeholder/filler sections to fill space.

---

## 11. Quick-start (standalone HTML artifact)

When prototyping outside the app, set the tokens on `:root` and use the three
font families. Minimum viable shell:

```html
<style>
  :root{
    --background:#F4F0E4; --foreground:#16140F; --card:#FBF8EE;
    --primary:#6B8F12; --primary-foreground:#FBF8EE;
    --secondary:#ECE7D6; --muted-foreground:#7B7461;
    --accent:#E8EFC9; --accent-foreground:#2E3F05;
    --destructive:#DD6E4E; --border:#D6CDB8; --radius:10px;
  }
  body{ background:var(--background); color:var(--foreground);
        font-family:"DM Sans",system-ui,sans-serif; font-size:14px; line-height:1.5; }
  .serif{ font-family:"Instrument Serif",serif; }
  .serif-italic{ font-family:"Instrument Serif",serif; font-style:italic; }
  .mono{ font-family:"JetBrains Mono",ui-monospace,monospace; }
</style>
```

Then reach for the recipes in §6. If a new pattern is genuinely needed, design
it from these tokens (use `oklch` to derive harmonious neighbours of the olive
rather than inventing a fresh color), and add it back to this file.
