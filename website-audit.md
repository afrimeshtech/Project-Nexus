# Website Audit — AfriMesh Platform (raw first-pass)

> **This is an intentionally raw, unpolished, exhaustive first-pass audit.** Not organized for a client, not deduplicated, not prioritized into a punch list. Findings may repeat, overlap, or contradict slightly as different angles are logged. Refine/restructure later (e.g. with a client-report-generation pass) — this is the "capture everything" pass.

## Scope & method

- **Live site:** http://localhost:3000 (local Next.js dev server, already running when audit started)
- **Codebase:** `C:\Users\Mansur Madaki\Documents\Afrimesh\afrimesh-platform` — Next.js 16.2.12 (App Router), React 19.2.8, TypeScript, Tailwind CSS 4, Zod, Postgres via @electric-sql/pglite
- **Product context (from package.json description):** "AfriMesh Commerce Platform (Project Nexus) - Proximity Commerce & Payment Infrastructure" — a hyperlocal marketplace for Nigeria (Naira pricing, Lagos-area seed data, distance/ETA-to-nearby-shops as a core mechanic).
- **Login state tested:** logged out only. Did not create/use a real account (guardrail: no real form submissions with side effects). The login/register flows themselves became untestable partway through the session — see the Technical Issues section, this is a major finding in its own right.
- **Viewports tested:** desktop (1280px) only. **Mobile viewport testing was NOT completed** — see gaps below.
- **Routes actually walked live:** `/` (home), `/about`, `/login`, `/register`, `/cart`, `/orders` (redirect behavior only), `/product/[id]` (two different products), `/shop/[slug]`, `/search`, plus a deliberate 404 test. Not walked live: `/account`, `/wallet`, `/notifications`, `/messages`, `/favourites`, `/onboarding`, `/rider`, `/partner`, `/admin`, `/barcode` — these were covered only via the codebase-side investigation, not visually/interactively.
- **Codebase-side investigation** was delegated to two parallel research passes over the full `src/` tree (both retried once after transient API connection failures on the first attempt — noting only because it delayed the audit, not a finding about the product):
  1. Accessibility-in-code, empty/loading/error/success state handling, SEO setup, forms, route completeness.
  2. Design-system consistency, duplicated components, code quality, testing, dependencies, missing route-level loading/error states.
  Their findings are merged into the relevant sections below, cited as **[code review]**. File:line references in this document come from that pass and were not independently re-verified line-by-line by me — treat exact line numbers as approximate if the file has since changed.

### Known gaps / things NOT covered (be honest about this rather than silently skip it)

- **No visual screenshots at all.** The browser tool's screenshot function errored consistently ("Browser pane is not displayed, so the page is not compositing frames") no matter what was tried (fronting the tab, waiting, retrying). The entire live-site portion of this audit relied on the accessibility tree, extracted text, direct DOM queries via JS, console logs, and network logs — **not actual visual inspection.** Anything about color contrast, spacing/alignment polish, image quality/cropping, visual hierarchy weight, or "does it look good" could NOT be verified and is largely absent below except where inferable from code (Tailwind classes, design tokens). This is a real, significant coverage gap for what's meant to be a UX/UI audit — flagging loudly rather than quietly working around it. **Recommend a follow-up visual pass** once screenshots are available.
- **Mobile responsiveness was not tested.** Never got to run `resize_window` to a mobile width before the site became unstable (see Technical Issues). Everything in this document about layout/responsiveness is inferred from Tailwind classes in code at best, not observed.
- **~10 of ~20 top-level routes were not walked live at all** (listed above) — covered only indirectly via the codebase pass, which is not a substitute for actually using them.
- **No authenticated-user testing.** Never created a real account (by design — read-only guardrail), so anything behind login (account settings, order history contents, wallet balance UI, rider/partner/admin dashboards) is assessed from code only, not from actually using it as a logged-in user.
- **Dev mode only.** Turbopack, unbundled/unminified chunks, HMR active. Bundle size, code-splitting effectiveness, and real load performance need re-checking against a `next build` production build separately.

---

## 🚨 Headline finding: the dev server destabilized mid-session and broke core flows

This is the single most important thing in this document, so it's up top instead of buried in "Technical Issues."

**Timeline of what happened during this audit session, in order:**
1. Home page (`/`) loaded perfectly — full content, zero console errors, all network requests 200 OK.
2. `/about` loaded perfectly.
3. `/login` got stuck: the actual sign-in form was present in the DOM (confirmed via JS: `document.querySelector('form')` found it) but **not visible** (`form.offsetParent === null`), while the page's only visible text was "Loading" — reproducible across a full hard navigation, and still stuck after 6+ seconds with `document.readyState === "complete"` and no pending network requests.
4. `/register` — same exact symptom.
5. `/cart` — same exact symptom (and the tab title never updated from the previous page's title, which is itself a clue that the client-side render never completed).
6. `/orders` correctly redirected an unauthenticated visitor to `/login?next=%2Forders` (the auth guard itself works) — but landed on the same stuck `/login` page.
7. `/product/[id]` — this one didn't hang, it **500'd**, and did so consistently across a full page reload and across two different product IDs. The response body was Next.js's raw internal dev error page (not the app's own styled error boundary), a JSON dump containing: `"message":"Jest worker encountered 2 child process exceptions, exceeding retry limit"` with a stack trace pointing into `next/dist/compiled/jest-worker`.
8. `/shop/[slug]` — same 500, same error.
9. `/search?q=rice` — stuck-loading again.
10. A deliberate 404 test (`/this-page-does-not-exist`) actually worked fine — real branded "We could not find that page" screen.
11. **Re-checked `/` (home) at the end of the session — it was now ALSO stuck on "Loading", the same page that worked perfectly at the very start.**

