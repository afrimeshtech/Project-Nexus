---
name: AfriMesh
description: Live nearby stock from verified shops, framed like a market stall you can trust before you walk to it.
colors:
  forest-ground: "#123824"
  price-orange: "#ff9500"
  deep-price: "#c04a12"
  ink: "#203a2d"
  muted: "#636e6a"
  page: "#f0f2f0"
  surface: "#ffffff"
  surface-muted: "#f4f7f5"
  surface-strong: "#e5ebe7"
  price-tint: "#f5f0e8"
  accent-ink: "#1f3329"
  bar-ink: "#ffffff"
  field: "#f5f5f5"
  field-ink: "#1f3329"
  success-ink: "#14603f"
  coral-ink: "#b3271a"
  warning-ink: "#8a5a00"
  info: "#1b3a5c"
  pill-in: "#14603f"
  pill-low: "#b3271a"
  pill-out: "#3d4f47"
  well: "#edf3ef"
  category-card: "#123824"
  brand-deep: "#2d5a4a"
  line: "#2d4a3a"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 4.5rem)"
    fontWeight: 620
    lineHeight: 0.98
    letterSpacing: "-0.045em"
  display-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "clamp(1.9rem, 5vw, 3rem)"
    fontWeight: 620
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "clamp(1.15rem, 2vw, 1.4rem)"
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: "-0.018em"
  stat:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
  eyebrow:
    fontFamily: "Inter, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.13em"
  technical:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  brand: "1rem"
  card: "1.5rem"
  field: "1rem"
  pill: "9999px"
spacing:
  base: "0.25rem"
  tight: "0.5rem"
  gap: "0.75rem"
  gutter: "1rem"
  card-pad: "1.25rem"
  card-pad-lg: "1.75rem"
  section: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.price-orange}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.brand}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "#e08400"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.brand}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  button-ghost:
    textColor: "{colors.deep-price}"
    rounded: "{rounded.brand}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  button-danger:
    backgroundColor: "#c0392b"
    textColor: "{colors.surface}"
    rounded: "{rounded.brand}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.brand}"
    padding: "0.625rem 0.75rem"
    typography: "{typography.label}"
  chip-selected:
    backgroundColor: "{colors.price-orange}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  chip-unselected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  price-tag:
    backgroundColor: "{colors.price-tint}"
    textColor: "{colors.ink}"
    rounded: "0.625rem"
    padding: "0.125rem 0.5rem"
  bar:
    backgroundColor: "{colors.forest-ground}"
    textColor: "{colors.bar-ink}"
  status-pill-in:
    backgroundColor: "{colors.pill-in}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.5rem"
    typography: "{typography.technical}"
  status-pill-low:
    backgroundColor: "{colors.pill-low}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.5rem"
    typography: "{typography.technical}"
  status-pill-out:
    backgroundColor: "{colors.pill-out}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0.15rem 0.5rem"
    typography: "{typography.technical}"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.brand}"
    padding: "1rem"
    typography: "{typography.stat}"
  alert-danger:
    backgroundColor: "color-mix(in srgb, #e74c3c 15%, transparent)"
    textColor: "{colors.coral-ink}"
    rounded: "{rounded.brand}"
    padding: "0.625rem 0.875rem"
    typography: "{typography.label}"
  alert-success:
    backgroundColor: "color-mix(in srgb, #1a6b45 15%, transparent)"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.brand}"
    padding: "0.625rem 0.875rem"
    typography: "{typography.label}"
  category-tile:
    backgroundColor: "{colors.category-card}"
    textColor: "{colors.bar-ink}"
    rounded: "{rounded.card}"
    padding: "0.875rem 0.5rem 1rem"
    width: "6.75rem"
  item-well:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.card}"
  rating:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  skeleton:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.brand}"
---

# Design System: AfriMesh

## Overview

**Creative North Star: "The Verified Stall"**

