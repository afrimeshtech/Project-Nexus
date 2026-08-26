# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Seven personas exist in the schema and the tier model. **Three are live**; four
are switched off behind the `FUTURE-DASHBOARD` marker and reversible one at a
time (`docs/dashboards.md`).

| Persona | Role / org type | Entry | Status |
| --- | --- | --- | --- |
| Retail outlet — the shopkeeper | `outlet`, tier 4 | `/partner` | **live, primary** |
| Consumer — the shopper | `consumer`, tier 5 | `/` | live |
| Platform staff | `platform_admin`, `super_admin`, `auditor` | `/admin` | live |
| Merchant / wholesaler | `merchant`, tier 3 | — | switched off |
| Dealer warehouse | `warehouse`, tier 2 | — | switched off |
| Manufacturer | `manufacturer`, tier 1 | — | switched off |
| Delivery partner | `logistics` org | — | switched off |

**The retail outlet is the primary user.** When the shopkeeper's needs and the
shopper's conflict, the shopkeeper wins: without stocked, verified shops there
is nothing to buy. This is a supply-side-first market.

The `auditor` role is a read-only variant of the admin console. Its branch has
never been rendered or verified — see Capabilities and Constraints.

### The usage scene

Both sides are on phones. The confirmed device mix is **budget Android on
patchy mobile data**, **mid-range Android on decent 4G**, and **a meaningful
share of iPhone users**.

Laptops and tablets were explicitly *not* selected, including for the retailer.
This is the durable fact most likely to be assumed away: a retail dashboard —
inventory, incoming orders, wallet, settings — is conventionally designed for a
counter and a big screen, and here it is not. Dense tables, hover-dependent
controls, and desktop-width layouts are failures on the primary surface for the
primary user.

Patchy data is a stated condition, not an edge case. Payload budgets, tolerance
for a dropped request, and honest degradation are product requirements.

## Product Purpose

AfriMesh is a **Proximity Commerce & Payment Infrastructure Platform**. It
answers one question for a buyer: *what is actually in stock near me right
now, and can I get it?*

It replaces guesswork — walking to a shop that may not have the item, or
ordering from a distant warehouse — with live inventory from verified sellers
close enough to deliver quickly, paid for through an escrowed wallet.

Success is a working local market: real shops keeping real stock accurate, real
buyers finding it, and money moving safely between them.

## Positioning

The mechanism a neighbouring product could not truthfully copy is the
combination of:

- **Live nearby stock, not a catalogue.** Search runs over inventory that a
  verified seller physically holds now, ranked by availability, distance,
  price, rating and delivery time.
- **An enforced supply chain.** Trade is legal only one tier apart —
  Manufacturer → Dealer warehouse → Merchant → Retail outlet → Consumer. A
  buyer at tier N may buy only from tier N−1.
- **Escrowed settlement.** A double-entry ledger holds funds until delivery,
  so neither side has to trust the other first.

## Operating Context

- **Pilot market:** Ikeja, Lagos. This is a **real pilot with real merchants
  and real buyers**, not a demo or a portfolio artefact. Real money, real
  disputes, real support load, and onboarding people who have never used the
  product are all in scope.
- Buyers shop one-handed, often in a hurry, often outdoors, on mobile data
  that drops.
- Shopkeepers run their side of the business on the same phone they sell from.
- Distances and delivery times are shown in the buyer's own terms (metres,
  minutes) rather than as abstract logistics data.

## Capabilities and Constraints

**Architecture.** A modular monolith, per the PRD's CTO directive: one
deployable app, PostgreSQL as primary store, hard module boundaries, internal
service interfaces so later microservice extraction is a refactor not a
rewrite. Domain modules under `src/modules/` contain no React or Next.js
imports, which is what lets `scripts/seed.ts` and `scripts/verify.ts` run them
under plain Node.

**The tier invariant** is enforced in three independent places — `lib/tiers.ts`
(`canTrade`), `modules/orders/service.ts` (`placeOrder` rejects before writing),
and an `orders_tier_rule` CHECK constraint in the database. A new caller or a
bad migration cannot bypass all three. This redundancy is deliberate and must
be preserved.

**Event log.** Every meaningful state change publishes through
`modules/events` into an immutable `event_log`, with subscribers running inside
the publisher's transaction. Event names match the inventory specification
exactly (`StockAdded`, `StockReserved`, `StockReleased`, `StockSold`,
`StockReturned`). That table is the seam where a real broker is introduced.

