---
name: T-minus
description: Launch anything Meteora can and set every part of it, in one neutral scale where every claim sits beside the interface that proves it.
colors:
  ground: "#FFFFFF"
  surface: "#FFFFFF"
  grey-1: "#F2F2F2"
  grey-2: "#E6E6E6"
  grey-3: "#CFCFCF"
  grey-4: "#A6A6A6"
  grey-5: "#6B6B6B"
  ink: "#111111"
  ink-2: "#4A4A4A"
  ink-3: "#6B6B6B"
  placeholder: "#737373"
  line: "#E6E6E6"
  line-2: "#D4D4D4"
  danger: "#B42318"
  danger-soft: "#FEF3F2"
  danger-line: "#F4C7C1"
  split-wallets: "#111111"
  split-studio: "#6B6B6B"
  split-meteora: "#A6A6A6"
  split-pool: "#D4D4D4"
typography:
  display:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(44px, 5vw, 112px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 4vw, 3.4rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  section:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3.4rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.045em"
  statement:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 2.3vw, 2.6rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
    fontFeature: "tnum"
  label:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  term:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  wordmark:
    fontFamily: "Satoshi, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.32rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  chip: "0.24em"
  sm: "5px"
  md: "6px"
  tile: "6px"
  card: "8px"
  lg: "8px"
  sheet: "20px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "40px"
  frame: "max(clamp(18px, 4vw, 64px), calc((100vw - 1600px) / 2))"
  section: "clamp(72px, 9vw, 140px)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "44px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "#2A2A2A"
  button-primary-large:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.tile}"
    padding: "14px 24px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-small:
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    height: "34px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "0 0.28em 0.04em"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  chip-empty:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
  chip-bad:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  add-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "5px 14px 5px 10px"
    height: "34px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "11px 13px"
    height: "46px"
  choice-segmented:
    backgroundColor: "{colors.grey-1}"
    rounded: "11px"
    padding: "3px"
  choice-segment-picked:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 16px"
    height: "38px"
  choice-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "14px 38px 14px 15px"
    height: "64px"
  pick:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
    height: "30px"
  pick-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  toggle-off:
    backgroundColor: "{colors.grey-2}"
    rounded: "12px"
    width: "42px"
    height: "24px"
  toggle-on:
    backgroundColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "clamp(18px, 1.6vw, 26px)"
  inset-group:
    backgroundColor: "{colors.grey-1}"
    rounded: "{rounded.card}"
    padding: "16px"
  nav-link:
    textColor: "{colors.ink-2}"
    rounded: "9px"
    padding: "7px 14px"
  nav-link-current:
    backgroundColor: "{colors.grey-1}"
    textColor: "{colors.ink}"
---

# Design System: T-minus

## Overview

**Creative North Star: "Claim and Proof"**

T-minus speaks in one neutral scale. Near-white grounds, white surfaces, a fine grey ramp and near-black ink carry everything; there is no brand colour; the largest primary buttons carry the T-minus mark in white. Every claim the product makes sits next to a working piece of the interface that proves it: the home page pairs each headline claim with a live control or read-back, and the launch itself is a plain sentence whose values are the controls.

The density is calm and editorial rather than dashboard-dense. Type does the work: Satoshi, large and tightly tracked for statements and headings, quiet and tabular for numbers. The surfaces are flat: white on white, separated by 1px hairlines, with no shadows, glass or glow (the owner found the soft shadows cheap, 2026-10-17). The one spectacle is the home hero's meteorite, a WebGL chunk of smoky graphite glass refracting a fine dot grid, rendered in the same greys as the interface.

The owner rejected the earlier ice-blue dark look as cheap and asked for minimal black and white; the system is light only (`color-scheme: light`).

