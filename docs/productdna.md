# ProductDNA — integration pathway

ProductDNA is AfriMesh's product identity and lifecycle intelligence domain,
specified in **AFRI-PDNA-TIS-001 v1.0** (`AFRIMESH PRODUCT DNA.pdf`): a
verifiable link between manufacturer-authorised products, production
batches, serial numbers, supply-chain movement, AfriMesh sales and physical
scans, used to detect counterfeit risk.

It is **built into the architecture and switched off**. Nothing a shopper,
retailer or administrator sees has changed. This document is the pathway from
here to launch.

## The switch

`src/lib/launch-productdna.ts` → `PRODUCTDNA_LAUNCHED = false`.

While false:

- the Commerce Integration Gateway is not started (not even imported);
- `/api/v1/productdna/*` answers **501 not_implemented** for every method;
- no screen links to ProductDNA.

`grep -rn FUTURE-PRODUCTDNA src` lists every place that changes at launch.

## How it fits the architecture

| Specification rule | How the codebase honours it |
| --- | --- |
| ProductDNA is an independently governed domain (§2, §18) | Its own Postgres schema, `productdna`, defined in `src/db/productdna.sql`. No foreign key points into Commerce; Commerce records are opaque references (`commerce_order_reference`, `commerce_product_reference`…), so the domain can move to its own database unchanged. |
| Commerce owns orders, inventory, payments (§2, §9) | Commerce code is untouched. ProductDNA only reads Commerce events. |
| Commerce publishes through a transactional outbox (§9) | `public.event_log` already is one: each event is written in the same transaction as the change it records, and the log is append-only (migration 004). |
| ProductDNA keeps an inbox so events process once (§9) | `productdna.processed_events`, claimed in the same transaction that handles the event. |
| ProductDNA must never block Commerce (§2, §11) | The gateway runs on its own timer after the fact, catches its own failures, and re-reads a window behind its cursor so a late-committing event is not skipped. |
| Lifecycle events are append-only (§4.8) | Database trigger, as on the platform event log. |
| No duplicate active serial sale (§5) | Partial unique index `product_sales_one_active_per_serial`. |
| Modular monolith with service boundaries (§3) | `src/modules/productdna/` — one module, its own files per responsibility. |

## What is built

| Spec module (§3) | Status | Where |
| --- | --- | --- |
| Database (§4, §5) — all 12 tables, constraints, indexes | **built** | `src/db/productdna.sql` (+ inbox, gateway cursor, Commerce product links) |
| 1. Manufacturer Registry | **built** (no UI/API) | `registry.ts` — `registerManufacturer`, `setManufacturerStatus` |
| 3. Product Identity Registry | **built** (no UI/API) | `registry.ts` — `registerProductIdentity` (the §7 contract), `setIdentityStatus` |
| Identity + lifecycle state machines (§10) | **built, tested** | `states.ts` |
| 9. Verification and Risk Engine — classification (§12) | **built, tested** | `verification.ts` — `assess` |
| Public verification response (§8) | **built, tested** | `verification.ts` — `toPublicVerification` |
| 10. Commerce Integration Gateway (§9) | **built, dormant** | `gateway.ts` — event mapping, inbox, cursor |
| 11. Audit | **built** | registry changes write `productdna.*` events to the platform event log |
| 2. Manufacturer authentication and credentials | not started | Phase 1 API work |
| 4–6. Batch, manifest and serial registries | schema only | Phases 2 and 4 |
| 7. Lifecycle Engine | state machine only | Phases 3–6 |
| 8. Observation Engine | schema only | Phase 6–7 |

Some status columns the specification names without listing values
(manufacturer users and keys, batches, alerts, sales, returns, observation
sources) carry a minimal set marked **PROVISIONAL** in the SQL — confirm them
in the phase that first uses them.

## Phases (§17) — what each one adds

1. **Manufacturer Registry and Product Identity.** Expose `registry.ts` through
   the §6 endpoints (replace the 501 catch-all with real routes via the v1
   `endpoint()` wrapper; add `productdna:read`/`productdna:write` scopes).
   Build manufacturer authentication (module 2, `manufacturer_users`). Build
   the admin console page and add it to `AdminShell` (marker there).
2. **Batches and production manifests.** Manifest submission with signature
   verification against `manufacturer_keys` using an established library
   (§13 — no home-made cryptography); key revocation (acceptance test 16).
3. **Commerce identity mapping and lifecycle events.** UI for
   `linkCommerceProduct`; map sellers' `inventory_batches` to
   `product_batches` (marker in `inventory/service.ts`); make the gateway write
   `product_lifecycle_events` for RECORDED events. Start the gateway
   (`PRODUCTDNA_LAUNCHED`).
4. **Individual serialisation.** `POST /serials/bulk-register`.
5. **Sale reconciliation and duplicate detection.** §11 steps 5–8 in the
   gateway: record `product_sales`, move serials to SOLD, raise
   `product_risk_alerts` for a sold serial reappearing (acceptance test 11).
6. **Returns, resale, offline reconciliation.** `product_returns` with
   `canReturnToSale`; signed offline device events (§14).
7. **Geospatial risk.** Feed `implausibleMovement` into `assess` from
   `product_observations`.
8. **AI and physical authentication.** Feed `physicalEvidenceInconsistent`.

The consumer-facing verification ("Verify this product") belongs on the
barcode page (marker in `app/barcode/[gtin]/page.tsx`) and uses
`toPublicVerification`, which is built to carry nothing private.

## Acceptance tests (§15)

| # | Test | Now |
| --- | --- | --- |
| 1 | Unverified manufacturers cannot register products | passes (unit + database) |
| 2 | Verified manufacturers can | passes (database) |
| 3 | Duplicate product references rejected | passes (database UNIQUE) |
| 4 | Invalid production signatures rejected | classifier ready; signature checking is Phase 2 |
| 5 | Valid manifests registered | Phase 2 |
| 6–7 | Batch-level and item-level verification | classifier ready; registry lookups are Phases 2–4 |
| 8 | Invalid serials rejected | passes (classifier) |
| 9 | Confirmed Commerce sales reconciled | gateway takes them; recording is Phase 5 |
| 10 | Duplicate serial sales prevented | passes (database partial unique index) |
| 11 | Sold serials as new stock raise alerts | classifier + state machine ready; alerting is Phase 5 |
| 12 | Authorised returns follow resale transitions | passes (state machine + database CHECK) |
| 13 | Duplicate events processed once | passes (database, gateway run twice) |
| 14 | ProductDNA outages do not block Commerce | by design: no Commerce code path calls ProductDNA |
| 15 | Offline events reconciled without duplication | Phase 6 |
| 16 | Key revocation takes effect | schema ready; Phase 2 |
| 17 | Consumer privacy preserved | passes (public response test) |
| 18 | Every verification decision auditable | `assess` returns its evidence and signals; storing them is Phase 5 |

## Applying the schema to the live database

Creating the schema is harmless — nothing uses it until launch — but it is
not applied automatically. When it is wanted:

```sh
cd ~/afrimesh/deploy
docker compose exec -T db psql -U afrimesh afrimesh -v ON_ERROR_STOP=1 < ../src/db/productdna.sql
```

`productdna.sql` is safe to run twice. A fresh database gets it from
`npm run db:push`, and `db:reset` drops and recreates it.