A market stall you can trust before you walk to it. The deep green is the
awning that frames everything; the white card is clean stock laid out in
daylight; the warm sand under a number is the tag on the goods; and the orange
is used the way a shopkeeper uses a price tag — on the thing you can act on,
and nowhere else.

The frame carries the brand; the controls do not. This is the system's central
tension and it is deliberate. The world is a market stall, but the components
inside it are **refined and restrained** — quiet surfaces, precise spacing,
understated states. A button does not perform. Personality lives in the green
that wraps every screen, in the sand behind a price, in the mesh drawn into the
deepest surfaces — never in the chrome of a control. When those two pull
against each other, the frame wins and the control gets quieter.

Everything is built for a phone held in one hand, outdoors, on data that drops
— for a shopper *and* for the shopkeeper running their business on the same
device. Density is generous rather than tight: this is not a dashboard that
happens to be responsive, it is a phone product that happens to have a desktop
layout.

**Key Characteristics:**

- A deep forest frame around a bright, faintly-tinted page — never a white page
- Flat surfaces at rest; depth is a response to state, never decoration
- One vivid accent, rationed to what is actionable
- Fluid type that never needs a breakpoint to stay in proportion
- Tabular figures wherever numbers stack, so money lines up
- Every decorative motion strips out cleanly under `prefers-reduced-motion`

## Colors

A dark, saturated frame holding a bright neutral field, with a single warm
accent that earns its loudness by being rare.

### Primary

- **Forest Ground** (`#123824`): The frame. Header, bottom navigation, footer,
  and the deepest hero surfaces. Sampled from the logo artwork so the lockup
  sits in it with no visible edge. It is a *ground to place things on*, never a
  fill for small elements — a chip or a badge in this green reads as a hole in
  the page rather than an object on it. Illustrated tiles (category tiles,
  product and seller thumbnails) are the one sanctioned exception: flat Forest
  Ground, identical to the frame, because a second "brand green" for
  illustrated content read as an off-brand colour pick rather than as a
  deliberate distinction. See Category Tiles.
- **Price Orange** (`#ff9500`): Fills. Primary buttons, selected chips,
  notification badges. At 2.2:1 on white it is **a fill colour only and never a
  text colour** — it carries dark ink on top of it, never the reverse.
