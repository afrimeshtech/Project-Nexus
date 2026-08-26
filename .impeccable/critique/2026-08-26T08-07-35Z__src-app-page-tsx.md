---
target: AfriMesh consumer homepage (src/app/page.tsx)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-26T08-07-35Z
slug: src-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live badges, distance/ETA everywhere; no connectivity/freshness signal despite "patchy data" being a stated product condition |
| 2 | Match System / Real World | 4 | Metres/minutes/naira throughout; "New seller" not zero stars; plain section titles |
| 3 | User Control and Freedom | 3 | Search + area-switch escape exist, but "Nearby outlets" has no "See all" and no `/shops` route exists anywhere — a hard dead end |
| 4 | Consistency and Standards | 4 | `ItemCard` anatomy fixed system-wide; thumb components share shape/radius by design |
| 5 | Error Prevention | 3 | Little destructive surface on this page to test against |
| 6 | Recognition Rather Than Recall | 4 | Illustration-first browsing; trending list removes recall burden |
| 7 | Flexibility and Efficiency | 2 | "Searched nearby" is global trending, not personal history, even when logged in |
| 8 | Aesthetic and Minimalist Design | 4 | Flat cards, one rationed accent, hairlines only — matches DESIGN.md closely, verified live |
| 9 | Error Recovery | 3 | Empty state was deliberately rewritten to fix a real UX mistake (documented in code) |
| 10 | Help and Documentation | 2 | One `/about` link is the entire in-context help for a product that names first-timers as a persona |
| **Total** | | **32/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: Grounded, with one soft spot. `SellerArt.tsx`/`ProductArt.tsx` are hand-authored SVG systems keyed to real local goods and business types, not stock icons. The "Searched nearby" rail surfaces real Lagos-context queries (diesel + generator sitting next to groceries is not a generic guess). The hero background is a literally-drawn mesh lattice replacing what a code comment says used to be generic blurred blobs. The soft spot: the hero copy ("One search. Real inventory, nearby. Pay. Delivered. Restocked.") is four fragments bolted onto a sentence — inconsistent with DESIGN.md's own stated voice ("plain and concrete: say the thing to the person actually reading it").

**Deterministic scan**: CLI scan (`detect.mjs` over `page.tsx` + commerce/brand/shell components) found 2 advisory findings — both 10px font sizes off the DESIGN.md type ramp, in `OrderBits.tsx` (not part of this homepage; flagged because the scan covered sibling components). Browser-injected detector found 23 hits: 1x a `transition: padding` shorthand flag, and 22x "cyan gradient background."

**False positive flagged**: the 22x "cyan gradient" hits are almost certainly the Category Tile / thumbnail gradient — DESIGN.md names this exact treatment ("Tile Teal to Brand Deep, 160deg gradient") as the one deliberate, documented exception to flat-at-rest design, specifically because illustrated tiles are meant to read as objects sitting on the page. A generic hue-distance heuristic is reading teal as cyan and flagging a brand-specified pattern as if it were decorative AI slop. Treat this finding as resolved, not actionable.

## Overall Impression

This is a considerably more deliberate product than an earlier screenshot-only critique gave it credit for — the illustration system, the empty-state rewrite, and the mesh background are all evidence of real design authorship, and DESIGN.md's own "Do's and Don'ts" already pre-empt most generic patterns. The real gaps are narrower and more structural than cosmetic: an outlet list with no way past 8 results, a couple of businesses visually colliding because a keyword list doesn't cover their name pattern, and a hero sentence that doesn't read the way the rest of the product's voice does.

## What's Working

- **The mesh background is engineered, not decorated** — two crossed repeating-linear-gradients plus a node grid, purpose-built to replace an earlier generic gradient wash.
- **`SellerArt`/`ProductArt` resolve by keyword + a stable per-name color hash** — every business gets a durable, reseed-safe identity without a lookup table.
- **The empty state's UX fix is real and documented**: swapping "Register a business" for an area-switch as the primary action.

## Priority Issues

**[P1] "Nearby outlets" has no way out**
- Why it matters: 8 outlets render with no "See all" link and no `/shops`-style route exists anywhere in `src/app`. A shopper whose preferred shop isn't in the first 8 has no path forward.
- Fix: Add a "See all outlets" action and a directory route, mirroring `/search`'s pattern for products.
- Suggested command: /impeccable harden

**[P2] Two outlets silently collide on the same illustration**
- Why it matters: `resolveSellerForm`'s keyword list doesn't match "BuildRight Materials" against anything, so it falls to the generic `storefront` default — identical to "Grace Stores," distinguished only by two adjacent warm accent tones.
- Fix: Add a materials/hardware keyword branch to `KEYWORDS` in `SellerArt.tsx`.
- Suggested command: /impeccable polish

**[P2] Hero copy reads as fragments, not a sentence**
- Why it matters: "One search. Real inventory, nearby. Pay. Delivered. Restocked." doesn't match DESIGN.md's own stated voice.
- Fix: Rewrite as one or two natural sentences.
- Suggested command: /impeccable clarify

**[P3] No visual "Verified" trust signal on outlet cards**
- Why it matters: The section's own subtitle claims "Verified shops closest to you," but nothing on `SellerThumb` or the outlet card visually reinforces that.
- Fix: A small verified mark on the thumb, consistent with the no-thick-border rule.
- Suggested command: /impeccable delight

**[P3] No personalization beyond the name**
- Why it matters: "Searched nearby" is global trending even for a logged-in user with their own search history.
- Fix: Surface the user's own recent searches when a session exists.
- Suggested command: /impeccable typeset

## Persona Red Flags

**Jordan (First-Timer)**: No inline reassurance about escrowed payment safety at the point of browsing — that trust story lives only behind `/about`.

**Casey (Mobile)**: Structurally solid — verified live at 375px with zero horizontal overflow and confirmed 44px header touch targets. The one mobile-specific pain point is the outlet-grid dead end above.

## Minor Observations

- `OrderBits.tsx` (lines 44, 60) uses 10px text, below even DESIGN.md's smallest defined token (Eyebrow, 11.2px) — outside this homepage's scope but a real, fixable deviation.
- `trendingSearches(6)` renders 6 items against DESIGN.md's own <=4-ideal framing — low-cost since it's a scan, not a forced choice.
- The single "transition: padding" shorthand flag from the browser detector is unconfirmed against DESIGN.md's "longhand only" transition rule — worth a quick manual check, not urgent.

## Questions to Consider

- If "verified" is core positioning, why does it appear nowhere as a visual mark on the exact cards where a shopper decides which shop to trust?
- Was the outlet grid's 8-item cap with no exit a deliberate pilot-scope decision, or did it just inherit the product grid's pattern without its "See all" link?