**Key Characteristics:**
- One neutral grey scale from #FAFAFA to #111111; colour appears only as danger red on errors; the large primary actions carry the T-minus mark in white.
- Satoshi only, tracked tight (-0.035em to -0.05em) at display sizes; tabular numerals throughout.
- Hairline borders (#E6E6E6 / #D4D4D4) only: no shadows, no glass, no glow (owner, 2026-10-17). Facts are text with a middle dot, not grey capsules.
- Selection is expressed in ink: a picked thing turns black-filled or gains an ink inset ring.
- Locks drawn in ink mark every setting that can never change.
- Drawn 24-unit line icons at a 1.6 stroke; option glyphs are tiny charts.

## Colors

A monochrome product palette: grounds, greys and ink, and a functional red.

### Primary
- **Graphite Ink** (`ink`): text, primary buttons, picked chips, pressed picks, toggle-on, the chart line, the seal. Black is the selection colour of the whole system.

### Secondary

### Tertiary
- **Warning Brick** (`danger`, with `danger-soft` fill and `danger-line` border): invalid inputs, chips whose clause has an error, the fix list, failed transactions, destructive buttons. Functional only, never decorative.

### Neutral
- **Paper Ground** (`ground`): page background, under a faint white radial bloom and a 3.5%-alpha noise grain.
- **White Surface** (`surface`): cards, inputs, chips, tiles, dialogs, the editor.
- **Fog** (`grey-1`): segmented-switch track, inset groups (pair fields, action forms), warning rows, current nav item, image wells.
- **Mist** (`grey-2`): toggle-off track, progress track, skeleton shimmer.
- **Ash** (`grey-3`): dashed add borders, underline colour for links, scrollbar thumb.
- **Pewter** (`grey-4`): hover border on inputs, tiles and buttons; dashed border of empty chips.
- **Lead** (`ink-3`, `grey-5`): secondary text, Meteora terms, axes, captions.
- **Charcoal** (`ink-2`): body copy in sub-paragraphs, nav links, unpicked control text.
- **Placeholder Grey** (`placeholder`): input placeholders, kept just dark enough to pass contrast on white.
- **Hairline** (`line`) and **Hairline Strong** (`line-2`): every border and divider; `line-2` on controls that must read as clickable.
- **Split greys** (`split-wallets`, `split-studio`, `split-meteora`, `split-pool`): the four segments of the per-$100 split bar and legend, ordered dark to light by who receives the money.

### Named Rules
**The Mark Rule.** The only ornament in the interface is the T-minus mark in white inside a large primary button. No hue anywhere except error red.

**The Ink Selects Rule.** Selection, on-state and progress are shown by ink (black fill or a 1px ink inset ring), never by a hue.

## Typography

**Display Font:** Satoshi (variable 300 to 900, self-hosted, `font-display: swap`), with ui-sans-serif, system-ui fallbacks
**Body Font:** Satoshi
**Label/Mono Font:** ui-monospace / SF Mono / Menlo only for Meteora program field names inside the small-print term

**Character:** One geometric grotesque doing every job, separated by size and tracking rather than by family. Large text is tight and confident; small text is plain and quiet.

### Hierarchy
- **Display** (500, with a 700 second line; clamp(44px, 5vw, 112px); line-height 1; -0.05em): the home hero headline only. The claim line is regular, the "Set every part of it" line bold.
- **Section** (600, clamp(2rem, 3.4vw, 3.4rem), -0.045em, max 20ch): home section headings.
- **Headline** (600, clamp(2.2rem, 4vw, 3.4rem), 1.08, -0.035em): page h1; h2 at clamp(1.6rem, 2.4vw, 2.3rem).
- **Statement** (400, clamp(1.8rem, 2.3vw, 2.6rem), line-height 1.5, -0.035em, ink-3, max 30em): the launch sentence; chips inside it step up to 500 and ink.
- **Numeral** (500, clamp(2.2rem, 3.4vw, 3.4rem), -0.05em, line-height 1): the proof figure above each home claim ("6 shapes", "Up to 5 wallets").
- **Title** (600, 1.1rem to 1.4rem, -0.015em to -0.03em): h3, editor heads, review groups, card titles.
- **Body** (400, 16px, 1.55, tabular-nums, max 68ch): all running text.
- **Label** (500, 0.92rem): field labels, button text (0.95rem), nav (0.95rem).
- **Term** (400, 0.74rem, ink-3): Meteora's own term in small print beside a plain label.
- **Wordmark** (700, 1.32rem, -0.04em, lowercase "meteor").

### Named Rules
**The Plain-Then-Term Rule.** Every setting is labelled in plain words at label size with Meteora's term beside it at term size; program field names set in monospace, phrases left in Satoshi.

**The Tracked-Caps Exception.** Tracked capitals (0.78rem, 700, 0.16em) appear only for a token's ticker symbol under its name. They are not a section-label device.

## Layout

A single page frame: horizontal padding `frame` (18px to 64px, growing so content never exceeds 1600px), page top padding clamp(28px, 5vw, 64px), 96px bottom. Narrow pages cap at 760px.

The launch composes 7/12 statement left and 5/12 sticky side right (min 360px, gap clamp(36px, 4.5vw, 96px), side sticky at top 86px). Review uses a fluid read-back column beside a 340 to 420px sticky sign card. Home proof rows are 5fr claim beside 7fr proof, separated by hairlines, padded clamp(32px, 4vw, 56px). The controls map is a 12-column grid with 14px gaps.

Spacing rhythm is small and steady: 6, 8, 10, 14 and 22px inside components; 40px between groups; clamp(72px, 9vw, 140px) between home sections.

Breakpoints: at 1100px two-column layouts stack, sticky sides go static and the editor becomes a bottom sheet (88vh, 20px top corners, scrim); at 860px the nav wraps to its own row and the hero card hides; at 640px tiles go to one column, the statement drops to 1.55rem with 1.7 line-height, and the sticky compose foot keeps only the primary button.

## Elevation & Depth

Flat (owner, 2026-10-17, replacing soft offset shadows the owner found cheap). Every surface is white on a white ground and is defined by a 1px hairline (`line`, or `line-2` on controls that must read as clickable). Nothing casts a shadow: cards, tiles, panels, the editor, the sign card, dialogs, buttons and inputs all sit flat. Groups of figures (the token page's market figures and checks) share one hairline strip with 1px dividers instead of separate boxes. The only halo is focus: `0 0 0 3px rgba(17, 17, 17, .08)` around a focused input whose border turns ink. Backdrop blur stays only where content scrolls under chrome (topbar, pinned compose foot, scrim).

### Named Rules
**The Flat Rule.** No box-shadow, glass, gradient sheen or glow on any surface or button; separation comes from hairlines and space. The shadow tokens in the stylesheet are zero-size so older rules that still name them draw nothing.

## Shapes

Precise, barely rounded rectangles (owner, 2026-10-17): 6px on buttons, inputs, choices and tiles (5px on small buttons and picks), 8px on panels, cards, the editor and dialogs. No pills; a fact is text, not a capsule; circles for the medallion, avatars, step numbers and transaction numbers. Chips in the statement round in em (0.24em) so they scale with the sentence. Dashed borders mean "not yet filled": empty chips, add pills, the empty image well and empty states.

The T-minus mark is a T: a minus cut like a slab with slanted ends, over a graphite shard lifting off with its exhaust fading below. The app icon inverts it, a light mark on a #111111 rounded square (14/64 corner).

## Components

### Buttons
Quiet and solid; one black button per view.
- **Shape:** gently rounded (10px; 12px at large, 8px at small).
- **Primary:** ink fill, white text, 44px min height, padding 10px 18px, the primary press shadow. The large size (52px, 14px 24px) carries the T-minus mark in white (18px, drawn as a CSS mask in currentColor) before its label.
- **Hover / Focus:** primary lightens to #2A2A2A; secondary border darkens to pewter; all buttons press 1px down on active; focus is a 2px ink outline at 2px offset. Transitions 0.15s.
- **Secondary:** white surface, `line-2` border, contact shadow. **Ghost:** transparent, `line` border, no shadow. **Danger:** brick text on a `danger-line` border. **Link-ish:** underlined charcoal text with an ash underline that turns current colour on hover.
- **Disabled:** 45% opacity, no shadow.

### Chips (the statement)
The signature control: values inside the launch sentence.
- **Style:** white surface, `line-2` border, 0.24em radius, weight 500 in ink, a soft em-scaled shadow; inline with the sentence.
- **State:** open = ink fill, white text; empty = transparent, dashed pewter border, ink-3 regular weight; error = brick border and text on `danger-soft`. Hover turns the border ink.
- **Behaviour:** when a value changes, the chip flashes grey for 0.6s, so the sentence always says what will launch.
- **Add pills:** dashed ash pill with a drawn plus, turning solid ink on hover; they sit in an "Add" row under the sentence.

### Cards / Containers
- **Corner Style:** 18px panels; 14px inner cards (chart, split, specimen); 12px for small grouped rows.
- **Background:** white on the paper ground; fog for inset groups and warnings.
- **Shadow Strategy:** resting card for panels, lifted for the editor, sign card and dialogs (see Elevation).
- **Border:** 1px `line` hairline always.
- **Internal Padding:** 16px to 26px.

### Inputs / Fields
- **Style:** white, `line-2` border, 10px radius, 46px min height, padding 11px 13px, contact shadow. Units sit inside the field as a suffix in ink-3.
- **Focus:** border turns ink plus the 3px focus halo; hover border is pewter.
- **Error:** brick border, brick message under the field with `role="alert"`.
- **Picks:** one-tap pill presets under a percentage field; pressed = ink fill.
- **Choice:** bare options are a segmented switch on a fog track (picked segment = white with a hairline lift); options with a note or glyph are tiles (picked tile = ink inset ring plus a drawn check top right, glyph from 40% to full opacity).
- **Toggle:** 42 by 24 track, grey-2 off, ink on, white 18px knob sliding on the system ease.
- **Advanced:** a disclosure under a hairline with a drawn plus that rotates 45 degrees when open.

### Explanations ("?")
Every launch setting carries a "?" (a 15px drawn icon, pewter until hovered) after its label. Hover, focus or tap opens an ink panel (white 0.82rem text, 10px radius, deepest shadow) directly under the label, as wide as the setting, so it never clips in a narrow column. The wording lives in one file, `web/pages/launch/tips.mjs`.

### Start marks
The parts most launches change (name and ticker, the fee, where the fees go) carry a small ink dot on the corner of their first chip until that part has been opened once, with one line above the statement saying what the dot means and what the defaults already are. Inside each editor the common settings come first; everything else sits under one "More … settings" fold.

### Navigation
Sticky topbar on translucent paper (82%) with a 14px blur and a hairline bottom; floats transparent over the home hero. Mark plus lowercase wordmark left, links centred (charcoal 500, 9px rounded hover wash, current page on fog), the wallet pill right. Under 860px the links wrap to a full-width second row.

### The Seal
A drawn lock (15px, ink) placed before every setting that can never change after launch: in the review read-back, the editor's permanence line and the home proof. Sealed values set in 600 ink. A confirm box (20px, 6px radius, ink) acknowledges each sealed group.

### Charts
One ink line (1.75 stroke) over #EDEDED hairline grids with a 5% ink area fill, white-ringed ink dots, a dashed pewter crosshair and a white tooltip on the resting shadow. Split bars use the four split greys in 2px-gapped segments.

### Phase line and transaction list
Numbered circles (24 to 26px) joined by hairlines; current = ink fill, in-flight = ink border breathing a soft halo, landed = ink fill.

### Buy and sell (token page)
A panel beside the token's facts: a Buy/Sell segmented control, the amount in a suffixed input (SOL to buy, the token to sell) with one-tap picks under it (0.1, 0.5, 1 SOL and Max; 25%, 50% and All), the wallet's balances in small grey type, "You get about" above a hairline with the quote right-aligned, then the view's one large black button carrying the mark. The fee note sits under it in hint type. Errors are one plain sentence in danger red; a finished trade says what it bought or sold and links to Solscan.

### The Meteorite (home hero)
A WebGL smoky-glass meteorite refracting a fine dot grid, graphite where thick and clear where thin, with white fracture veins, a graphite dust trail and shards that bounce off it. It fades in over 1.2s, pauses off screen, and falls back to the plain radial-grey hero without WebGL.

## Do's and Don'ts

### Do:
- **Do** keep every surface in the neutral scale: paper ground, white surface, fog insets, hairline borders.
- **Do** show selection and progress in ink: black fill for chips, picks, toggles and steps; a 1px ink inset ring for tiles.
- **Do** put the white T-minus mark only inside large primary buttons, and keep one black primary button per view.
- **Do** mark every permanent setting with the drawn ink lock and confirm it on the review.
- **Do** label settings in plain words with Meteora's term in small print beside them.
- **Do** use the three soft shadows (contact, resting card, lifted) and nothing heavier.
- **Do** use the system ease `cubic-bezier(.2, .7, .2, 1)` with 0.15s for state changes and 0.2s for panels, and honour reduced motion.
- **Do** draw icons on the 24-unit grid at a 1.6 stroke with round caps; make option glyphs tiny charts on a faint baseline.

### Don't:
- **Don't** introduce a brand hue or an accent colour; brick red is reserved for errors.
- **Don't** use a dark theme; the system is light only.
- **Don't** use hard offset shadows or coloured glows.
- **Don't** use tracked uppercase labels above headings; tracked capitals belong to the ticker symbol alone.
- **Don't** use emoji or font glyphs as icons; draw them.