**Database.** `src/db/schema.sql` is the source of truth — plain PostgreSQL, 29
tables. The driver is selected by `DATABASE_URL` alone: PGlite (PostgreSQL 16
compiled to WASM, in `./.pgdata`) when unset, node-postgres when set. PGlite is
single-process and single-connection — fine for development, and **production
must use a real server with a connection pool.**

**Simulated, because no credentials exist yet:**

- Payments run through a mock gateway.
- Notifications print to the console while being stored and marked delivered
  exactly as a real transport would.

Both are integration seams, not missing features. Going live with real
merchants requires closing both.

**Deliberately deferred** to hold the PRD's own MVP line: AI recommendations,
demand forecasting and dynamic pricing (Phase 3); Elasticsearch; Kafka /
RabbitMQ; graph database, cross-border commerce, API marketplace (Phase 3);
Flutter mobile apps — the web app is mobile-first instead; voice and image
search; split and scheduled payments; live rider tracking on a map and
multi-stop route optimisation; credit, lending and insurance (BRS Phase 4).

**Known open items:**

- The `auditor` read-only console branch has never been rendered. Six admin
  pages compute `readOnly` and a server guard rejects auditor writes, but
  whether the UI actually disables write controls rather than relabelling a
  badge is unverified.
- `env(safe-area-inset-bottom)` behaviour and `(pointer: coarse)` targets have
  never been checked on a real device.

## Brand Commitments

Binding, from the Brand Identity & Corporate Style Guide (Volume A), and
already encoded in `src/app/globals.css`:

- **Palette:** AfriMesh Green, Deep Emerald, Dark Charcoal, Warm Sand, Slate,
  Light Gray.
- **Type:** Inter for UI, IBM Plex Sans for technical surfaces.
- **Shapes:** rounded, flat, minimal detail.
- **Logo:** rebuilt as vector in `components/brand/Logo.tsx`, drawing its
  colours from the tokens. Fixed proportions, no shadows, no outlines, 32px
  minimum size. These are guide rules honoured by construction.
- **The mesh motif** — nodes joined by edges — is the brand's own metaphor and
  is drawn, not approximated with a gradient wash.

Voice is plain and concrete: say the thing to the person actually reading it.
Distances in metres, times in minutes, prices in naira.

## Evidence on Hand

- **Six specification documents** in the parent directory (`../`): Business
  Requirements Specification, Product Requirements Document (Vol. B), System
  Architecture Document (Vol. III), Inventory Engineering Recommendation,
  Brand Identity & Corporate Style Guide (Vol. A), and the Project Nexus
  infographic. These governed the build and remain the authority on scope.
- **A seeded Lagos pilot market** (`scripts/seed.ts`) — outlets, catalogue,
  inventory, orders, wallet entries. This is *fixture data*, not real trading
  history.
- **`npm run verify`** — 42 business-rule checks against the real service
  layer; `npm test` — 141 unit tests and architecture guards.
- **`docs/cto-review-response.md`** — a written response to CTO review.
- **`website-audit.md` and `website-audit-followup.md`** — experience audits
  with coverage gaps stated.

**Absences future work must not fabricate:** there are no real customers, no
testimonials, no case studies, no press, no usage metrics, no revenue figures,
and no live transaction history. Nothing may present pilot fixture data as
evidence of traction.

## Product Principles

1. **The shopkeeper is the customer.** Supply comes before demand. A feature
   that delights buyers but adds work for a shop with no staff is a net loss to
   the market.
2. **The phone is the only device — for everyone.** Including the retailer.
   Any surface that assumes a counter, a mouse, or a wide viewport has assumed
   away the primary user.
3. **Stock accuracy is the product.** Everything else — ranking, delivery,
   escrow — is worthless if the item is not actually on the shelf. Protect the
   inventory engine's correctness over any other consideration.
4. **Real money demands three locks.** Financial and trading invariants are
   enforced redundantly (application, service, database) on purpose. Never
   reduce that to one.
5. **Degrade honestly.** On a bad network or a failed integration, say what
   happened and what to do. Never show a success state the system has not
   earned.

## Accessibility & Inclusion

Per the Brand Identity guide and carried in the implementation: visible
keyboard focus on every interactive surface, large touch targets,
`prefers-reduced-motion` honoured, semantic tables with captions, and wide
content scrolling inside its own container rather than the page.

Standard in practice: **WCAG 2.2 AA**, with platform touch guidance (44pt
Apple / 48dp Material) applied on coarse pointers rather than treating the
24×24px web minimum as sufficient for a market shopper's thumb.

Product-specific needs: first-time users who have never used a commerce app,
one-handed use, outdoor daylight, and interrupted sessions on unreliable data.
