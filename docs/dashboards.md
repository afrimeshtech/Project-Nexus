# Dashboards: what ships, and what is switched off

AfriMesh is built for seven personas. Three are live; four are commented out
behind the marker `FUTURE-DASHBOARD` and can be brought back one at a time.

```
grep -rn FUTURE-DASHBOARD src
```

## Live

| Dashboard | Shell | Role / org type | Entry point |
| --- | --- | --- | --- |
| Consumer | `ConsumerShell` | `consumer`, tier 5 | `/` |
| Retail outlet | `PartnerShell` | `outlet`, tier 4 | `/partner` |
| Admin console | `AdminShell` | `platform_admin`, `super_admin`, `auditor` | `/admin` |

## Switched off

| Dashboard | Org type / role | Routes still present |
| --- | --- | --- |
| Merchant / wholesaler | `merchant`, tier 3 | `/partner/*` |
| Dealer warehouse | `warehouse`, tier 2 | `/partner/*` |
| Manufacturer | `manufacturer`, tier 1 | `/partner/*` |
| Delivery partner | `logistics` org / `delivery_partner` role | `/rider`, `/rider/map` |

## What "switched off" means here

Only the way in is closed. Nothing was deleted:

- Page files, components, services and server actions are all still in the tree
  and still compile — `/rider`, `/partner/source`, `RiderNetworkView`,
  `modules/logistics`, `actions/restock` are untouched.
- The database schema is untouched. `user_role` still has every value, and
  `lib/tiers.ts` still encodes the full chain
  (Manufacturer → Dealer warehouse → Merchant → Retail outlet → Consumer) with
  the one-tier-apart trading rule enforced in three places.
- Existing accounts holding a switched-off role keep working at the data layer;
  they simply have no link into their dashboard. A seeded or already-running
  deployment still has merchant, warehouse and delivery-partner accounts, and
  they still authenticate — so UI that describes an organisation still reads
  from `org.type` rather than assuming everyone is a retail outlet.

The gate is `orgType` in `src/lib/forms.ts`. That enum is what the registration
server action validates against, so narrowing it to `['outlet']` is what makes
the other tiers unregisterable rather than merely hidden.

## Knock-on effects of closing the merchant tier

A retail outlet sources *from* merchants. With that tier closed there is nobody
upstream, so these are hidden too — each is tagged and reversible:

- `PartnerShell` — the "Source from merchants" nav entry, and its cart badge.
- `/partner` — the "Source now" action on the **Needs restocking** card.
- `/partner/orders` — the **Purchases** tab.
- `/onboarding` — the "one-tap restocking" benefit, and the three upper rungs of
  the supply-chain explainer.

The retailer dashboard therefore ships as sell-side only: inventory, incoming
orders, buyer locations, wallet, rewards, API access, settings.

## Restoring one

1. Add its value back to `orgType` in `src/lib/forms.ts`.
2. Uncomment its entry in `src/components/partner/BusinessForm.tsx`.
3. For the delivery partner, also uncomment the `/rider` nav entry and the
   `isRider` binding in `ConsumerShell`, and the rider storefront branch plus
   its import and `searchParams` in `src/app/page.tsx`.
4. For the merchant tier, also restore the four knock-ons listed above.
5. Copy that names the tiers — `/about`, `/account`, `/onboarding`, the
   "Sell on AfriMesh" lede on `/` — carries the original wording in a comment
   beside it.
