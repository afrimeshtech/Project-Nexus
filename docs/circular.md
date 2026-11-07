# AfriMesh Circular — integration pathway

AfriMesh Circular is the circular-economy materials network, specified in
**"AfriMesh Circular — Technical Architecture and Implementation
Specification"** (`AfriMesh Circular.pdf`): businesses that generate
reusable, recyclable or recoverable materials are matched with businesses
that process, aggregate or buy them — by material, quantity, quality, price
and distance.

It is **built into the architecture and switched off**. Nothing a shopper,
retailer or administrator sees has changed. This document is the pathway from
here to launch. Of the specification's §17 deliverables it covers the
integration assessment, schema, matching design, transaction states, Pay and
Logistics mapping, security, phasing and risks; an entity-relationship
diagram and a time estimate are still to do.

## The switch

`src/lib/launch-circular.ts` → `CIRCULAR_LAUNCHED = false`.

While false, `/api/v1/circular/*` answers **501 not_implemented** for every
method and no screen links to Circular. Nothing runs in the background.

`grep -rn FUTURE-CIRCULAR src` lists every place that changes at launch.

## How it fits — and how it differs from ProductDNA

| | ProductDNA | Circular |
| --- | --- | --- |
| Specification's stance | an independently governed domain | "a native modular component of the existing AfriMesh Commerce architecture… not a separate application" (§1, §16) |
| Database | own schema, no foreign keys into Commerce | `public`, `circular_` tables with **real foreign keys** to `organisations`, `users`, `payments`, `deliveries` (§6) |
| Businesses and roles | its own manufacturer registry | **existing** businesses; roles are capabilities on the account, never a second account (§4) |
| Payments, delivery, location | not involved | **reuses** AfriMesh Pay, AfriMesh Logistics and `lib/geo` (§7.4, §10, §11) |

Circular does keep its own resource catalogue and listings: industrial
materials in tonnes and litres must not be pushed into the retail products and
inventory (§5). A product can still have a ProductDNA identity while a
material it becomes is classified by Circular's taxonomy (§3).

## What is built

| Area (spec §) | Status | Where |
| --- | --- | --- |
| Database (§6) — 10 tables, constraints, indexes | **built** | `src/db/circular.sql` |
| Taxonomy (§5.1) — 8 categories, 33 materials, database-driven | **built, seeded** | `circular_resource_categories`, seed at the end of `circular.sql` |
| Business capabilities (§4) | **built** | `service.ts` — `grantCapability`, `setCapabilityVerification` |
| Listings and availability (§5.2, §13) | **built** | `service.ts` — `createListing`, `setListingAvailability`; `states.ts` |
| Atomic quantity reservation (§13, test 12) | **built** | `service.ts` — `reserveListingQuantity` |
| Requirements, discovery and matching (§7) | **built, tested** | `matching.ts` (pure engine), `service.ts` — `postRequirement`, `discover`, `recordMatches` |
| Enquiries (§9 discovery stage) | **built** | `service.ts` — `sendEnquiry`, `setEnquiryStatus` |
| Transaction state machine (§9) | **built, tested** | `states.ts` — `canTransitionTransaction` |
| "Paid" only when AfriMesh Pay says so (§9, §10, test 9) | **enforced in the database** | trigger `circular_require_verified_payment` |
| Commerce Graph events (§12) | **built** | `circular.*` events in `modules/events` |
| Transactions, Pay and Logistics flows (§10, §11) | not started | Phase 4 |
| Screens and API endpoints | not started | at launch |

Status sets the specification names without listing values (listing type,
condition grades, replenishment interval, requirement and match statuses)
carry a minimal set marked **PROVISIONAL** in the SQL.

## Matching (§7)

`matching.ts` scores each candidate 0–100 on the specification's factors with
its initial weights — material 30, proximity 25, quantity 20, condition 15,
price 10. Weights are read from `platform_settings` key
`circular.match_weights` (the defaults apply until it is set), so they change
without a deploy (§7.3).

