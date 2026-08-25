# Website Audit — AfriMesh (follow-up pass, raw)

> **Raw first-pass, same as the original.** Not deduplicated, not prioritized into a punch list, findings may repeat or overlap. Refine later.

> **Why a second file:** `website-audit.md` (24 Aug) is committed and referenced by the client-facing .docx. This pass is *additive* — it exists to close that audit's own stated gaps, not to replace it. Nothing here supersedes it; read them together.

## Scope & method

**This pass deliberately targets what the 24 Aug audit said it could not cover.** Its own words:

- "Login state tested: **logged out only**"
- "Viewports tested: **desktop (1280px) only**. Mobile viewport testing was NOT completed"
- "Not walked live: `/account`, `/wallet`, `/notifications`, `/messages`, `/favourites`, `/onboarding`, `/rider`, `/partner`, `/admin`, `/barcode`"

Plus two code-level items raised in PR #1 as unverified: the payment resolver, and `db-push.ts` being a bootstrap tool rather than migrations.

**Environment:** local dev server `http://localhost:3000`, Next.js 16.2.12, branch `ui-refresh-and-dashboard-scope` @ `ee413e5`. Browser: Chrome ("Afrimesh") via extension.

**Covered live in this pass:** `/`, `/about`, `/search?q=rice` at 1366px; `/`, `/search?q=rice`, `/admin` at 485px; `/admin` at 1366px.
**Covered by code only:** payments module, `db-push.ts` / `db-reset.ts` / `seed.ts`, `AdminShell`, `RiderShell`.

### ⚠️ Gaps in THIS pass (be honest about these)

| Gap | Why | Status |
|---|---|---|
| **Mobile viewport** | Blocked while the window was maximized; the user un-maximized and resize then worked. | **NOW COVERED at 485px** — see "Third sitting". Chrome's ~500px floor means 375px is still untested. |
| **`/admin`** | Needed a platform-admin session; the user signed in mid-audit. | **NOW COVERED** — see "Second sitting" below. The `auditor` read-only branch remains unseen. |
| **`/rider`** | Requires a delivery-partner session. Also gated behind `FUTURE-DASHBOARD` (no nav link). | **STILL NOT VERIFIED** visually |
| **`/partner/*`** | Session expired between sessions. Was covered visually in earlier work but not re-checked at `ee413e5`. | Partial |
| Real payment flow | Only a mock gateway exists; no live provider to test against. | Not testable by design |

---

## Technical / Data safety

### `db:reset` will destroy a production database with no guard whatsoever
- **Category:** Technical / Data safety / Ops
- **What I noticed:** `scripts/db-reset.ts` runs `db-push.ts --reset`, which executes `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;` and then reseeds. There is **no** `NODE_ENV` check, **no** confirmation prompt, **no** host allowlist, and **no** check on what `DATABASE_URL` actually points at. Grepped for all four in `db-reset.ts`, `db-push.ts`, `seed.ts` and `verify.ts` — none present.
- **Where:** `scripts/db-reset.ts`, `scripts/db-push.ts` (the `RESET` branch)
- **Why it may be a problem:** `src/db/client.ts` selects the driver purely on `DATABASE_URL` being set. Once a production URL is in a shell — which is exactly what the hosting steps require — `npm run db:reset` is one command away from dropping the production schema. There is no typo-protection and no "are you sure".
- **User impact:** Total data loss. Every order, wallet balance and ledger line.
- **Business impact:** Catastrophic and, for the wallet ledger, possibly unrecoverable in a way that matters legally — this platform holds customer money in escrow. **Hypothesis** on severity of recovery; depends entirely on backup policy, which I could not find in the repo.
- **Severity:** **Critical.** Destructive by default, trivially triggerable, no undo.
- **Possible solution:** Refuse to run when `NODE_ENV === 'production'`; refuse when `DATABASE_URL` host is not localhost unless `--i-know-what-this-is` is passed; print the target host and require typing it back. Cheapest useful version is the `NODE_ENV` guard — three lines.
- **Implementation notes:** Small. Do it before anyone points `DATABASE_URL` at a real server, i.e. before the hosting work, not after.
- **Assumptions / unverified:** I did not run it against a remote database (obviously). Reasoning is from reading the scripts.
- **Worth investigating further:** Is there any backup/PITR plan? Not visible in the repo. Ask.