**What this means:** the dev server's compile-worker pool (Turbopack/Next's `jest-worker`-based child process workers) appears to be crashing under load, and this is getting progressively worse over time within the same dev session — not a one-off. A page that worked at minute 1 was broken by the end. Checked host memory: `FreePhysicalMemory` was ~890 MB out of ~7.8 GB total (~89% used) at the time of the crash findings — **[hypothesis, reasonably well-supported]** this looks like the dev server (and its child compile workers) running under real memory pressure on this machine, causing workers to crash/OOM, which cascades into: pages that need fresh compilation either hang forever (stuck on the route's `loading.tsx` skeleton, waiting on a chunk that never finishes) or hard-500 (when Next's own error handling kicks in after retries are exhausted). Fast Refresh rebuild times logged in the console over the session ranged wildly: 114ms, 556ms, 583ms, 746ms, 6140ms, 7958ms, 15845ms, 20887ms, **31400ms** — that variance (0.1s to 31s for what should be near-instant incremental rebuilds) is itself a strong signal of an unhealthy dev environment, independent of the worker-crash errors.

- **User impact (if this happens in any real dev/staging environment, not just this one machine):** total — a developer or QA person cannot reliably browse the app; core flows (sign in, register, view a product, view a shop, view your cart) are all affected, and it degrades over time rather than failing fast/obviously.
- **Business impact:** if this pattern also occurs in a deployed environment (can't verify — this was only observed in local dev, and production builds behave very differently from `next dev`), it would be a **Critical** production-availability risk for exactly the pages that drive revenue (product pages, cart, checkout-adjacent flows). Even scoped to local dev, it's a **Critical** developer-experience/productivity issue.
- **Severity:** Critical, with the caveat that this is dev-mode-specific behavior that needs separate verification against a production build.
- **Possible solution:** Not something this audit can fix (out of scope, and read-only by design), but worth investigating: (a) whether the host machine has enough RAM for comfortable Next.js 16 + Turbopack dev-mode usage, (b) whether other processes are competing for memory, (c) whether `next dev`'s worker pool size/memory limits can be tuned, (d) whether this reproduces on a machine with more headroom, (e) whether it reproduces against `next build && next start` (production mode uses a very different, much lighter runtime than `next dev`).
- **Assumptions/unverified:** The memory-pressure explanation is a hypothesis built from circumstantial evidence (low free RAM + worker-crash error message + degrading rebuild times), not a confirmed root cause — I did not have access to the actual dev server process's terminal/logs (checked one terminal, it was an idle unrelated PowerShell prompt, not the one running `npm run dev`). **Worth investigating further:** check the actual terminal running `npm run dev` for the full error/stack trace history; check Task Manager / Resource Monitor during a repro; try `next build` to rule out a dev-mode-only issue; try closing other applications to free RAM and see if it recurs.
- **This also means:** most of the live-site UX/UI findings below (from the pages that *did* work, at the *start* of the session) should be treated as a snapshot of a moment, not a guaranteed-stable current state — re-verify anything important against a healthy running instance.

---

## General / cross-cutting observations

- **[LIMITATION]** No visual screenshots available this session (see Known Gaps above) — everything here is DOM/text/network-based, not a real visual review.
- Site is running in Next.js **dev mode**; performance findings reflect that, not a production build.
- The product/domain framing (hyperlocal Nigerian marketplace, Naira pricing, walk/drive-time-to-shop as a ranking factor) is good context for judging what "trust" and "content" should look like — e.g. NG-specific payment methods, delivery norms, phone-number-first auth (which the app does use — see Forms section).
- **Real, positive surprise:** the codebase is noticeably more disciplined than the audit brief's checklist assumes as a default ("do buttons/cards have multiple divergent implementations" etc.) — see Design-System Consistency below. Worth saying plainly up front so it doesn't get lost among the problem-findings: whoever built this clearly cared about consistency, accessibility fundamentals (semantic headings, real `<label>`s, `role="status"` live regions, motion-sensitivity handling in skeletons), and defensive engineering (Zod validation, centralized API error envelopes, no raw error messages shown to users in the *designed* error states). The Critical finding above is a real problem, but it reads like an environment/infrastructure issue layered on top of an otherwise carefully-built app, not evidence of sloppy engineering.
- Conversely: **no live payment provider is wired up anywhere** (`src/modules/payments/service.ts` only has a `mockGateway`), and **19 of 20 domain modules have zero automated tests**, including payments, orders, wallet, and identity/auth. For a platform whose own description is "payment infrastructure," that combination (mock-only payments + untested money-movement code) is worth the team's explicit attention regardless of how good everything else looks.

---

## Page-by-page log (live site)

### Home (`/`) — desktop 1280px, logged out — *(tested at start of session; broke by end of session, see headline finding)*

Console: only dev-noise at first visit (React DevTools suggestion, HMR connect/rebuild messages), no errors. Network: all requests 200 OK initially (fonts, CSS, JS chunks, one `/_next/image` request for the header logo).

Structure: header (menu button, logo→home, location button "Ikeja, Lagos", nav icons Messages/Notifications/Basket, "Sign in" link, search bar) → hero → recent-search chips → Top categories (5 + "More") → Popular nearby (8 product cards) → Nearby outlets (7 shop cards) → "Sell on AfriMesh" CTA block → bottom tab bar (Home/Orders/Wallet/Messages/Profile) → footer.

**Heading hierarchy is correct and deliberate:** single `H1` ("Find what you need, nearby"), `H2`s per section, `H3`s per product-card title, confirmed via direct DOM query. Worth explicitly noting as good — easy to only log problems.

#### Finding: No favicon wired up despite having a usable icon asset
- **Category:** Technical / SEO / Polish
- **What I noticed:** No `<link rel="icon">` in the rendered `<head>`, no `favicon.ico`/`icon.png` under `src/app`, no `manifest.json`. But `public/brand/afrimesh-icon.png` exists and looks purpose-made for this.
- **Where:** rendered `<head>` of `/`; `public/brand/afrimesh-icon.png`
- **Why it may be a problem:** Browser tab shows a generic icon instead of the brand mark, on every single page.
- **User impact:** Minor — harder to spot the right tab; slightly less polished first impression.
- **Business impact:** Negligible alone; contributes to a "not quite finished" feel combined with similar small gaps.
- **Severity:** Low
- **Possible solution:** Add `src/app/icon.png` (Next App Router auto-wires this by file convention) using the existing asset.
- **Implementation notes:** Likely a one-file change.
- **Assumptions/unverified:** Didn't visually confirm the asset is appropriately cropped/sized for a favicon.

#### Finding: No Open Graph / social share meta tags anywhere in the codebase
- **Category:** SEO / Marketing
- **What I noticed:** `meta[property^="og:"]` query returns empty on every page checked. **[code]** confirms this isn't page-specific: `grep -rn "openGraph" src` returns **zero matches in the entire codebase**. Title tag and meta description ARE present and well-written at the root layout level ("AfriMesh — Where Commerce Connects" / "Africa's proximity commerce and payment infrastructure. Find what you need from trusted sellers nearby, pay securely, and get it delivered.").
- **Where:** every page's `<head>`; `src/app/layout.tsx` metadata export
- **Why it may be a problem:** Without `og:title`/`og:description`/`og:image`, links shared on WhatsApp/Twitter/Facebook/Slack render as a bare URL or an ugly fallback instead of a branded preview card. WhatsApp specifically is worth calling out given the Nigerian market context — link sharing via WhatsApp is extremely common there.
- **User impact:** n/a directly; affects how the brand looks when shared by others.
- **Business impact:** [hypothesis] For a marketplace that likely benefits from word-of-mouth/social sharing of individual products/shops, missing OG tags could measurably hurt click-through on shared links — can't verify without analytics.
- **Severity:** Medium-High (raised from my initial "Medium" after the code review confirmed it's total, not partial, and that it also affects product/shop pages specifically — see the SEO section below).
- **Possible solution:** Add `openGraph`/`twitter` fields to the root `metadata` export at minimum; per-product/shop dynamic OG data ideally.
- **Implementation notes:** Root-level is trivial; per-product/shop dynamic previews are more work (need at least one image per product/shop, or a generated OG image).

#### Finding: No robots.txt or sitemap
- **Category:** SEO
- **What I noticed:** No `robots.txt` in `public/`, no `sitemap.ts` in `src/app` **[code, confirmed]**.
- **Why it may be a problem:** Makes it harder for search engines to discover product/shop pages not otherwise linked from a crawlable path.
- **Business impact:** [hypothesis] Possible lower organic discoverability for product/shop pages — can't verify without search console data.
- **Severity:** Medium (matters more at public launch than in local dev, but cheap to have ready).
- **Possible solution:** Add `src/app/sitemap.ts` (Next supports a dynamic sitemap function) enumerating products/shops/categories from the DB, plus a basic `robots.txt`.

#### Finding: "Sign in" is a plain nav link, not a prominent CTA
- **Category:** UI Design / CTAs / Conversion
- **What I noticed:** In the header, "Sign in" appears as a small text link among icon-only nav items, not visually distinguished.
- **Why it may be a problem:** For an app where signing in presumably unlocks personalization/order history, low visual weight may mean new visitors overlook it and lose cart/search context later.
- **User impact:** Visitors may browse as guests longer than intended.
- **Business impact:** [hypothesis] Possible missed account-creation conversions — unverifiable without analytics.
- **Severity:** Low-Medium
- **Assumptions/unverified:** Could not visually confirm actual prominence/contrast (screenshot limitation) — flagged from DOM structure only, which doesn't fully prove visual weight either way. **Revisit with real screenshots.**

#### Finding: Shop ratings show "0.0 (0)" for shops with zero reviews
- **Category:** Content / Trust / Messaging
- **What I noticed:** "Ikeja Pharmacy Plus", "Adaobi Provisions", "BuildRight Materials" all show "0.0" with "(0)" review count on the homepage's Nearby Outlets section.
- **Why it may be a problem:** "0.0" reads as a failing rating at a glance, not "no reviews yet." Classic trust-UX mistake — new sellers always start at zero, so this pattern structurally makes brand-new (possibly great) sellers look bad, right at the moment the platform is also running a "Register your business" CTA to recruit more of them.
- **User impact:** Users may skip genuinely fine (just new) shops.
- **Business impact:** [hypothesis] Could suppress discovery/orders for new sellers — matters a lot for a marketplace trying to grow its seller base.
- **Severity:** Medium — plausible real impact, cheap fix.
- **Possible solution:** Show "New" / "No reviews yet" instead of "0.0 (0)" when review count is 0.
- **Worth investigating further:** Check if this repeats on the shop detail page and any rating-based sort/filter UI. [code] `Rating` component is at `src/components/ui.tsx` — check its zero-review handling directly as a follow-up.

#### Finding: Distance/ETA figures look like repetitive seed data — and the ratio itself looks physically odd
- **Category:** Content / Data quality
- **What I noticed:** Multiple distinct products all show "Nearest: 320 m · 25 min" or close variants. 320 meters in 25 minutes implies roughly 0.77 km/h, which isn't a realistic figure for walking, driving, or any normal transport mode.
- **Why it may matter:** Almost certainly seed/mock data, not a real bug — logged as a **TODO: sanity-check the ETA calculation** in `src/modules/logistics` once real data is available, in case the pairing isn't coincidental but reflects a units/formula bug (e.g. minutes computed against a different distance than the one displayed).
- **Severity:** N/A for now (test data) — flagged for future verification only.

---

### `/about` ("How the network works") — desktop, logged out

Console: clean. Meta description is **identical to the homepage's** — not customized per page (title tag IS unique: "How the network works · AfriMesh"). Heading hierarchy again correct (H1 → H2 → H3). No OG tags (see above, applies everywhere).

**Content quality note (positive):** this page transparently explains the ranking algorithm with actual weighted percentages (availability 30%, distance 25%, price 15%, rating 10%, delivery time 10%, trust 5%, purchase history 5%) and explicit platform rules (escrow, one-tier-at-a-time wholesale/retail, rating requires a real completed purchase, only real held stock is shown). This is a strong trust-building page — genuinely transparent in a way a lot of marketplaces aren't. Worth calling out as a strength, not just logging problems.

#### Finding: Meta description not customized per page
- **Category:** SEO
- **What I noticed:** `/about`'s meta description is word-for-word the same as `/`'s.
- **Why it may be a problem:** Search engines and shared links show the same generic description everywhere, wasting an opportunity to describe what's actually on each page (and duplicate meta descriptions across pages are a mild, well-known SEO smell).
- **Severity:** Low-Medium.
- **Possible solution:** Add page-specific `description` to each route's metadata export.
- **Worth investigating further:** [code] confirms this is systemic, not just this one page — see SEO section below for the fuller picture (35/41 pages DO set some metadata, but the highest-traffic dynamic pages set none at all).

---

### `/login` and `/register` — stuck on "Loading" (see headline finding for full detail)

Before the stuck-loading state, `read_page` (accessibility tree) DID capture the underlying form structure, worth noting as findings independent of the loading bug:

#### Finding: Very technical security copy shown on the public sign-in screen
- **Category:** Messaging / Content
- **What I noticed:** Footnote text on the login page reads: *"Sessions are opaque tokens stored hashed, so a database dump cannot be replayed into a live session and revocation is immediate."* **[code]** confirmed hardcoded in `src/app/login/page.tsx` as the `footnote` prop to `AuthLayout`.
- **Why it may be a problem:** This is engineer-to-engineer language ("opaque tokens," "database dump," "replayed into a live session") on a screen meant for ordinary shoppers. It may be intended as a trust signal ("we take security seriously") but the phrasing doesn't land that way for a non-technical audience — it more likely reads as confusing or even alarming ("wait, could our database get dumped?").
- **User impact:** Confusion, or an odd/unsettling first impression, for non-technical users at exactly the moment (signing in) trust matters most.
- **Business impact:** [hypothesis] Possibly minor drop-off from confused first-time visitors — unverifiable without data.
- **Severity:** Low-Medium.
- **Possible solution:** Either remove this footnote from the public-facing screen, or rewrite it in plain reassurance language (e.g. "Your account is protected with modern security — you can sign out of any device at any time.").
- **Implementation notes:** One string change in `src/app/login/page.tsx`.

#### Finding: Login form structure itself (from accessibility tree, before the hang) looks solid
- Phone number input properly wrapped in a real `<label>`, `type="tel"`, helpful placeholder format hint ("08030000001"), explanatory text "We will text you a 6-digit code." Two auth methods offered via tabs ("Phone + code" / "Password"). "Create an account" link present for discoverability. **[code]** confirms this pattern (real `<label>`s via a shared `Field` component, correct `autoComplete`/`inputMode` values) is consistent across the auth forms — see Forms section below for the full code-level review. Logging this as a positive, since it's easy to only report the hang and miss that the underlying form design is actually good.

---

### `/cart` — stuck on "Loading" (see headline finding)

Never got to see actual cart content or test add/remove/checkout interactions live, due to the hang. **[code]** confirms `src/app/cart/page.tsx:25-27` has an explicit "Your basket is empty" empty state and the page is a real, built-out 212-line implementation, not a stub — so the underlying code looks complete, this is purely the runtime-hang issue blocking verification.

---

### `/orders` — auth redirect works correctly, destination (login) does not

Navigating to `/orders` while logged out correctly redirected to `/login?next=%2Forders` — the auth guard logic itself is functioning. The resulting login page was stuck (see above).

---

### `/product/[id]` and `/shop/[slug]` — 500 error (Jest worker crash), see headline finding

Confirmed reproducible on two different product IDs and one shop slug, across full reloads. Raw internal Next.js dev-error JSON shown to the browser — no styled error page, no branding, a full stack trace exposed (`ChildProcessWorker.initialize`, file paths under `node_modules`). Even setting aside the underlying crash, **showing a raw unstyled JSON error dump instead of the app's own `error.tsx` boundary is itself worth noting** — in production mode this might render differently (Next's dev-only error overlay vs. production error handling can differ), but that's unverified here; worth checking specifically.

---

### `/search?q=rice` — stuck on "Loading" (see headline finding)

Never got to see live search results. **[code]** confirms `src/app/search/page.tsx` has real empty-state handling (`EmptyState` at lines 144, 151) and awaits `searchProducts`/`listCategories`/`buyerLocation` with no page-local try/catch (relies entirely on the route's error boundary) — noted in the Code Quality section below as a design tradeoff, not a defect.

---

### 404 test (`/this-page-does-not-exist-404-test`) — works correctly

Real, branded, well-written not-found page: "We could not find that page" / "The link may be out of date, or the item may no longer be listed." / "Back to shopping" link. This is a genuine strength — a lot of sites ship the framework default here.

---

## Accessibility (mostly from code review — [code review])

**Strengths, stated plainly:**
- Deliberate, consistent heading hierarchy across the whole app via shared `PageHeader`/`SectionHeading` components (`src/components/ui.tsx`) — sampled ~10 pages, pattern held everywhere. One page = one `<h1>`.
- Real `<label>`s throughout via a shared `Field` component, not placeholder-only labeling.
- `PageSkeleton`/loading states use `role="status" aria-live="polite" aria-busy"` with an `sr-only` "Loading" label, and the shimmer animation is deliberately not a "pulse" specifically to avoid confusing motion-sensitive users with what might read as a rendering fault (per an actual code comment explaining the reasoning) — this is unusually thoughtful.
- `AddToCart` announces results inline via `role="status"` rather than a toast, explicitly because "a screen reader might miss" a toast (per code comment) — sound reasoning, correctly implemented.
- No bare `<img>` without `alt` was found anywhere. Most product/seller/category thumbnails use `alt=""` deliberately (decorative, redundant with adjacent visible text) — defensible, though not verified for every call site (e.g. compact cart/order rows) that the pairing with visible text always holds. **[Low, spot-check flagged]**

**Real gaps found:**
- **No shared Modal/Dialog primitive exists at all** — every dropdown/sheet/overlay is hand-rolled per-component with inconsistent keyboard support (see next points). **Severity: Medium** (maintainability + inconsistent a11y).
- `HeaderMenu.tsx` (mobile hamburger sheet): closes on Escape, locks body scroll, has `aria-expanded`/`aria-label` — but **no focus trap and no focus management** (opening doesn't move focus in, closing doesn't return focus to the trigger). **Severity: Medium.**
- `LocationPicker.tsx` dropdown: has `aria-expanded` but **no Escape handler and no outside-click close** (unlike `HeaderMenu` and `SearchBar`, which both have one or the other) — a keyboard user has no way to dismiss it except re-activating the trigger. **Severity: Medium.**
- Essentially **zero `onKeyDown`/`tabIndex` usage anywhere** except two deliberate, well-commented exceptions. Concretely:
  - The login method-switcher (`role="tablist"`/`role="tab"` in `AuthForms.tsx`) has no arrow-key navigation between tabs, which the standard ARIA tabs pattern expects. Tab+Enter still works via native buttons. **Severity: Low.**
  - The search autocomplete suggestion list (`SearchBar.tsx`) is a plain list with no `role="listbox"`/`role="option"`, no `aria-expanded`/`aria-activedescendant`, and no arrow-key/Enter navigation — mouse-only. A keyboard-only or screen-reader user can still type and submit free-text search, but can't browse/select a suggestion. **Severity: Medium.**
- `Alert` component uses `role="status"` (polite) even for **error/danger messages** throughout auth/checkout/cart forms — error messages should generally use `role="alert"` (assertive) so screen readers interrupt to announce them; a polite live region may be missed entirely. **Severity: Medium.**
- **Real, verifiable logic bug, not just an a11y nitpick:** checkout radio options that should be disabled (e.g. pickup unavailable, insufficient wallet balance) only get `pointer-events-none opacity-50` on the wrapping label — the underlying `<input type="radio">` itself has no `disabled` attribute. A keyboard user tabbing through the (visually hidden) radio inputs can still land on and select a supposedly-disabled option. **Severity: Medium**, and notably this isn't purely an accessibility issue — it's a real interaction bug for keyboard users specifically. **Where:** `src/components/commerce/CheckoutForm.tsx` (~lines 44-53, 83-93).
- **No `next/image` usage anywhere** — every product/seller/category photo is a raw `<img>` with the Next lint rule individually suppressed. Not an a11y bug per se, but relevant to Core Web Vitals/LCP (no automatic width/height reservation, inconsistent manual `loading="lazy"` — present on some thumb components, absent on `CategoryRow.tsx`). **Severity: Low/Medium, performance-adjacent.**

---

## Empty / loading / error / success states

**This is simultaneously one of the strongest and most ironic areas of the whole audit.**

**The code itself is genuinely well-designed here** [code review]:
- Shared `EmptyState`, `ErrorState`, `PageSkeleton`/`Skeleton` primitives, used consistently. Root `error.tsx`/`loading.tsx` exist; section-specific overrides exist for `admin/` and `partner/` (both `error.tsx`+`loading.tsx`) and `rider/` (`loading.tsx` only, no dedicated `error.tsx` — falls back to root, inconsistent but not broken).
- `ErrorState`'s own code comments state an explicit design rule: "Never show a raw error message... tells an attacker something" — it shows a `digest` reference ID instead of raw error text, and always offers "Try again"/"Go back" actions. This is exactly the kind of thing that's easy to get wrong and here is done deliberately right.
- Empty states explicitly handled (confirmed via code, specific `EmptyState` usage + length guards) on: cart, favourites, notifications, messages, orders, search, shop detail, product detail, partner inventory, admin products — a genuinely thorough sweep, not just the obvious cases.
- Success/confirmation states are explicit, not silent redirects: inline `role="status"` messages after add-to-cart, a payment-status banner on the order-detail page reading `?payment=success`/`reason` query params after checkout.

**And yet, live on this exact instance, right now:** the loading state is the ONE thing that's actually broken — multiple pages got permanently stuck displaying nothing but the loading skeleton's accessible "Loading" text, with real content compiled into the DOM but never revealed (see headline finding). **This isn't a contradiction so much as the most important line in this whole document: a well-designed loading UI still needs the thing underneath it to actually resolve, and right now — on this machine, in this dev session — it doesn't reliably.** Worth stating both halves clearly: the design/implementation of these states is good; the current runtime reliability of resolving out of them is not.

- Data-fetching pages (e.g. `search/page.tsx`) await their data calls with no page-local try/catch, relying entirely on the route's `error.tsx` boundary — a legitimate architectural choice (module/action layers hold the try/catch, ~29/41 occurrences concentrated there), not a defect, but means no graceful partial-degradation (e.g. a category-list fetch failure takes down the whole search page, not just the filter). **Severity: Low/Medium, flagged as a tradeoff.**

---

## SEO

- Root layout sets `title` (with a good `%s · AfriMesh` template — child titles compose correctly, confirmed live: `/about` → "How the network works · AfriMesh", `/login` → "Sign in · AfriMesh"), `description`, `applicationName`. **No `openGraph` anywhere** (zero matches repo-wide), **no `metadataBase`, no `icons`, no `manifest`.** **Severity: Medium-High.**
- 35 of ~41 `page.tsx` files DO define their own metadata — decent coverage — **but the missing 6 are exactly the highest-value pages**: `product/[slug]`, `shop/[slug]`, `search`, `cart`, `orders`, `orders/[id]`, `barcode/[gtin]`, `partner/inventory/[id]`, `partner/orders/[id]`, and the homepage itself. Concretely: **a product page's title/description never reflect the actual product being viewed** — confirmed live (product page title didn't update from the previous page's title during the stuck-loading state, though that's entangled with the loading bug; the deeper code-level finding is that `generateMetadata` simply doesn't exist for these routes at all). **This is likely the single highest-value SEO fix available** — probably worth more than the OG-tags gap. **Severity: High.**
- No `robots.txt`, no `sitemap.ts` anywhere. **Severity: High** for a commerce site wanting organic product discovery.
- No favicon, no dedicated OG/social-share image asset anywhere in `public/` (only in-app brand marks and seller-uploaded logos exist).

---

## Forms

- Real forms found: login (phone+code / password), register, checkout, add-to-cart, wallet top-up/withdraw, search, plus partner-side business/product/inventory/API-key forms and admin forms. **No contact form or contact page exists anywhere in the app.** Worth asking whether that's intentional (e.g. support handled entirely via in-app messaging) or a genuine gap.
- Real `<label>`s throughout (shared `Field` component, `htmlFor` used consistently — 13× in `BusinessForm.tsx`, 13× in `InventoryForms.tsx`, 10× in `NewProductForm.tsx`, 9× in `AuthForms.tsx`, etc.). Placeholders are supplementary hints, not the only label. **Strength.**
- **Zod is genuinely used for validation** via a well-designed shared schema library in `src/lib/forms.ts` (reusable `phone`, `email`, `nairaAmount`, `quantity`, open-redirect-safe `internalPath`, etc.) — but validation is **server-only, post-submit**, via server actions. No client-side pre-submit validation layer exists, so every validation error costs a full round trip rather than instant inline feedback. **Severity: Low/Medium** — safe, just a slower feedback loop.
- **Inconsistent `required` attribute usage:** login form fields have native `required`; the register form's `fullName` does, but `phone`, `email`, and `password` (despite a `minLength={8}` hint) do not — relying solely on server-side rejection after submit. There's also **no visual required-field indicator convention** anywhere (no asterisk pattern in the shared `Field` component) — a sighted user can't tell which fields are mandatory before submitting. **Severity: Medium.**
- Input types/autocomplete attributes are done well where present: correct `type="tel"`/`type="email"`/`type="password"` with correctly-differentiated `autoComplete="current-password"` (login) vs `"new-password"` (register), `autoComplete="one-time-code"` + `inputMode="numeric"` for OTP — these are specific, easy-to-get-wrong details that are actually right. **Strength.**
- `CheckoutForm` uses proper `<fieldset>`/`<legend>` for radio groups (fulfilment choice, payment method) — correct semantic grouping. **Strength.** (Paired with the disabled-radio bug noted in Accessibility above.)
- Error messages render consistently via the shared `Alert`/`role="status"` pattern across all forms checked (see the `role="status"` vs `role="alert"` concern under Accessibility).

---

## Design-system consistency

**Contrary to the default assumption a checklist like this usually starts from ("is there drift/duplication"), this codebase is unusually disciplined** [code review]:
- A real, centralized, well-documented design-token system in `src/app/globals.css` (Tailwind 4 `@theme` block) — color tokens, a type scale, a z-index scale, custom utility classes — with comments explicitly citing WCAG AA contrast rationale per token. This reads as deliberate design-system work, not boilerplate.
- **Zero** arbitrary hex-color classes (`bg-[#...]`) and **zero** default-Tailwind-palette classes (`bg-red-500` etc.) anywhere in `src` — every color goes through the token system. Confirmed by repo-wide grep, not a sample.
- A real shared component library (`src/components/ui.tsx`, ~700 lines: `Card`, `Button`, `Badge`, `StatusPill`, `Field`, `Alert`, `EmptyState`, etc.) — 63 files import from it, and grepping for locally-reimplemented `Card`/`Button`/`Badge`/`StatusPill` elsewhere returns **zero** matches. Admin/commerce/rider/partner components genuinely consume the shared primitives.
- Naming conventions are consistent (PascalCase components, uniform `modulename/service.ts` structure across all 20 modules, correct Next.js file-convention names throughout).
- Minor nitpicks only: `ui.tsx` itself is lowercase-named unlike every other component file (cosmetic); ~22 inline `style={{}}` usages across 12 files, all for genuinely computed/dynamic values (chart bar widths) rather than a styling-system bypass; ~7 files use arbitrary Tailwind sizing values (`min-w-[46rem]` etc.) for structural table/sidebar widths, not color/token values. All **Low severity, essentially housekeeping.**

---

## Repeated / duplicated components

- **One real, worth-fixing duplication pattern:** an inline "filter pill" / status-tab visual pattern (`rounded-full px-3 py-1 text-xs font-medium` + conditional className) is copy-pasted across **at least 10 files** — `admin/events`, `admin/locations`, `admin/organisations`, `admin/products` (3× in one file alone), `partner/catalogue`, `partner/locations`, `partner/orders` (3×), `rider/page.tsx`, `search/page.tsx`, plus `NetworkView.tsx`, `AdminShell.tsx`, `PartnerShell.tsx` — despite `ui.tsx` already exporting a `Badge`/`StatusPill` component that isn't used for this specific case. **Severity: Medium** — no correctness bug, but any tweak to pill hover/focus/styling now means editing 10+ files by hand instead of one shared component.
- Things that superficially looked like duplication candidates (`NetworkView` vs `NetworkMap`/`HotspotMap`) turned out to be proper composition, not copy-paste — worth noting so it's not double-counted as a problem.
- Minor: a small `json()` response-formatting helper is duplicated (different signatures, same purpose) between `api/health/route.ts` and the shared `api/v1/_handler.ts`. **Low.**

---

## Code quality

- **Large files relative to neighbors:** `src/modules/orders/service.ts` at 975 lines — ~30% bigger than the next-largest module (`inventory/service.ts`, 714 lines) and nearly 3× the median module size. Also notable: `wallet/service.ts` (621 lines), `rewards/service.ts` (601 lines). Plausible splitting candidates. **Severity: Medium**, maintainability not correctness.
- **Zero TODO/FIXME/HACK/XXX comments anywhere in `src`** — either genuinely clean or actively policed. Positive, though it does mean there's no discoverable "honest debt list" to mine for quick wins.
- Commented-out code is minimal and deliberate — a documented "FUTURE-DASHBOARD" convention marks intentionally-shelved code (a delivery-partner storefront branch) across 9 files, explained inline as "kept whole so restoring it is one uncomment." Worth flagging to a client as dead-code-in-comments even though it's intentional and well-documented, since 9 files carry it. **Low.**
- 27 `console.log`/`console.error` call sites, consistently bracket-tagged (`[orders]`, `[wallet]`, etc.) — but **no structured logging library** (no pino/winston/Sentry equivalent) at all. Raw console is the entire logging/observability strategy in production code paths. **Severity: Medium** — real observability gap for something calling itself "payment infrastructure."
- Essentially zero `any` type usage; `@typescript-eslint/no-explicit-any` enforced as an error; `npx eslint .` returns **zero warnings/errors** on the full repo; `strict: true` in tsconfig; unused-vars enforced as an error with none found. **Strong baseline hygiene, positive finding.**
- **Real silent-failure bug:** `getOrder()` in `src/modules/orders/service.ts` wraps its lookup in `try { … } catch { return null }` with **no logging at all** — a DB connectivity failure or malformed row is indistinguishable from "order not found" to both the code and anyone debugging it later. **Severity: Medium**, and notably the kind of thing that could make the headline dev-server-instability issue *harder to diagnose* if it also affects real DB calls, not just compile workers — worth checking whether any of the stuck/500 pages are hitting this exact catch-and-swallow pattern.
- Most `modules/*/service.ts` files intentionally contain zero try/catch (errors propagate to the action/API layer, which does centralize handling) — a reasonable, consistent architecture. Exceptions: `src/app/actions/admin.ts` (all 9 actions) and `restock.ts` have no try/catch, unlike every other actions file, so unexpected errors there hard-crash to the `/admin` error boundary instead of returning a friendly inline error like sibling actions in the same file do. **Severity: Low-Medium, inconsistency not a crash risk** (admin does have its own error.tsx).
- The public `/api/autocomplete` route has **no try/catch and a different, inconsistent response shape** (raw array) compared to the `/api/v1/*` routes' centralized `{data,meta}`/`{error,meta}` envelope. If it throws, the client gets Next's default unhandled-error response instead of JSON. **Severity: Medium** — a public-facing endpoint with no defensive handling.
- **No live payment provider wired up anywhere.** `payments/service.ts` only implements a `mockGateway` that fakes success/failure based on `amount % 100 === 13`; the provider registry has exactly one entry. The module's own docblock describes a multi-provider design goal that isn't built yet. **Severity: High from a "is this production-ready" lens** — flagging explicitly since it's easy to miss if you only skim the module and see a working-looking abstraction. May well be known, intentional pre-launch state — logged as a fact either way, not an accusation.
- No evidence of messy prop-drilling or client-state sprawl (modest `useState` counts, no global client-state library, most logic server-side).

---

## Testing

- 9 test files total, using Node's built-in `node:test` runner via an experimental Node flag (`--experimental-strip-types`). One file (`conventions.test.ts`) is an architectural linter, not business-logic tests. The rest are unit tests for pure `src/lib/` helpers, plus exactly **one** `modules/*` service test (`storage/service.test.ts`).
- **19 of 20 domain modules have zero tests** — including, specifically, **identity, orders, payments, rewards, wallet** (every module the "critical paths" framing would flag first). **Severity: High** — order lifecycle transitions, payment/wallet balance mutations, and auth/OTP flows appear to have no automated regression coverage at all. No component/UI tests, no e2e (no Playwright/Cypress config found), no coverage tooling.

---

## Dependencies

- **Next 16.2.12 + React 19.2.8 together is a genuinely bleeding-edge pairing** — both very recent majors, real ecosystem-maturity/stability risk (some libraries may lag support). **Severity: Medium**, stability risk not a bug per se — and worth connecting explicitly to the headline dev-server-crash finding above: very new major versions of the exact tooling (Turbopack under Next 16) that's crashing here is at least circumstantially relevant, whether or not it's the actual cause.
- `@electric-sql/pglite` at 0.2.x — pre-1.0, API not yet stable by semver convention.
- **The entire test suite and several DB/dev scripts depend on `--experimental-strip-types`, an experimental Node.js flag** rather than a stable transpilation path (no Vitest/Jest/ts-node). A second bleeding-edge-tooling risk, independent of the Next/React one. **Severity: Medium.**
- Minimal dependency footprint otherwise (7 runtime deps, 10 dev deps) — no UI kit, no state-management library, no data-fetching library — consistent with the hand-rolled, disciplined design-system approach noted above.

---

## Missing pages or states (route-level)

- **All ~24 top-level route folders have a real `page.tsx`** — a full-tree grep for "coming soon"/TODO/"not implemented"/"under construction" returned zero hits. Short files (17-43 lines: `forbidden`, `barcode/[gtin]`, `partner/orders/[id]`, `register`, `rewards`, `rider/map`, `partner/rewards`, `orders/[id]`, `login`) are legitimate thin wrappers (auth guard + data fetch + shared view component), not stubs — confirmed by reading them, not just counting lines. **Genuinely no placeholder routes found — worth stating as a real positive**, since that's a common problem in codebases this size.
- **Only 3 of ~20 top-level route folders define their own `loading.tsx`/`error.tsx`**: `admin/` and `partner/` have both; `rider/` has `loading.tsx` only, no `error.tsx` (falls back to root). Every other route — including dynamic, data-heavy ones like `product/[slug]`, `shop/[slug]`, `orders/[id]`, `messages/[orderId]`, `barcode/[gtin]` — falls back to the generic root skeleton/error, not a purpose-built one (e.g. a product page shows the same 5-row generic skeleton as everything else, not a product-shaped one). **Severity: Medium**, UX polish gap not a defect — and circles back to the headline finding: these are exactly the routes that got stuck/500'd live.
- No dedicated `not-found.tsx` beyond the root — not verified whether the generic 404 copy is contextually appropriate for every `notFound()` call site (e.g. "product not found" vs "page not found" phrasing).
- No contact page anywhere (see Forms section).

---

## Opportunities (not just problems)

- The `/about` page's transparent ranking-algorithm explanation is a genuine differentiator worth leaning into further — e.g. surfacing *why* a specific result ranked where it did directly on the search/product page, not just in a separate About page, could reinforce trust at the moment it matters most (mid-purchase-decision), not just as background reading.
- The escrow/no-paid-placement/rating-requires-real-purchase rules are strong trust mechanics that aren't obviously surfaced anywhere *except* the About page — consider whether a lightweight trust badge/tooltip on product or shop cards themselves (not just a dedicated page) would carry more of that trust signal to where purchase decisions actually happen.
- Phone-number-first auth (OTP) with password as a secondary option is a sound default for the likely target market — worth confirming this is deliberate and leaning into it in onboarding copy/marketing rather than treating email/password as the "main" path.
- The disciplined design-token/component-library foundation (see Design-System Consistency) is a strong base to build faster on — worth explicitly investing in *keeping* that discipline (e.g. a lint rule against the one duplicated filter-pill pattern found) before it erodes the way the ui.tsx-vs-everything-else consistency clearly took real effort to establish.

---

## Open questions for the team

- Is the dev-server instability (stuck-loading pages, 500s, degrading over the session) something the team has already seen, or new? Does it reproduce on other machines / against a `next build` production build?
- Is the payments module's mock-only state known/intentional pre-launch scaffolding, or is a real provider integration already in progress elsewhere?
- Is the "Sessions are opaque tokens stored hashed..." login footnote intentional copy (a deliberate technical-trust signal for a specific audience), or would the team want it simplified?
- Is gating checkout-radio "disabled" state via CSS only (not the native `disabled` attribute) intentional for some reason (e.g. so screen readers can still announce why an option is unavailable), or an oversight? Worth a direct question before "fixing" it, in case there's a reason.
- Is there a reason `rider/` has no dedicated `error.tsx` while `admin/` and `partner/` both do — inconsistency, or is the rider surface considered lower-risk?
- Is a contact page/support channel intentionally absent (e.g. because support routes entirely through in-app messaging), or a gap?
- Was the "0.0 (0)" rating display for zero-review shops a deliberate choice, or just what the `Rating` component defaults to without anyone having specifically designed the zero-state?