- **Not offered at all:** an unverified seller, a different material
  category, units that do not convert, outside the requirement's distance,
  below its minimum quality, or a minimum order larger than the requirement.
- **Offered but not "fully qualified":** fails a mandatory specification, or
  cannot supply the whole quantity alone (§7.3).
- **Multi-source (test 5):** with `accepts_partial`, `planSourcing` combines
  the best listings until the requirement is met, and says when it cannot be.
- **Units:** kg↔tonne and litre↔m³ convert; mass and volume never do (that
  needs a per-material density), and counted units (bales, components) only
  match themselves.

`discover` narrows candidates in SQL with the platform's own distance formula
(`lib/geo` `distanceKmSqlOn`) — live listings only, never the business's own —
and the engine ranks them.

## Decisions needed before Phase 4

1. **Logistics.** A delivery today belongs to an order (`deliveries.order_id`
   is `NOT NULL`), so a Circular deal cannot have one. Either make `order_id`
   nullable and add `circular_transaction_id` with a CHECK that exactly one is
   set, or carry a Circular deal as an order. Marker in
   `modules/logistics/service.ts`; `circular_transactions.delivery_id` is
   ready either way.
2. **Who in a business may use Circular** — the owner only (like sourcing) or
   sales reps too. Marker in `lib/org-access.ts`.
3. **Platform fee on Circular deals.** The revenue module reports commission
   on orders; a Circular fee would be a new stream there.
4. **Payment custody.** Circular must reuse AfriMesh Pay (§10), so it inherits
   the open question from the security gap assessment about AfriMesh holding
   funds.

## Phases (§14)

1. **Foundation** — schema, taxonomy, capabilities, listings, availability.
   *Built.* Remaining: admin screens to verify capabilities and extend the
   taxonomy; partner screens to list materials (markers in `AdminShell`,
   `PartnerShell`).
2. **Discovery** — requirements, geospatial search, matching, ranking.
   *Built.* Remaining: the screens and search filters.
3. **Business interaction** — enquiries *built*; negotiation records and
   agreement confirmation remain (counter-offers on `circular_enquiries`).
4. **Commercial integration** — create a transaction from an agreed enquiry
   (calling `reserveListingQuantity` in the same transaction), raise the
   payment through `modules/payments`, move to `PAYMENT_VERIFIED` from the
   verified webhook, write `circular_transaction_events`, link a delivery
   (decision 1).
5. **Intelligence** — feed `circular.*` events into demand analytics and the
   demand map; material supply mapping.

The specification asks for these in separate deployments, not one (§14).

## Acceptance tests (§15)

| # | Test | Now |
| --- | --- | --- |
| 1 | A verified business can create a listing | passes (database) — and an unverified one, or one without a verified role, cannot |
| 2 | A manufacturer discovers another business's listing | passes (database) |
| 3 | Listings ranked by distance and compatibility | passes (unit + database) |
| 4 | Requirements beyond available quantity handled | passes — never "fully qualified", plan says it does not cover |
| 5 | Multiple listings can satisfy one requirement | passes (unit) |
| 6 | Withdrawn, expired or exhausted listings excluded | passes (unit + database) |
| 7 | A business cannot modify another's listing | passes (database) |
| 8 | An enquiry does not create a transaction | passes (database) |
| 9 | No payment confirmation without verification | passes — enforced by a database trigger against the real payment record |
| 10 | A transaction references an existing delivery | schema ready; blocked on decision 1 |
| 11 | Events consumed without duplicating records | events carry ids and quantities only; the Graph consumer is Phase 5 |
| 12 | No overselling under concurrency | passes — conditional UPDATE, the same guard as Commerce stock |

## Applying the schema to the live database

Harmless — nothing uses it until launch — but not automatic:

```sh
cd ~/afrimesh/deploy
docker compose exec -T db psql -U afrimesh afrimesh -v ON_ERROR_STOP=1 < ../src/db/circular.sql
```

`circular.sql` is safe to run twice. A fresh database gets it from
`npm run db:push`; `db:reset` drops it with `public`.