### Seeding a production database would install publicly-known admin credentials
- **Category:** Technical / Security
- **What I noticed:** `scripts/seed.ts` creates `admin@afrimesh.africa` with `password: 'afrimesh'`, hardcoded at ~8 call sites, and prints the credential list on completion. The repo is on GitHub.
- **Where:** `scripts/seed.ts:705` and following
- **Why it may be a problem:** Anyone who reads the repo has platform-admin credentials. Harmless while it only ever touches a local `.pgdata`; a full compromise the first time it touches a real database. Compounded by the finding above, since `db:reset` *always* reseeds.
- **User impact:** n/a directly — it is an operator risk.
- **Business impact:** Full administrative compromise of the platform, including the admin console's wallet and organisation controls.
- **Severity:** **Critical** *if* seeding ever runs against production; **Low** while it cannot. The severity is entirely a function of the guard that does not currently exist.
- **Possible solution:** Same guard as above. Separately, consider generating a random password at seed time and printing it, rather than a constant.
- **Assumptions / unverified:** No evidence anyone *has* run this against a real DB. Flagging the possibility, not an incident.

### `db-push.ts` is a bootstrap tool, not a migration system
- **Category:** Technical / Ops
- **What I noticed:** It applies `schema.sql` wholesale and refuses to run if a `users` table already exists. There is no migrations directory, no version table, no up/down.
- **Where:** `scripts/db-push.ts`
- **Why it may be a problem:** It gets you to production exactly once. The *second* schema change has no supported path — the only built-in option that touches an existing database is `--reset`, which drops everything (see Critical above).
- **User impact:** None until the first post-launch schema change, then potentially downtime or data loss depending on what is improvised.
- **Business impact:** **Hypothesis:** every future schema change becomes a hand-written, unreviewed, untested SQL script run by hand against production.
- **Severity:** **High** — not urgent today, blocking soon after launch, and much cheaper to adopt before there is data to preserve.
- **Possible solution:** Adopt a migration runner before launch, not after. The SQL is plain Postgres so most tools fit.
- **Worth investigating further:** Is `schema.sql` intended to stay the source of truth, with migrations generated from it? Ask — that changes the tool choice.

---

## Payments

### The resolver used to hand out the mock gateway silently (fixed in `ee413e5` — recorded for the record)
- **Category:** Technical / Money
- **What I noticed:** `gateway()` previously ended `return GATEWAYS[configured] ?? mockGateway`. `GATEWAYS` contains only `mock`. So `PAYMENT_PROVIDER=paystack` — the value `.env.example` all but invites, since it lists `PAYSTACK_SECRET_KEY` — resolved to the mock, which returns `success: true` for any charge.
- **Where:** `src/modules/payments/service.ts`
- **Why it may be a problem:** `orders/service.ts` treats `success: true` as money received: it marks the payment `succeeded` and calls `deposit()` to credit the buyer's wallet. So the failure mode was *goods dispatched, wallet credited, nothing charged* — with no error, no failed request, and nothing in a log to notice.
- **Severity:** **Critical** as it stood. Now throws `PaymentConfigError` naming the provider and the available adapters; regression test in `src/modules/payments/service.test.ts`.
- **Status:** **Fixed.** Listed here because it is the kind of thing that gets reintroduced by a well-meaning `?? fallback`, and because the audit trail matters.

### No live adapter exists, and the interface cannot safely hold one yet
- **Category:** Technical / Architecture / Money
- **What I noticed:** `PaymentGateway.charge()` is synchronous — it returns success or failure, and the caller acts on that immediately.
- **Where:** `src/modules/payments/service.ts`, consumed at `src/modules/orders/service.ts:379-410`
- **Why it may be a problem:** Every real provider is asynchronous. Paystack's `/transaction/initialize` returns an `authorization_url` and nothing else; payment is confirmed later by webhook, or never. An adapter written against this interface must choose between `success: true` (credits a wallet for money that has not arrived) and `success: false` (fails legitimate orders). There is no third option, even though the `Payment` row already has `status: 'pending'`.
- **User impact:** As-is, none — there is no adapter. The risk is entirely in *adding* one carelessly.
- **Business impact:** Direct revenue loss or double-charging, depending which wrong branch is taken.
- **Severity:** **High** — a blocker on taking real money, and a trap for whoever wires it up.
- **Possible solution:** Add a `pending` charge outcome; move deposit + escrow into a signature-verifying webhook route; make that route idempotent (providers retry). Then write the adapter. Written up in-file where the adapter would go.
- **Worth investigating further:** Which provider is actually intended? Paystack and Flutterwave are both named in `.env.example` and the choice changes the webhook shape.

