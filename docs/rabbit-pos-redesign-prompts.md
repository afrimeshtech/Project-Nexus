# Rabbit POS reference → AfriMesh: redesign prompts

Source: a reference screenshot sheet of "Rabbit — Point of Sale," a food/retail
POS app (splash, login, OTP, product grid, parties/transactions, cash
transactions, add-product). Compared against `AfriMesh/afrimesh-platform`'s
current implementation and `DESIGN.md` as of 2026-08-26.

## Scope constraint — read this before running any prompt below

**Keep the AfriMesh color palette exactly as documented in `DESIGN.md`.**
Forest Ground, Price Orange, Deep Price, Tile Teal, the neutrals, the status
colors — none of them change. Rabbit's navy/teal/coral palette is reference
for *structure, elevation, and component shape only*, never for hue. Every
prompt below is written to reuse existing DESIGN.md tokens; none introduces a
new color. Typeface (Inter + IBM Plex Sans) and the logo are also binding
Brand Commitments per PRODUCT.md and are out of scope for the same reason —
treat them like the palette, not like a layout detail.

Two of the prompts below (#2 and #6) require a **conscious edit to a named
rule in DESIGN.md**, not just a component change. Don't let those land as
silent drift — the prompt says exactly what to rewrite and why.

Run these one at a time. Each is self-contained enough to hand to a fresh
Claude session, but running them in this order avoids rework (nav shape
before nav content, DESIGN.md rule changes before the components that depend
on them).

---

## 1. Floating, inset bottom navigation (shape only, not content)

> Change the consumer bottom navigation in `src/components/shell/ConsumerShell.tsx`
> from a full-width bar flush to the screen edges into a floating rounded pill,
> inset with margin from the left, right, and bottom edges — matching the
> reference's floating nav silhouette. Keep Forest Ground as the fill color
> (do not introduce navy or any new color). Keep every icon labeled with text
> beneath it exactly as today — the reference's nav is icon-only, but ours
> scored well on Recognition Rather Than Recall specifically because of the
> labels, and dropping them would be a regression, not a match worth making.
> Preserve the five existing items, their hrefs, and the badge on Messages.
> Adjust `<main>`'s bottom padding and the root `scroll-padding-top` if the
> floating pill's margin changes the reserved space at the bottom of the
> viewport. Verify at 375px width that the pill doesn't collide with content
> above it or get clipped at the screen edges.

## 2. Adopt resting elevation on cards — and rewrite the Flat-At-Rest Rule consciously

> DESIGN.md's Elevation & Depth section currently states cards carry no
> shadow at rest, only on hover ("Flat-At-Rest Rule"). The Rabbit reference
> uses a soft resting shadow on every card as its default state. Before
> touching any component: rewrite the Flat-At-Rest Rule section in DESIGN.md
> itself to describe the new default — a resting `shadow-subtle` (from the
> existing three-step Shadow Vocabulary, tinted brand green per the Tinted
> Shadow Rule, not black) on `Card` and `ItemCard`, with `shadow-strong` still
> reserved for hover/interactive state as today. State explicitly in the
> rule's text that illustrated tiles remain the one component with a
> stronger, more deliberate shadow, so that exception doesn't get lost. Only
> after DESIGN.md reflects the new rule, apply the resting shadow to the
> `card` and `item-card` component classes in `globals.css` and confirm nested
> cards (which DESIGN.md separately bans) don't start compounding shadows
> anywhere in the app.

## 3. In-card quantity stepper on the product tile

> On `ProductThumb`-leading cards used for browsing a single shop's shelf
> (`OfferCard.tsx` with `lead="product"`, and any partner catalogue/inventory
> tile that shows a live quantity), add a compact stepper control
> (`−`, count, `+`) as a pill that overlaps the bottom-right corner of the
> product photo well, matching the reference's placement. Use the existing
> `button-primary` treatment (Price Orange fill, Accent Ink text/icons) for
> the stepper's fill, at the existing 36px/44px target-size floor from the
> Buttons spec. Do not add this control to `ProductResultCard` (the
> price-comparison card) — that card compares sellers, not quantity, so a
` stepper there has no meaning; scope this to cart-building contexts only where
> `AddToCart` already exists, and reconcile with it rather than shipping two
> quantity controls on the same card.

## 4. Selection checkmark badge — reconciled with the existing stock pill, not stacked on it

> The reference shows a small checkmark badge on a product photo when the
> item is selected/in cart. We already use that exact corner position for the
> Status Pill (in stock / low stock / out of stock — `stockState()`). Do not
> place both on the same corner. Instead: when an item is in the cart, replace
> the stock-state pill with a checkmark badge in the same position, same size,
> using the existing `success-ink`/`pill-in` tone (not a new color) — the
> stock-state pill returns the moment the item leaves the cart. Wire this
> through wherever `AddToCart`'s quantity is already tracked so the two states
> can never both be true or both be absent.

## 5. Segmented pill-tab container for grouped filters

> Where the app currently renders loose, wrapped `FilterChip` rows (e.g.
> `/search`'s Category filter, or any future Customer/Supplier-style toggle),
> add an alternate segmented presentation: chips grouped inside a single
> rounded track (`surface-muted` background, `rounded-pill`, one shared
> container) rather than freely wrapping. Reuse the existing
> `chip-selected`/`chip-unselected` tokens unchanged for the active/inactive
> states — this is a container/grouping change only, no new color or shape
> token. Use this segmented variant specifically for small, fixed-cardinality
> toggles (2-4 options) where "which one is active" should read as a single
> control, not a filter row; keep the existing loose `FilterChip` pattern for
> larger, open-ended option sets like Category.

## 6. Two-tone dual-action bar, built from existing tokens only

> The reference pairs two full-bleed accent colors in one action bar
> ("New Sale" / "Purchase"). Reproduce the *idea* — two visually distinct
> simultaneous actions for inbound vs. outbound money — using only
> already-documented tokens: the inbound/create action (e.g. "New Sale",
> "Payment In") takes the existing `button-primary` treatment (Price Orange
> fill, Accent Ink text); the outbound/spend action (e.g. "Purchase") takes
> the existing `button-danger` treatment (`#c0392b`, white text) that
> DESIGN.md already specifies as "held visually apart from the primary
> action." Lay them out as two adjacent pill buttons in one sticky bottom bar
> on the relevant partner screens (sourcing/purchasing flows), matching the
> reference's proportions. Do not introduce a teal or any third accent to
> make this pairing — if the orange/red pairing reads as insufficiently
> distinct once built, that's a signal to revisit spacing or add a leading
> icon per button, not to add a color.

## 7. Auth screens: card-free, minimal presentation option

> Prototype an alternate `AuthLayout` variant that drops the full-bleed Forest
> Ground backdrop and the white `Card` wrapper, placing the form directly on
> the page background (`Page` token, not pure white — DESIGN.md's Tinted
> Ground Rule still applies) with the AfriMesh logo centered above the
> heading, matching the reference's minimal single-column auth screens. Keep
> every field, label, error state, and the footnote exactly as they exist
> today in `AuthForms.tsx` — this is a container/backdrop change only, not a
> content or copy change. Build it as an opt-in variant behind a prop first
> (`bare?: boolean` or similar) so it can be compared side-by-side with the
> current card-on-dark version before committing to replacing it everywhere.

## 8. Heavier display weight within Inter (not a typeface swap)

> The reference's headings read rounder and heavier than our current Display
> and Heading tokens. Do not change the font family — Inter stays, per the
> One Family Rule and the binding Brand Commitment. Instead, test increasing
> the Display and Display-Small font-weight tokens in DESIGN.md (currently
> 620) toward Inter's 700 weight on a couple of real screens (homepage hero,
> a page title) and compare readability and tracking at both ends of the
> fluid clamp() range. Only adopt the change if it doesn't require loosening
> the existing negative letter-spacing to stay legible at display size — if it
> does, that's a sign 700 is fighting the tracking rule, not complementing it,
> and the weight bump should be abandoned rather than forcing both changes
> through together.

---

## Explicitly not being copied, and why

- **Icon-only bottom nav** — ours is labeled and that's a documented strength (see #1).
- **Navy/teal/coral palette** — out of scope per the scope constraint above.
- **A rounder/different typeface family** — out of scope; see #8 for the in-bounds alternative.
- **Checkmark badge stacked on top of the stock-state pill** — see #4 for the reconciled version instead of a literal copy.
