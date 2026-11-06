# Security & Trust Framework v1.0 — gap assessment

The framework's first instruction is to inspect the system before changing it
(§6, §7: "architecture audit", then "security gap assessment", then
"security integration"). This is that inspection, made against the code on
2026-11-06. Each control is marked **in place**, **partial** or **missing**,
with a severity for what is missing. Items marked **fixed** were closed in the
same change that added this document.

Severity: **critical** — exploitable now, fix before anything else;
**high** — fix before real payments or public launch; **medium** — fix before
launch; **low** — plan for.

## Fixed in this change

| Gap | Severity | What changed |
| --- | --- | --- |
| Next.js 16.2.12 had unauthenticated remote-code-execution advisories (image optimizer with AVIF/SVG, `next/og`, `use cache`) | critical | Upgraded to 16.4.5. sharp, postcss, nanoid and source-map-js updated by `npm audit fix`. |
| No limit on wrong passwords | high | 5 failures per account or 20 per IP in 15 min locks password sign-in; checked before the password, so a lockout cannot be probed. Email codes still work, so nobody can lock a real person out. |
| No limit on sign-in codes; a fresh code reset the 5-guess limit | high | 3 codes per destination per 15 min, 10 per IP per hour. |
| Failed sign-ins not recorded | high | `user.login_failed` events, with IP and reason. The lockout counts these, so log and lockout cannot disagree. |
| Bank-account changes unaudited and silent | high | `payout.account_added` / `payout.account_removed` (number masked to last 4) and a notification to the account holder. |
| Admin changes unaudited: suspension, location moves, ranking weights, referral awards, alert resolution | high | Each now writes an event with the acting admin; a move records where the shop was. |
| Price changes unaudited | medium | `inventory.price_changed` with before and after, only when a price moved. |
| Audit log append-only by convention only | medium | Triggers refuse UPDATE, DELETE and TRUNCATE on `event_log` (migration 004). The one allowed update is `ON DELETE SET NULL` clearing an erased user's id. |
| No browser security headers on pages | medium | HSTS, `frame-ancestors 'none'` + `X-Frame-Options`, `nosniff`, referrer policy, permissions policy. |

## A. Identity and access management

| Control | Status | Notes |
| --- | --- | --- |
| Password hashing | in place | scrypt, per-password salt, constant-time compare; missing accounts still pay the hash cost. |
| Sessions | in place | Random 32-byte token, stored hashed; `httpOnly`, `secure`, `SameSite=Lax`; 30-day expiry; revoked on sign-out. |
| Login protection | **fixed** | See above. |
| Backend permission enforcement | in place | Pages and actions check roles server-side (`requireRole`, `requireOrgCapability`, `organisationFor`); a convention test forbids actions trusting an organisation id from a form. |
| Tenant isolation | in place | Spot-checked every `[id]` page and the inventory actions: records are loaded, then refused unless they belong to the signed-in business or buyer. The public API is scoped by key to one organisation. |
| Super-admin separation | **missing — high** | `platform_admin` and `super_admin` have identical powers; acceptance test 3 cannot pass. Needs a decision on which operations are super-admin only (suggested: ranking weights, referral awards, moving a locked location, suspending a business, admin role changes). |
| MFA for privileged accounts | **missing — high** | No second factor for admins. The framework puts this in Phase 1, before real payments. TOTP with recovery codes is the usual first step. |
| Reauthentication for sensitive changes | **missing — high** | Adding or removing a payout account does not ask for the password again. Now audited and the holder is told, which narrows but does not close the gap. |
| Account recovery | partial | No self-service password reset; passwords are set by a server script. Email-code sign-in is the recovery path. Phone codes are refused in production until an SMS provider exists. |

## B. Application and API security

| Control | Status | Notes |
| --- | --- | --- |
| HTTPS/TLS | in place | Caddy with Let's Encrypt; http redirects. HSTS now sent. |
| Server-side validation | in place | Zod schemas on every action that reads a form (enforced by a convention test). |
| SQL injection | in place | Parameterised queries throughout. The few interpolated fragments (revenue periods, support and messaging inbox queries) interpolate values fixed in code, never input. |
| XSS | in place | React escaping; uploaded files served sandboxed with their own CSP. A full page CSP is **missing — medium**: it has to be proven against every page before it ships. |
| CSRF | in place | Next server actions check Origin; session cookie is `SameSite=Lax`. |
| Rate limiting | partial | Sign-in and codes **fixed**; the public API has per-key limits. Registration is covered by the code limit. Payment initiation has no limit (**low** while payments are mock). |
| Secrets out of frontend code | in place | A convention test forbids `NEXT_PUBLIC_` variables and `process.env` in client components. |
| Dependency scanning | partial | `npm audit` run by hand. **zod 3 → 4** still outstanding (high advisory: memory exhaustion on oversized collections; the 2 MB body limit reduces it). It is a major upgrade touching every form schema, so it was not done blind. No automated scanning in CI (**medium**). |
| API inventory | partial | Routes are few and listed by the build; not documented as an inventory (**low**). |

## C. Data protection and privacy