---

## Accessibility — verified in the live DOM

Ran against `/search?q=rice` at `ee413e5`, querying the real DOM rather than reading source.

### Filter groups and combobox now expose correct semantics ✅
- **Category:** Accessibility
- **What I noticed:** Confirmed present and correct:
  - `#site-search` — `role="combobox"`, `aria-expanded`, `aria-controls="site-search-suggestions"`, `aria-autocomplete="list"`
  - listbox — `role="listbox"`, `aria-label="Product suggestions"`, `hidden` when empty
  - **4 filter groups**, each with `aria-labelledby` (`filter-distance`, `filter-arrives-within`, `filter-rating`, `filter-category`) and **exactly one `aria-current`** each
- **Severity:** n/a — this is a pass, recorded as evidence.
- **Assumptions / unverified:** I verified the *attributes*. I did **not** drive a real screen reader, and I could not verify arrow-key navigation end-to-end because suggestions require typing into the header field and observing async results — **TODO: verify with an actual NVDA/VoiceOver pass.** Attribute correctness is necessary, not sufficient.

### `/about` hero survived the `--color-surface-deep` change ✅
- **Category:** Accessibility / Visual
- **What I noticed:** Measured from a screenshot of the rendered page: ground `#0f3520`, heading `13.5:1`, body lede `9.5:1`, accent word "locally" `6.3:1`.
- **Why it matters:** This was flagged unverified in PR #1 because the mesh hero inherits `--color-surface-deep`, which moved from `#021614` to `#123824`. All three levels still clear AA comfortably, and the mesh lattice renders without artefacts.
- **Severity:** n/a — pass.
- **Note:** The `6.3:1` on the accent word is a useful datapoint: it is the same `#ff9500` that measures **2.2:1 on white** and was swept to `--color-accent-strong` everywhere on light grounds. On dark grounds it is correct and was deliberately left alone. The sweep's carve-outs look right.

### Console is clean
- **Category:** Technical
- **What I noticed:** Across `/`, `/about`, `/search` — only `[HMR] connected` and the React DevTools notice. No errors, no hydration warnings, no failed asset loads.
- **Severity:** n/a — pass. Worth noting because the *original* audit's headline finding was intermittent page failures; those were the dev server's broken stdout pipe (EPIPE), now resolved.

---

## Open questions for the team

1. **Is there a backup or PITR plan for the production database?** Nothing in the repo suggests one. This changes the severity of the `db:reset` finding from "very bad" to "existential".
2. **Which payment provider is actually intended** — Paystack or Flutterwave? Both are named in `.env.example`.
3. **Is `schema.sql` meant to remain the source of truth** once migrations exist, or be replaced by them?
4. **Is the delivery-partner tier coming back for launch?** `/rider` still renders and still guards on role, but has no nav entry. If it is launching, it needs a visual pass it has never had.
5. **Has `seed.ts` ever been run against anything other than local `.pgdata`?** Worth confirming out loud given the hardcoded admin password.

## TODO — not done, needs another pass

- [ ] **Mobile viewport at 390px and 375px.** Blocked on window resize. This is now the *second* audit to leave mobile unverified — it should not slip a third time.
- [ ] `/admin` — visual, logged in as a platform admin
- [ ] `/admin` as `auditor` — the read-only role has its own branch (`readOnly` in `AdminShell`) that has never been seen rendered
- [ ] `/rider` and `/rider/map`
- [ ] `/partner/*` re-check at `ee413e5` (previously checked, but before the type and colour changes landed)
- [ ] Real screen-reader pass (NVDA/VoiceOver), not attribute inspection
- [ ] Network waterfall / asset sizes — not examined this pass
- [ ] Landscape orientation, and text zoom to 200%

---

# Second sitting — `/admin` walked live (first time in either audit)

Signed in as `admin@afrimesh.africa` (renders as **super admin**).

## Charts