- **Deep Price** (`#c04a12`): The text-safe sibling at 4.97:1. Links, inline
  emphasis, focus rings, an eyebrow label inside a component (a filter
  group's name, a location line) — never above a page heading; see the
  Typography Don'ts. Everywhere the accent must be *read* rather than filled.

### Secondary

- **Price Tint** (`#f5f0e8`): Warm sand, sitting only behind a price. It is the
  tag on the goods — the one place a number gets its own ground.

### Neutral

- **Page** (`#f0f2f0`): The ground everything sits on. Faintly green-tinted, not
  white, because a white card on a white page has nothing to be a card against.
- **Surface** (`#ffffff`): Cards and raised panels — legible *because* the page
  behind them is not white.
- **Surface Muted** (`#f4f7f5`) / **Surface Strong** (`#e5ebe7`): The two steps
  between page and card, used for wells, inactive chips and inset rows.
- **Ink** (`#203a2d`): Body and heading text at 12.3:1. A green-black, not a
  neutral black — it belongs to the same family as the frame.
- **Muted** (`#636e6a`): Secondary text at 5.3:1. Desaturated to 5% so it reads
  as quiet rather than as another colour.
- **Field** (`#f5f5f5`) with **Field Ink** (`#1f3329`): Inputs sit on their own
  near-white ground rather than on the card, so a form is findable inside a
  dense page.

### Status

- **Success Ink** (`#14603f`), **Coral Ink** (`#b3271a`), **Warning Ink**
  (`#8a5a00`), **Info** (`#1b3a5c`): The `-ink` variants are the text-safe
  members of each family; the lighter siblings are grounds only.

### Named Rules

**The Rationed Accent Rule.** Orange marks what you can act on and what
something costs. Nothing else. If more than one element in a viewport is
orange, one of them is decoration and must be demoted.

**The Two Oranges Rule.** `#ff9500` fills, `#c04a12` reads. Orange text on a
light ground is always Deep Price; dark ink on an orange ground is always
Accent Ink. Neither substitutes for the other, ever.

**The Frame Is Not A Fill Rule.** Forest Ground wraps a screen. The moment it
appears as a small badge, pill, or icon chip, the hierarchy has inverted.

**The Tinted Ground Rule.** The page is never `#ffffff`. Card legibility
depends on the page being a step darker than the card.

## Typography

**Display and Body Font:** Inter (with `ui-sans-serif, system-ui, Arial`)
**Technical Font:** IBM Plex Sans (with the same fallback stack)

**Character:** One family doing nearly all the work, distinguished by weight and
tracking rather than by mixing voices. Display sizes run at 620 weight with
tight negative tracking (`-0.045em`) so headlines read as set rather than
scaled up; body runs at 400 with a generous 1.65 line-height for reading on a
phone in bad light. IBM Plex Sans appears only where content is genuinely
technical — API keys, identifiers, barcodes, timestamps — never as a costume
for "advanced".

### Hierarchy

- **Display** (620, `clamp(2.25rem, 6vw, 4.5rem)`, 0.98): Hero headlines.
  Fluid, so it never needs a breakpoint to stay in proportion. Trimmed from
  40→80px to 36→72px — the larger size read as oversized on /about and
  /showcase, the only two places this register is used.
- **Display Small** (620, `clamp(1.9rem, 5vw, 3rem)`, 1.06): Page titles.
- **Heading** (620, `clamp(1.15rem, 2vw, 1.4rem)`, 1.2): Section headings.
- **Stat** (600, `1.5rem`, 1.15, tabular): The number on a metric tile. Tabular
  figures are mandatory here.
- **Body** (400, `1rem`, 1.65): Running text. 16px is a floor, not a
  preference — anything smaller triggers input zoom on iOS.
- **Label** (500, `0.875rem`, 1.45): Controls, table cells, dense rows.
- **Eyebrow** (500, `0.7rem`, `0.13em`): Uppercase category and context labels
  *inside* components — a filter group's name, a card's field label.

### Named Rules

**The Tabular Money Rule.** Any figure that stacks — prices in a column, totals
in a summary, metrics in a row — is set in tabular figures. Right-alignment
alone does not align digits; proportional numerals go ragged and the column
reads as sloppy.

**The Sixteen Pixel Floor Rule.** Body text on any input-adjacent surface is
never below 16px. iOS zooms the viewport on focus otherwise, and the user loses
their place on a page they were mid-way through.

**The One Family Rule.** Hierarchy comes from weight, size and tracking. A
second typeface must earn its place by marking genuinely different content, not
by decorating the same content differently.

## Layout

A single centred column with a hard ceiling: **72rem** on consumer surfaces,
**80rem** on the admin console. Gutters are `1rem` at phone widths, opening
through `1.5rem` to `3rem` on wide screens.

Spacing is a 4px-based scale (`--spacing: 0.25rem`), used in a small number of
recurring steps: `0.5rem` inside tight groups, `0.75rem` between related
elements, `1rem` page gutters, `1.25rem` card padding rising to `1.75rem` above
the `sm` breakpoint, `2rem` between sections.

Breakpoints are Tailwind's defaults, and only one of them carries real
structural weight: **`sm` (640px)** is where the product switches between its
phone shell and its wide shell — bottom navigation appears below it and
disappears at and above it, the site footer does the reverse, and the header
collapses its location row into the icon row.

Fixed chrome reserves its own space: the bottom navigation is `fixed` at
`z-index: 40`, and `<main>` carries `7rem` of bottom padding below `sm` so
content is never trapped underneath it. A `scroll-padding-top` of `7.5rem` on
the root keeps the sticky header from covering anything the browser scrolls to,
including a keyboard focus target.

The z-index scale is named and total — `raised: 10`, `sticky: 20`, `bar: 30`,
`bottom-nav: 40`, `popover: 50`, `overlay: 60`. Ad-hoc z-index values are a
defect; a new layer gets a name in the scale.

### Named Rules

**The Phone-First Shell Rule.** Below 640px is the primary layout for *every*
persona, retailer included. A surface that only works with a sidebar, a wide
table, or a hover has been designed for a device the primary user does not
have.

**The No Horizontal Scroll Rule.** The page body never scrolls sideways at any
width down to 320px. Content that genuinely exceeds the viewport — a carousel,
a wide table — scrolls inside its own container.

## Elevation & Depth

**A soft plane at rest, not a flat cut-out.** Content surfaces carry
`shadow-subtle` at rest — the softest step in the Shadow Vocabulary below,
tinted brand green rather than black — reinforced by tonal layering — page →
surface-muted → surface → surface-strong → surface-deep — and a single
hairline (`1px`, brand green at 18% alpha). See the Resting Elevation Rule.
Hover is still what changes: `shadow-strong` and a lift, so the pointer still
produces a visible response rather than a surface that was already lifted.

There is one deliberate exception, and it is a class rather than a one-off:
**illustrated tiles**. A category tile or product thumbnail is artwork, not a
content surface — it carries a flat Forest Ground fill and a resting
`shadow-medium` plus a green cast, because it is meant to read as an *object
sitting on* the page rather than a panel cut into it. The distinction is the
shadow and inset-highlight treatment itself, not a separate colour — the fill
is exactly `--color-bar`, the same green as the frame. Everything that holds
text and controls stays flat; everything that is a picture may lift.

Shadows exist in a three-step scale and appear only when something is being
acted on or genuinely floats above the page.

### Shadow Vocabulary

- **Subtle** (`0 1px 2px …8%, 0 2px 4px -2px …8%`): The smallest lift; rarely
  used at rest.
- **Medium** (`0 2px 4px …8%, 0 6px 16px -6px …16%`): Mid-depth panels.
- **Strong** (`0 4px 8px …10%, 0 12px 32px -8px …24%`): The thing under the
  pointer, and overlays.

Every shadow is tinted with the brand green (`#2d4a3a`) rather than black, so
depth belongs to the palette instead of greying the page.

### Named Rules

**The Resting Elevation Rule.** A card carries `shadow-subtle` at rest, tinted
brand green per the Tinted Shadow Rule — never black. This applies to `Card`
and `ItemCard`; `shadow-strong` stays reserved for the hover and interactive
state, so the pointer still produces a visible change rather than a card that
was already lifted.

The shadow states the card's boundary the way the hairline does, at a lower
volume: it is the softest of the three-step Shadow Vocabulary, and a column of
nine cards reads as nine planes at the same height rather than nine decorated
boxes.

Exception, deliberate and not to be flattened into the rule above: an
illustrated tile (`brand-tile`, `category-card`) keeps its stronger, more
saturated shadow stack. The tile is meant to read as sitting *in* the card, so
it must stay the deepest element on it.

Nested cards remain banned — with a resting shadow, nesting compounds
elevation as well as border, which is exactly the decorated read this rule is
written to avoid.

**The Tinted Shadow Rule.** No black shadows. Depth is cast in brand green at
low alpha.

## Shapes

Rounded, flat, minimal detail — a brand-guide commitment honoured by
construction. Three radii carry the whole system:

- **Card** (`1.5rem` / 24px): Cards, panels, hero sections. The largest radius,
  used on the largest surfaces.
- **Brand** (`1rem` / 16px): Buttons, inputs, icon buttons, most interactive
  elements. Metric tiles also take 16px rather than 24px — at 96px tall a 24px
  corner starts eating the number.
- **Pill** (`9999px`): Chips, badges, status pills. Reserved for things that
  are *labels*, not containers.

Borders are a single hairline weight. **A coloured border above 1px does not
exist in this system** — no side-tabs, no accent bars, no thick left edges.
When something needs marking, it gets a tinted ground, not an edge.

The logo is vector, with fixed proportions, no shadows, no outlines, and a 32px
minimum size, drawing its colours from the tokens.

### Named Rules

**The Hairline Rule.** Borders are 1px. Emphasis is a ground, a weight, or a
size — never a thicker line.

## Components

Components are **refined and restrained**: quiet surfaces, precise spacing,
understated states. The brand is carried by the frame around them, so a control
should be recognisable by its shape and its target size, not by its colour.

Two conventions run through all of them. Every interactive element has a visible
`:focus-visible` outline — 2px Deep Price at 2px offset, never removed. And
every component that can be empty, loading, or in error has that state designed
rather than left to the browser.

### Buttons

- **Shape:** Softly rounded (`1rem`), `0.5rem 1rem` padding, 600-weight label at
  `0.875rem`, `inline-flex` with a `0.5rem` gap for an optional icon.
- **Primary:** Price Orange ground with Accent Ink text — dark on orange, never
  orange on light. Hover deepens to `#e08400`; disabled falls to the 16% accent
  tint at 60% opacity with `cursor: not-allowed`.
- **Secondary:** White ground, hairline border, Ink text; hover to Surface Muted.
- **Ghost:** Deep Price text on no ground; hover picks up the soft accent tint.
- **Danger:** `#c0392b` with white text, held visually apart from the primary
  action — never adjacent to it without space between.
- **Target size:** 36px minimum for a fine pointer, rising to **44px under
  `(pointer: coarse)`**. The floor lives in `@layer base` so a utility can raise
  it; an unlayered floor silently overrides every `min-h-*` in the app.
- **Async:** a button that submits disables itself and swaps its label
  ("Sign in" → "Signing in…"). It never spins silently.

**Dual-Action Bar.** Where a screen offers inbound and outbound money as two
simultaneous actions — a sale and a purchase — they sit as two adjacent pills
in one sticky bottom bar. Inbound takes `primary` (Price Orange fill, Accent
Ink label). Outbound takes `danger` (`#c0392b`, white label), which this
document already holds visually apart from the primary action.

This is the one place two filled actions share a bar; it is not a licence for
two primaries elsewhere. If the pairing reads as insufficiently distinct, the
remedy is spacing or a leading icon per button — never a third accent. No
teal, no new hue, is introduced to carry this pattern. See `DualActionBar` in
`components/ui.tsx`.

### Cards

- **Corner:** `1.5rem`. **Background:** Surface on a tinted Page.
- **Border:** One hairline. **Shadow:** `shadow-subtle` at rest, `shadow-strong`
  on hover — see Elevation and the Resting Elevation Rule.
- **Padding:** `1.25rem`, opening to `1.75rem` above `sm`.
- **Interactive variant:** hover lifts `4px` with `shadow-strong`, over `260ms`
  on the exponential ease-out. Transitions are written as **longhands, never the
  `transition` shorthand** — `press` and `card-interactive` are both
  single-class selectors landing on the same card, and the shorthand lets
  whichever is emitted last clobber the other, which made the lift snap.
- **A card that links** is a `block min-w-0` grid item wrapping the card, not a
  bare inline `<a>`. An inline anchor cannot stretch to `h-full` and cannot
  shrink below its content, which overflows the page at narrow widths.
- **Nested cards do not exist.** A card inside a card means the hierarchy needs a
  heading, not another container.

### Inputs

- **Style:** Field ground (`#f5f5f5`) with a hairline, `1rem` radius,
  `0.625rem 0.75rem` padding, Field Ink text and a muted placeholder.
- **Focus:** border shifts to Deep Price with a 2px ring at 30% alpha.
- **Icon variant:** the same class with left padding opened to `2.75rem`, so an
  icon never sits on top of the placeholder.
- **Label:** always visible, never placeholder-only.
- **Error:** message rendered *below* the field, wired with `aria-describedby`,
  inside a live region that is **mounted before the text changes** — a region
  that appears at the same moment as its message is not reliably announced.

### Chips

- **Selected:** Price Orange ground, Accent Ink text, pill radius.
- **Unselected:** Surface ground, Muted text, hairline border.
- **Minimum height 30px**, comfortably over the 24×24 pointer-target floor.
- Chips wrap before they shrink; a `+n` overflow summary must be operable, not a
  dead label.

### Status Pills

The solid chip laid over a product photo, in the technical face at `0.65rem`,
600 weight, white text on a solid ground, pill radius, absolutely positioned
`0.5rem` from the well's top-left corner.

- **In stock** — `#14603f` · **Low stock** — `#b3271a` · **Out of stock** —
  `#3d4f47`
- State is derived in exactly one place (`stockState(qty, lowAt = 5)`) so every
  surface agrees on what "low" means. Never re-derive it inline.
- The three grounds differ in lightness as well as hue, so the state survives a
  colour-blind reader — and the label is always present regardless.

### Metric Tiles

The dashboard primitive: one number, and nothing competing with it.

- Surface ground, soft hairline, `1rem` radius (not `1.5rem` — at 96px tall a
  24px corner starts eating the number), and a **2px top border** that is the
  tile's only ornament. Hover turns that top border Price Orange.
- Label in the Eyebrow register, value in Stat with tabular figures, optional
  hint in Muted beneath.
- This replaced a version carrying a gradient, an inset accent bar, a drop
  shadow, a coloured glow, a hover lift and a travelling sheen — six effects on
  a box whose whole job is to show one number, repeated seventeen times across
  the dashboards. That stack is what makes a screen read as decorated rather
  than designed. Do not rebuild it.

### Alerts

- `1rem` radius, `0.875rem 0.625rem` padding, a hairline in the tone's colour at
  40% and a ground at 15%, with the tone's `-ink` text.
- **Danger** and **warning** take `role="alert"`; **success** and **info** take
  `role="status"`. Urgency is a semantic decision, not a colour choice.
- Tones: danger (Coral), warning, success, info — each using its text-safe
  `-ink` member for the words and the lighter sibling for the ground.

### Rating

- Five stars in Price Orange at 12px, **`aria-hidden`**, followed by the figure
  and the count in Muted. The stars are decoration; the number carries the
  value, so a screen reader reads "4.5 (12)" rather than five icon names.
- Values round to the nearest half.
- **With no ratings yet it renders "New seller"**, not zero stars. An empty
  five-star row reads as a bad rating rather than an absent one.

### Loading

- Skeletons, not spinners, for anything over a second. A highlight sweeps across
  the block — `linear-gradient` at 100°, `220%` background-size, 1.6s linear —
  rather than the whole block blinking, which reads as broken.
- Skeleton blocks reserve the final layout's dimensions so nothing shifts when
  the content lands.

### Navigation

- **Header:** Forest Ground bar, sticky at `z-index: 30`, condensing its padding
  and hiding the location row once pinned (an IntersectionObserver sentinel, not
  a scroll listener). Icon buttons are 44px, 8px apart, and shift their
  background on hover — **they do not scale**; a 10% scale on a 44px target
  moves its edges ~4px and makes a row of them twitch.
- **Bottom navigation:** below `sm` only, floating — `fixed`, inset `0.75rem`
  from every edge rather than flush, `radius-card`, `bar-depth-float`'s
  downward shadow instead of the flush bars' upward `bar-depth-top` — at
  `z-index: 40`, Forest Ground, five items maximum, each icon **with** its
  label, at 97×58px. `<main>` reserves `pb-32` beneath it (up from `pb-28`)
  to keep the inset from eating into the last row of content.
- **Sidebar (admin/partner):** its own scroll context, independent of the page.
- **Skip link:** the first focusable element on every shell, off-screen until
  focused. Nine tab presses to reach content is not navigable.

### Category Tiles

The signature illustrated component, and the stated exception to the Resting
Elevation Rule.

- Fixed `6.75rem` (108px) wide so a scrolling row keeps an even rhythm whether
  the name is "Pharmacy" or "Building Materials". Padding trimmed to
  `0.625rem 0.5rem 0.75rem` and the illustration to 56px (from 72px), so the
  tile reads closer to square — a row of five square tiles reads as one band,
  where the taller original read as a column of towers.
- Flat Forest Ground fill — the same exact `#123824` as the header, the bottom
  nav, and the mesh background, not a gradient and not a second green —
  hairline border, `1.5rem` radius, an inset white highlight at 14%,
  `shadow-medium`, and a green cast beneath. It is an object on the page, not
  a panel cut into it.
- Entrance settles from `scale(0.94)` on the exponential ease-out. It must not
  overshoot past `1` — an overshoot pushes the tile beyond the track it scrolls
  in and produces a transient horizontal overflow.
- The row is a `scroll-x` snap container; the tiles scroll inside it, never the
  page.

### Item Card

The catalogue card, whose anatomy is **fixed** so a grid of them scans the way a
table does: photo well with the stock chip, identifier in the technical face,
name, label/value rows carrying the numbers, then one way in.

Because every card puts the same thing in the same place, the eye compares down
a column instead of re-reading each card from the top. The well is a `16/10`
aspect ratio on the Well ground (`#edf3ef`). The photo and the name both link,
and the footer repeats that target with `tabIndex={-1}` — one keyboard stop per
card, not three to the same place.

### Signature: the Price Tag

The one component where the brand is allowed inside a control. A price sits on
its own warm sand ground (`#f5f0e8`), `0.625rem` radius, pulled `0.5rem` left so
it aligns optically with the text above it, in tabular figures. Hover deepens
that same ground.

It previously carried a 3px orange bar down its left edge; that was removed. The
ground *is* the tag, and a thick coloured edge on a small element is the most
recognisable tell of a generated interface.

## Do's and Don'ts

### Do:

- **Do** frame every screen in Forest Ground (`#123824`) and place content on
  the tinted Page (`#f0f2f0`). Never a white page.
- **Do** use Price Orange (`#ff9500`) as a fill with Accent Ink on top, and
  Deep Price (`#c04a12`) whenever the accent must be read.
- **Do** set every stacking number in tabular figures.
- **Do** design the phone layout first for **every** persona — the retailer is
  on a phone too.
- **Do** keep surfaces flat at rest and let depth answer a state change.
- **Do** name any new layer in the z-index scale rather than picking a number.
- **Do** give decorative motion a clean exit under `prefers-reduced-motion` —
  nothing may depend on an animation having run.
- **Do** theme the surfaces you did not draw: selection, caret, focus rings and
  scrollbars all ship with browser defaults that belong to no design system.

### Don't:

- **Don't** put a coloured border above 1px on anything — no side-tabs, no
  accent bars, no thick left edges. This is the single most recognisable tell
  of a generated interface, and it is banned outright.
- **Don't** use gradient text, glow halos, text-shadows behind coloured text,
  or bounce/elastic easing. All four were removed deliberately; reintroducing
  any of them is a regression.
- **Don't** treat the shopkeeper as anything other than a customer. The
  retailer surface is a product someone chooses to use, not a back-office form
  they are made to fill in. Any pattern that assumes a supplier rather than a
  customer is wrong here.
- **Don't** borrow from Western grocery-delivery apps — promo tile grids,
  countdown urgency, discount confetti, basket-size pressure. This market's
  customer is the shop, not the impulse.
- **Don't** reach for crypto/fintech dark mode — dark surfaces with neon
  accents and a chart-heavy hero. Wrong signal for real money in a physical
  local market.
- **Don't** build page structure from same-size icon + heading + text card
  grids, and never nest a card inside a card.
- **Don't** put an eyebrow above a page heading. The Eyebrow role exists for
  labels *inside* components; a heading carries its own weight.
- **Don't** use Price Orange as a text colour, or Forest Ground as a small
  fill.
- **Don't** rely on hover to reveal anything. There is no pointer on the
  primary device.
- **Don't** use emoji or Unicode glyphs as icons. Icons are drawn SVG at one
  consistent stroke weight.