| Control | Status | Notes |
| --- | --- | --- |
| Encryption in transit | in place | TLS to the edge; app and database talk on a private Docker network. |
| Encryption at rest | partial | Oracle encrypts block volumes by default; backups are plain gzip on the same disk (**high**, see F). |
| Secrets management | partial | `deploy/.env` on the server, readable by its user. Acceptable for the pilot; a secret store before scale (**low**). |
| Card data | in place | Never touches AfriMesh; Paystack hosts card entry. |
| PII in admin screens | partial | The support inbox shows members' phone and email in full, which support needs. No masking elsewhere is required yet; review when new admin screens are added (**low**). |
| Access to sensitive data recorded | **missing — medium** | Admin views of personal data are not logged. |
| Retention and deletion policy | **missing — medium** | Not written. The append-only log already supports erasure by clearing the actor. |
| Commercial data vs PII | in place | Demand analytics are aggregated; no partner receives individual customer data. |

## D. Payment and transaction integrity

| Control | Status | Notes |
| --- | --- | --- |
| Verified notifications | in place | Paystack webhooks are HMAC-SHA512 checked against the raw body; forged ones get 401. |
| Independent verification | in place | Amount and currency are checked against what was asked for before an order is confirmed. |
| Idempotency | in place | Each webhook event is claimed once (`webhook_events`); unique ledger references. |
| Failed payment never treated as success | in place | Orders confirm only through `completeOrderPayment`. |
| Customer need not return | in place | The webhook confirms the order on its own. |
| Recovery if a webhook is lost | partial | Paystack retries for days, but nothing re-checks a stale pending payment on our side (**medium** — add to the scheduled sweeper when Paystack goes live). |
| Ledger and reconciliation | in place | Double-entry ledger, checked on every admin load; revenue reconciled against orders. |
| **Custody of funds** | **conflict — decision needed** | The framework says AfriMesh "shall not independently hold customer or merchant funds". Today the platform does: buyer wallets, seller escrow and withdrawable balances are AfriMesh ledger balances. Moving to provider-managed split settlement (e.g. Paystack subaccounts) changes checkout, settlement, refunds and payouts, and needs legal and CBN advice. This is the largest item here and is not a code fix. |
| Platform fee | differs | The framework proposes ₦1 per product unit; the code charges `PLATFORM_FEE_BPS` (1.5%) of the subtotal. A pricing decision. |

## E. Monitoring and audit

| Control | Status | Notes |
| --- | --- | --- |
| Critical events recorded | **fixed** | Sign-ins (success and failure), membership and permission changes, bank accounts, prices, refunds (order cancellation), payments, settlements, payouts and admin changes. |
| Append-only | **fixed** | Enforced by trigger. |
| Restricted modification / tamper detection | partial | The app's database role owns the table and could drop the triggers. Separate an owner role from the app role (**medium**). No hash chain (**low**). |
| Suspicious-activity detection | partial | A fraud rule sweep exists; failed sign-ins are not yet surfaced as alerts (**low**). |

## F. Backup and continuity

| Control | Status | Notes |
| --- | --- | --- |
| Automated backups | in place | Nightly `pg_dump` at 02:30, 14 days kept. |
| Independent storage | **missing — high** | Backups live on the same server; losing it loses them. |
| Encrypted backups | **missing — high** | Plain gzip. |
| Restore tested | **missing — high** | Acceptance test 9 has never been run. |
| RPO / RTO | **missing — medium** | Effectively 24 h RPO; RTO undefined. |
| Incident response procedure | **missing — medium** | Not written. |

## Acceptance tests (framework §8)

| # | Test | Result |
| --- | --- | --- |
| 1 | Consumer cannot see another consumer's data | passes (code inspection) |
| 2 | Retailer cannot reach another's records by changing ids | passes (code inspection) |
| 3 | Ordinary admin cannot do super-admin operations | **fails** — no operations are reserved |
| 4 | Duplicate payment notification cannot double-credit | passes |
| 5 | Forged notification cannot confirm an order | passes |
| 6 | Failed payment never treated as success | passes |
| 7 | Unauthorised user cannot change a settlement account | passes for other users; no reauthentication for the owner's own session |
| 8 | Credentials not recoverable from frontend code | passes (enforced by test) |
| 9 | Backups restore | **not yet run** |
| 10 | Critical admin actions are traceable | passes (after this change) |
| 11 | Provider downtime does not corrupt records | passes for the flows inspected; not load-tested |
| 12 | Personal data not exposed in dashboards | passes for analytics; support inbox shows contact details by design |

"Passes" from inspection is not the same as a test in the register. Tests 1,
2, 4, 5, 6 and 10 should become automated checks.

## Decisions needed before the next phase

1. **Funds custody.** Stay with the internal wallet and escrow for the pilot, or move to provider-managed split settlement? Needs legal advice.
2. **Super-admin operations.** Which actions only a super-admin may take.
3. **Admin MFA.** Approve TOTP for admin accounts (Phase 1 in the framework).
4. **Backups.** An off-site destination (e.g. an Oracle Object Storage bucket) and an encryption key held off the server.
5. **zod 4 upgrade.** Schedule it as its own change.