### Every bar chart in the app renders zero-height bars — the data is there, invisible
- **Category:** UI / Charts / Data / Regression
- **What I noticed:** On `/admin`, the "GMV, last 14 days" card shows its title, its subtitle ("Total ₦2.6m settled through the platform"), its axis labels (Aug 12 / Aug 25) and — in the accessible text — all fourteen values (`₦0 ₦188k ₦24k ₦0 ₦27k ₦13k ₦186k ₦9k ₦0 ₦0 ₦12k ₦0 ₦0 ₦0`). **No bars are drawn.** The chart body is blank.
- **Where:** `src/components/charts/BarSeries.tsx:79`. Rendered by `src/app/admin/page.tsx:127` **and** `src/app/partner/page.tsx:163`.
- **Root cause (confirmed by walking the computed box tree, not guessed):**

  ```
  div.flex.h-32.items-end.gap-1          128px   <- definite, correct
    └ div.group.flex.flex-1.flex-col       0px   <- shrink-wraps
        └ span[style="height:100%"]        0px   <- 100% of 0
  ```

  The track sets `items-end`, so its column children are **not stretched** to the track height — they shrink-wrap to content. Their only content is a percentage-height span, so the column is 0px and every `height: N%` resolves against 0. The percentages are computed correctly (`2%`, `100%`, `12.5%`…); they have nothing to be a percentage *of*.

- **Verified by probe** — temporarily set `height:100%` on the columns in the browser only, reverted immediately, nothing written to disk:

  | | column | bar 1 | bar 2 | bar 3 |
  |---|---|---|---|---|
  | before | 0px | 0px | 0px | 0px |
  | with height:100% | 128px | 2.5px | 128px | 16px |
  | after revert | 0px | — | — | — |

- **Why it may be a problem:** The most prominent analytic on the platform overview — and its twin on the partner dashboard — are blank. Nothing errors or warns, and the card looks like a designed empty state, so it reads as "no data" rather than "broken".
- **User impact:** Admins and sellers cannot see revenue trend at all. A seller checking whether sales are up sees a blank rectangle and a total.
- **Business impact:** **Hypothesis:** the trend chart is a main reason a seller opens the dashboard; a blank one erodes confidence in every other figure on the page.
- **Severity:** **High.** Core feature silently non-functional on two dashboards, one-line fix.
- **Possible solution:** Add `h-full` to the column div at `BarSeries.tsx:79`, or change the track from `items-end` to `items-stretch` (the column already has `justify-end`, so bars stay bottom-aligned either way). The probe confirms the first works.
- **Implementation notes:** One class. Worth a regression guard afterwards — this is exactly the sort of thing that comes back.
- **Assumptions / unverified:** Confirmed on `/admin` only. `/partner` uses the same component with the same classes so it is almost certainly identical, but I did not re-open `/partner` this sitting — **TODO: confirm.**
- **Worth investigating further:** Was it ever working? `items-end` looks deliberate. Worth a `git log -p` on the file to see whether this regressed or never rendered.
- **Note on why nobody caught it:** the empty-state branch at `BarSeries.tsx:44-49` uses the same `h-32` and its comment says it matches "the populated chart, so a card does not change height". So the empty and populated states currently look **identical**.

## Colour regression from greening the bar

### `--color-bar-green` and `--color-bar-tan` no longer meet the contrast their own comments claim
- **Category:** Accessibility / Design system / Regression (self-inflicted)
- **What I noticed:** Moving `--color-bar` from `#021614` to `#123824` (commit `7b64927`) raised the bar's lightness, costing every foreground token on it contrast:

  | token | old bar | new bar | delta | verdict |
  |---|---|---|---|---|
  | `#ffffff` | 18.63:1 | 12.99:1 | −5.64 | pass |
  | bar-muted (72% white) | 9.29:1 | 6.48:1 | −2.81 | pass |
  | `--color-accent-400/500` `#ff9500` | 8.47:1 | 5.91:1 | −2.56 | pass |
  | **`--color-bar-green` `#3f9c68`** | 5.47:1 | **3.81:1** | −1.66 | **fails AA for normal text** |
  | **`--color-bar-tan` `#c08a52`** | 6.21:1 | **4.33:1** | −1.88 | **fails AA, marginal** |

- **Where:** `src/app/globals.css:308-309`
- **Why it may be a problem:** The comments beside them still read *"logo green, lifted to 5.5:1 for UI text"* and *"logo tan, lifted to 6.2:1 for UI text"*. Those figures were measured against the old bar and are now wrong. Someone reading the comment will trust it and use the token on the bar, where it is 3.81:1.
- **User impact:** **None today** — grepped all of `src/`; neither token is used anywhere. Latent, not live.
- **Severity:** **Medium.** Not rendering now, but a documented-wrong value sitting in a design system is how bad values spread.
- **Possible solution:** Re-lift both against `#123824` and correct the comments, or delete them as dead tokens. Deleting is defensible — they have never been used.
- **Assumptions / unverified:** Grep-based usage check; a dynamically composed class name would not show up, though nothing here composes class names that way.
- **Mea culpa:** introduced by my own change and missed at the time, because I checked white and the accent on the new bar but not the two tokens nothing was using.

## Admin console — general

### The console renders correctly and is legible
- **Category:** UI / Accessibility
- **What I noticed:** Measured on the rendered page — bar ground `#123625`, "Storefront" 11.60:1, "Sign out" 7.89:1, CONSOLE eyebrow 5.14:1 sampled through antialiasing (pure token 5.91:1). Sidebar, breadcrumb, page header, stat tiles and the verification-queue banner all render as designed. No layout breaks at 1366px.
- **Severity:** n/a — pass.

### Still not seen: the `auditor` read-only branch
- **Category:** Coverage gap
- **What I noticed:** `AdminShell` has `readOnly = user.role === 'auditor'`, which switches the badge to `tone="warning"` and appends "· read only". I was signed in as super admin, so this path remains unrendered in any audit.
- **Severity:** Unknown — cannot rate without seeing it.
- **Worth investigating further:** Sign in as `auditor@afrimesh.africa` and check that read-only actually disables the console's write controls rather than only relabelling the badge. **A badge saying read-only while the buttons still work would be a serious finding — currently unverified in either direction.**

## Responsive — code-level only (still not seen at mobile width)

### Wide tables are correctly contained; no fixed-width overflow risks found
- **Category:** Layout / Mobile
- **What I noticed:** All eight wide tables (`min-w-[26rem]` … `min-w-[46rem]`) are wrapped in `.scroll-x`, which is `overflow-x: auto`. The only two fixed widths in the codebase are `w-[19rem] max-w-[85vw]` (menu sheet, capped to viewport) and `max-w-[13rem]` (a max, not a width). At 1366px, `document.documentElement.scrollWidth === clientWidth`, so no horizontal overflow.
- **Severity:** n/a — pass, **but this is static analysis, not a mobile rendering test.** It rules out the crudest failure mode (page-level horizontal scroll). It says nothing about tap-target sizes, text wrapping, the mobile pill nav, or the bottom nav at 390px.
- **Assumptions / unverified:** everything about how this actually looks on a phone.

### Mobile viewport — STILL BLOCKED after five attempts
- `resize_window` returns success but `window.innerWidth` stays 1366 — four attempts, including an intermediate size to force a restore out of maximized state.
- `window.open` with explicit dimensions — **blocked by the popup blocker**.
- The Chrome window appears to be maximized, and maximized windows ignore programmatic resize.
- **This is the second consecutive audit to leave mobile unverified.** For a product whose buyers are Lagos market shoppers, mobile is the primary viewport, not a secondary one. Unblocking needs a human to un-maximize the window, or a device-emulation path these tools do not expose.

---

# Third sitting — mobile viewport finally covered

The window was un-maximized, and resize now works. **Caveat on width:** Chrome on Windows enforces a ~500px minimum window width, so the narrowest real viewport I could reach is **485px CSS**, not the 375–390px of an actual phone. What this does and does not buy:

- ✅ **The mobile layout branch is genuinely active** — `matchMedia('(min-width: 640px)')` is `false` and `(min-width: 1024px)` is `false`, so every `sm:` and `lg:` class is off. This is the same code path a phone takes.
- ⚠️ **It is still ~100px wider than a real phone.** Text wrapping, truncation and line-length problems that only bite at 375px would not show here. Treat "no overflow at 485px" as necessary, not sufficient.

Pages walked at 485px: `/`, `/search?q=rice`, `/admin`.

## Mobile — what works

### No horizontal overflow anywhere tested ✅
- **Category:** Layout / Mobile
- **What I noticed:** `document.documentElement.scrollWidth - clientWidth === 0` on all three pages. I did flag elements extending past the viewport, but on inspection every one is a category card inside the `.scroll-x` carousel — i.e. content that is *supposed* to extend and scroll horizontally within its own container. Correct behaviour, not a bug.
- **Severity:** n/a — pass.

### The storefront masthead collapses correctly ✅
- **Category:** Layout / Mobile
- **What I noticed:** The two-column masthead (greeting + "Searched nearby" rail) reflows to a single column with the rail beneath, the header collapses to hamburger + logo + three icons, the location picker drops to its own row, and the search bar goes full width. Bottom nav appears.
- **Severity:** n/a — pass.

### Bottom navigation is exemplary for touch ✅
- **Category:** Touch / Mobile
- **What I noticed:** All five items measure **97×58px** — clearing both the WCAG 2.2 AA minimum (24×24) and the Apple HIG / Material recommendation (44×44 / 48×48) with room to spare. `position: fixed`, five items, icon + label.
- **Severity:** n/a — pass, and worth preserving.

### Filter chips clear the pointer-target minimum ✅
- **Category:** Touch / Accessibility
- **What I noticed:** All 19 chips render at **30px** tall, none under 24×24. (This was `py-1` ≈ 24px before commit `ee413e5`, i.e. exactly on the line; it is now comfortably over.)
- **Severity:** n/a — pass.

## Mobile — findings

### Header controls are 36–40px, under the 44px touch recommendation
- **Category:** Touch / Mobile / Accessibility
- **What I noticed:** Measured on the rendered page at 485px:

  | control | size | WCAG 2.2 AA (24px) | Apple HIG / Material (44/48px) |
  |---|---|---|---|
  | Open menu | 40×40 | pass | **miss** |
  | Messages | 40×40 | pass | **miss** |
  | Notifications | 40×40 | pass | **miss** |
  | Basket | 40×40 | pass | **miss** |
  | Location picker | 135×36 | pass | **miss** |
  | Search submit | 65×36 | pass | **miss** |

- **Where:** `ConsumerShell` header — the `size-10` icon buttons (`w-10 h-10` = 40px) and the `py-1.5` controls.
- **Why it may be a problem:** These are the app's primary chrome, tapped constantly, and they sit at the top of the screen where thumb reach is already worst. 40px is a 4px shortfall and 36px is 8px — small individually, but this is a product whose buyers are market shoppers on phones, often one-handed and often in a hurry.
- **User impact:** More mis-taps on basket/notifications than necessary. **Hypothesis:** most acute for older users and anyone with reduced dexterity.
- **Business impact:** **Hypothesis**, not measurable from here — mis-taps on the basket icon specifically sit directly on the purchase path.
- **Severity:** **Medium.** Passes the legal-ish bar (WCAG 2.2 AA), misses the platform-convention bar, on the most-tapped controls in the app.
- **Possible solution:** `size-11` (44px) for the icon buttons, and `py-2.5` on the location/search controls. The icons themselves need not grow — only the hit area.
- **Implementation notes:** Small; watch that the header does not grow taller than the design intends — the hit area can be extended with padding without changing the visual button size.
- **Assumptions / unverified:** Measured at 485px. Sizes are fixed (not viewport-relative), so they will be identical at 375px — this one finding does generalise.

### Bottom nav could not be visually confirmed against safe areas
- **Category:** Coverage gap / Mobile
- **What I noticed:** The Claude extension's own "Claude is active in this tab group" banner sits at the bottom of the viewport, covering the bottom nav in every screenshot. I measured the nav programmatically (fine — see above) but never *saw* it unobstructed.
- **Why it matters:** `fixed inset-x-0 bottom-0` navs are exactly where iOS home-indicator / Android gesture-bar overlap shows up, and `env(safe-area-inset-bottom)` handling cannot be checked in desktop Chrome at all.
- **Severity:** Unknown — unverifiable with these tools.
- **Worth investigating further:** Needs a real device or device-mode emulation. **This is the remaining true mobile gap.**

### Still not verified even at 485px
- Text wrapping / truncation at **375px** — 485px is ~100px of slack that a phone does not have. Long product names, the "Orders from consumers" style labels, and price rows are the likely candidates.
- **Landscape orientation.**
- **Text zoom to 200%** (WCAG 1.4.4) — not attempted.
- `/product/[slug]`, `/cart`, `/login` at mobile — not walked this sitting.
- Real device behaviour: momentum scroll, safe areas, on-screen keyboard shrinking the viewport over a fixed bottom nav.
