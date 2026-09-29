-- ===========================================================================
-- AfriMesh Commerce Platform / Project Nexus
-- Proximity Commerce & Payment Infrastructure Platform (PCPIP)
--
-- Source of truth for the relational schema. Plain PostgreSQL: runs unchanged
-- on the embedded PGlite dev database and on a managed PostgreSQL server.
--
-- Module boundaries (SAD "Database Architecture" / PRD CTO note) are expressed
-- as table groups. Each group is owned by exactly one module in src/modules/*
-- and is only reachable through that module's service interface, so a group can
-- later be lifted into its own service + database without touching callers.
--
--   identity      users, sessions, otp_codes
--   users/orgs    organisations, organisation_members
--   catalog       categories, brands, products
--   inventory     inventory_items, inventory_batches, stock_reservations,
--                 inventory_ledger
--   orders        orders, order_items, order_events
--   payments      payments
--   wallet        wallets, ledger_transactions, ledger_entries
--   rewards       referrals  (points live in wallets, in the PTS currency)
--   logistics     deliveries
--   notifications notifications
--   analytics     search_queries, product_views, ratings, favourites
--   platform      event_log, ranking_weights, platform_settings, fraud_alerts
--
-- MONEY: every monetary column is a BIGINT in the currency's *minor unit*
-- (kobo for NGN). Integers only - required for the double-entry wallet ledger
-- to balance exactly (SAD "Wallet Architecture").
--
-- POINTS: reward points are held in the same wallets and the same ledger, as a
-- separate currency ('PTS'). They are therefore double-entry, auditable and
-- visible on a statement for free, and a point can never be conjured into
-- existence - it is issued against the platform's points-float liability.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

-- Supply-chain tier. Ordinal ordering encodes the PRD business rules:
-- warehouses supply merchants, merchants supply outlets, outlets supply
-- consumers. A buyer may only purchase from the tier directly above it.
CREATE TYPE org_type AS ENUM (
  'manufacturer',   -- tier 1
  'warehouse',      -- tier 2  (dealer warehouse)
  'merchant',       -- tier 3  (wholesaler)
  'outlet',         -- tier 4  (neighbourhood retailer)
  'logistics'       -- cross-cutting, not a supply tier
);

-- RBAC roles, SAD "Authentication & Identity"
CREATE TYPE user_role AS ENUM (
  'consumer',
  'outlet',
  'merchant',
  'warehouse',
  'manufacturer',
  'delivery_partner',
  'platform_admin',
  'super_admin',
  'auditor'
);

CREATE TYPE account_status  AS ENUM ('pending', 'active', 'suspended', 'rejected');
CREATE TYPE verify_status   AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE product_status  AS ENUM ('draft', 'active', 'blocked');

CREATE TYPE order_status AS ENUM (
  'pending_payment',
  'confirmed',
  'preparing',
  'dispatched',
  'delivered',
  'completed',
  'cancelled',
  'refunded'
);

CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE payment_method AS ENUM ('wallet', 'bank_transfer', 'card', 'ussd', 'qr');

CREATE TYPE fulfilment_method AS ENUM ('pickup', 'delivery');

-- Inventory movements, from the Inventory Recommendation doc "Inventory Ledger"
CREATE TYPE movement_type AS ENUM (
  'received',
  'transferred',
  'sale',
  'return',
  'adjustment',
  'damage',
  'expiry',
  'reserved',
  'released'
);

CREATE TYPE reservation_status AS ENUM ('held', 'consumed', 'released', 'expired');

CREATE TYPE ledger_direction AS ENUM ('debit', 'credit');

CREATE TYPE ledger_txn_type AS ENUM (
  'deposit',
  'withdrawal',
  'transfer',
  'order_payment',
  'settlement',
  'platform_fee',
  'refund',
  'escrow_hold',
  'escrow_release',
  'cashback',
  -- Reward points issued for a qualified referral (PTS currency).
  'referral_reward',
  -- Points burned, and the matching naira paid out of platform revenue.
  'points_redemption'
);

-- A referral is pending until the person invited actually transacts; it is
-- void if the invitation is disqualified (self-referral, reversed order).
CREATE TYPE referral_status AS ENUM ('pending', 'rewarded', 'void');

CREATE TYPE notification_channel AS ENUM ('in_app', 'push', 'sms', 'email');
CREATE TYPE notification_status  AS ENUM ('queued', 'sent', 'failed');

CREATE TYPE delivery_status AS ENUM (
  'unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'
);

-- Which ranking model a weight belongs to (SAD "Recommendation Engine")
CREATE TYPE ranking_scope AS ENUM ('consumer', 'outlet', 'merchant');

-- ---------------------------------------------------------------------------
-- MODULE: identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          TEXT        NOT NULL,
  phone              TEXT        UNIQUE,
  email              TEXT        UNIQUE,
  password_hash      TEXT,
  role               user_role   NOT NULL DEFAULT 'consumer',
  status             account_status NOT NULL DEFAULT 'active',
  phone_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Trust score, 0..100. Feeds the recommendation engine's trust factor.
  trust_score        NUMERIC(5,2) NOT NULL DEFAULT 50,
  default_lat        DOUBLE PRECISION,
  default_lng        DOUBLE PRECISION,
  default_address    TEXT,
  city               TEXT,
  state              TEXT,
  country            TEXT        NOT NULL DEFAULT 'NG',

  -- Referral programme (rewards module). The code is minted lazily the first
  -- time someone opens their rewards screen, so existing accounts need no
  -- migration and accounts that never refer anyone carry no code at all.
  referral_code       TEXT UNIQUE,
  referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at      TIMESTAMPTZ,
  CONSTRAINT users_contact_present CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX users_role_idx     ON users (role);
CREATE INDEX users_referrer_idx ON users (referred_by_user_id);

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Phone + OTP login (SAD "Authentication Methods"). Codes are hashed at rest.
CREATE TABLE otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination  TEXT NOT NULL,
  channel      notification_channel NOT NULL DEFAULT 'sms',
  code_hash    TEXT NOT NULL,
  purpose      TEXT NOT NULL DEFAULT 'login',
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX otp_destination_idx ON otp_codes (destination, purpose);

-- ---------------------------------------------------------------------------
-- MODULE: users / organisations
-- Business identity for every non-consumer participant.
-- ---------------------------------------------------------------------------

CREATE TABLE organisations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT      NOT NULL,
  slug                TEXT      NOT NULL UNIQUE,
  type                org_type  NOT NULL,
  -- Denormalised tier ordinal so the supply-chain rule is a cheap integer
  -- comparison in SQL: a buyer at tier N may only buy from tier N-1.
  tier_level          INTEGER   NOT NULL,
  owner_user_id       UUID      REFERENCES users(id) ON DELETE SET NULL,
  registration_number TEXT,
  status              account_status NOT NULL DEFAULT 'pending',
  verification        verify_status  NOT NULL DEFAULT 'unverified',

  -- Location-aware inventory (Inventory doc §6). Every org is a stock location.
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  country             TEXT      NOT NULL DEFAULT 'NG',
  delivery_radius_km  NUMERIC(6,2) NOT NULL DEFAULT 5,

  -- Reputation inputs to the recommendation engine.
  rating              NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count        INTEGER      NOT NULL DEFAULT 0,
  trust_score         NUMERIC(5,2) NOT NULL DEFAULT 50,
  fulfilment_rate     NUMERIC(5,2) NOT NULL DEFAULT 100,
  avg_dispatch_minutes INTEGER     NOT NULL DEFAULT 45,

  phone               TEXT,
  email               TEXT,
  logo_url            TEXT,
  opens_at            TIME,
  closes_at           TIME,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at         TIMESTAMPTZ
);

CREATE INDEX organisations_type_idx    ON organisations (type);
CREATE INDEX organisations_geo_idx     ON organisations (lat, lng);
CREATE INDEX organisations_owner_idx   ON organisations (owner_user_id);

CREATE TABLE organisation_members (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'owner' | 'sales_rep'. What each may do is decided in src/lib/org-access.ts;
  -- any other value (the legacy 'staff' default included) is treated as a
  -- sales rep, never as an owner.
  role_in_org     TEXT NOT NULL DEFAULT 'staff',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

-- ---------------------------------------------------------------------------
-- MODULE: catalog
-- Master Product Catalogue - single source of truth (Inventory doc §1).
-- Sellers reference these records; they never create private duplicates.
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  parent_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE brands (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL UNIQUE,
  -- Logo of the company that makes the product. A shop often has no photo of
  -- the pack but knows the maker, and a recognised brand mark tells a buyer
  -- more than a pair of initials. Used as the fallback when a product has no
  -- photo of its own.
  logo_url TEXT
);

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gtin            TEXT UNIQUE,             -- barcode / GTIN
  sku             TEXT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  pack_size       TEXT,
  description     TEXT,
  image_url       TEXT,
  -- Batch/expiry tracking is mandatory for these (Inventory doc §7).
  requires_batch  BOOLEAN NOT NULL DEFAULT FALSE,
  status          product_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Denormalised search document, maintained by the catalog module.
  search_text     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_brand_idx    ON products (brand_id);
CREATE INDEX products_gtin_idx     ON products (gtin);
CREATE INDEX products_search_idx   ON products USING GIN (to_tsvector('simple', search_text));

-- ---------------------------------------------------------------------------
-- MODULE: inventory  - the Distributed Commerce Inventory Engine
-- AfriMesh never owns stock; each participant owns its own rows and publishes
-- availability to the network (Inventory doc "Core Design Principle").
-- ---------------------------------------------------------------------------

CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id)      ON DELETE CASCADE,

  -- Live Stock Engine (Inventory doc §3). Recommendations must read
  -- qty_available only - never total stock.
  qty_available   INTEGER NOT NULL DEFAULT 0 CHECK (qty_available >= 0),
  qty_reserved    INTEGER NOT NULL DEFAULT 0 CHECK (qty_reserved  >= 0),
  qty_incoming    INTEGER NOT NULL DEFAULT 0 CHECK (qty_incoming  >= 0),
  qty_sold        INTEGER NOT NULL DEFAULT 0,
  qty_returned    INTEGER NOT NULL DEFAULT 0,
  qty_damaged     INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 5,

  -- Price Layer (Inventory doc §8), minor units.
  retail_price      BIGINT,
  wholesale_price   BIGINT,
  promo_price       BIGINT,
  min_order_qty     INTEGER NOT NULL DEFAULT 1 CHECK (min_order_qty >= 1),
  currency          TEXT NOT NULL DEFAULT 'NGN',

  -- Location-aware inventory (Inventory doc §6): copied from the owning
  -- organisation so proximity ranking is a single-table scan.
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,

  is_listed       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, product_id)
);

CREATE INDEX inventory_product_idx  ON inventory_items (product_id);
CREATE INDEX inventory_org_idx      ON inventory_items (organisation_id);
CREATE INDEX inventory_geo_idx      ON inventory_items (lat, lng);
CREATE INDEX inventory_avail_idx    ON inventory_items (product_id, qty_available)
  WHERE is_listed = TRUE;

-- Batch & expiry tracking - medicines, food, agro inputs, chemicals.
CREATE TABLE inventory_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number      TEXT NOT NULL,
  manufactured_on   DATE,
  expires_on        DATE,
  qty               INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_batches_item_idx   ON inventory_batches (inventory_item_id);
CREATE INDEX inventory_batches_expiry_idx ON inventory_batches (expires_on);

-- Stock reservation (Inventory doc §4): hold on order, release on payment
-- failure or TTL expiry. This is what prevents overselling.
CREATE TABLE stock_reservations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  order_id          UUID,
  qty               INTEGER NOT NULL CHECK (qty > 0),
  status            reservation_status NOT NULL DEFAULT 'held',
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX reservations_order_idx  ON stock_reservations (order_id);
CREATE INDEX reservations_expiry_idx ON stock_reservations (status, expires_at);

-- Inventory Ledger (Inventory doc §5): append-only. Never UPDATE or DELETE.
-- Every movement is traceable and auditable.
CREATE TABLE inventory_ledger (
  id                BIGSERIAL PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  organisation_id   UUID NOT NULL REFERENCES organisations(id)   ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id)        ON DELETE CASCADE,
  movement          movement_type NOT NULL,
  qty_delta         INTEGER NOT NULL,
  qty_after         INTEGER NOT NULL,
  reference_type    TEXT,
  reference_id      TEXT,
  actor_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_ledger_item_idx ON inventory_ledger (inventory_item_id, created_at DESC);
CREATE INDEX inventory_ledger_org_idx  ON inventory_ledger (organisation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- MODULE: orders
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      TEXT NOT NULL UNIQUE,

  buyer_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- NULL for a B2C consumer order; set for every B2B tier order.
  buyer_org_id      UUID REFERENCES organisations(id) ON DELETE RESTRICT,
  seller_org_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,

  -- Tier of the buying side. Enforces the PRD business rules together with
  -- the seller's tier: buyer_tier must equal seller_tier + 1.
  buyer_tier        INTEGER NOT NULL,
  seller_tier       INTEGER NOT NULL,

  status            order_status   NOT NULL DEFAULT 'pending_payment',
  payment_status    payment_status NOT NULL DEFAULT 'pending',

  subtotal          BIGINT NOT NULL DEFAULT 0,
  delivery_fee      BIGINT NOT NULL DEFAULT 0,
  platform_fee      BIGINT NOT NULL DEFAULT 0,
  total             BIGINT NOT NULL DEFAULT 0,
  currency          TEXT   NOT NULL DEFAULT 'NGN',

  fulfilment        fulfilment_method NOT NULL DEFAULT 'delivery',
  delivery_address  TEXT,
  delivery_lat      DOUBLE PRECISION,
  delivery_lng      DOUBLE PRECISION,
  distance_km       NUMERIC(8,2),
  eta_minutes       INTEGER,

  placed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  dispatched_at     TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,

  CONSTRAINT orders_tier_rule CHECK (buyer_tier = seller_tier + 1)
);

CREATE INDEX orders_buyer_idx       ON orders (buyer_user_id, placed_at DESC);
CREATE INDEX orders_buyer_org_idx   ON orders (buyer_org_id, placed_at DESC);
CREATE INDEX orders_seller_idx      ON orders (seller_org_id, placed_at DESC);
CREATE INDEX orders_status_idx      ON orders (status);

CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  -- Snapshot: an order must render identically forever, even if the catalogue
  -- entry or the seller's price changes afterwards.
  name_snapshot     TEXT   NOT NULL,
  image_snapshot    TEXT,
  unit_price        BIGINT NOT NULL,
  qty               INTEGER NOT NULL CHECK (qty > 0),
  line_total        BIGINT NOT NULL
);

CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      order_status NOT NULL,
  note        TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- MODULE: wallet - double-entry ledger (SAD "Wallet Architecture")
-- Invariant: for every ledger_transaction, SUM(debits) = SUM(credits).
-- ---------------------------------------------------------------------------

CREATE TABLE wallets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('user', 'organisation', 'platform')),
  owner_id     UUID,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  -- balance = available + locked. Locked funds are held in escrow.
  available    BIGINT NOT NULL DEFAULT 0,
  locked       BIGINT NOT NULL DEFAULT 0,
  status       account_status NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id, currency)
);

CREATE TABLE ledger_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference   TEXT NOT NULL UNIQUE,
  type        ledger_txn_type NOT NULL,
  amount      BIGINT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'NGN',
  narration   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
  wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  direction      ledger_direction NOT NULL,
  amount         BIGINT NOT NULL CHECK (amount > 0),
  balance_after  BIGINT NOT NULL,
  narration      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_wallet_idx ON ledger_entries (wallet_id, created_at DESC);
CREATE INDEX ledger_entries_txn_idx    ON ledger_entries (transaction_id);

-- ---------------------------------------------------------------------------
-- MODULE: rewards - the referral programme
--
-- "Refer a shop like yours." Each tier grows the tier below its supplier:
-- a consumer brings another consumer to a retail outlet, an outlet brings
-- another outlet to a merchant, a merchant brings another merchant to a
-- warehouse. The programme a referral belongs to is therefore the referrer's
-- own tier, recorded at the moment the reward is paid.
--
-- Nothing is paid on sign-up. A referral only earns once the person invited
-- completes a real order above a floor value, which is what stops the
-- programme paying for accounts rather than for commerce.
-- ---------------------------------------------------------------------------

CREATE TABLE referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- UNIQUE: a person can be referred exactly once, ever. Without this the same
  -- account could be re-credited by every referrer who got hold of its id.
  referred_user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  -- consumer | outlet | merchant | warehouse | manufacturer
  programme           TEXT NOT NULL DEFAULT 'consumer',
  status              referral_status NOT NULL DEFAULT 'pending',

  points_awarded      BIGINT NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  -- Who the points went to. A business owner's referral earns for the
  -- business, not for their personal wallet.
  beneficiary_type    TEXT CHECK (beneficiary_type IN ('user', 'organisation')),
  beneficiary_id      UUID,

  qualifying_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at         TIMESTAMPTZ,

  CONSTRAINT referrals_no_self CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX referrals_referrer_idx ON referrals (referrer_user_id, created_at DESC);
CREATE INDEX referrals_pending_idx  ON referrals (referred_user_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- MODULE: payments
-- The payment service abstracts providers behind one interface, so a regional
-- provider can be added without touching business logic (SAD).
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID REFERENCES orders(id) ON DELETE CASCADE,
  payer_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  method         payment_method NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'mock',
  provider_ref   TEXT,
  amount         BIGINT NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'NGN',
  status         payment_status NOT NULL DEFAULT 'pending',
  failure_reason TEXT,

  -- Where the money lands when this payment settles. NULL is the payer's own
  -- user wallet, which covers every order payment. A wallet top-up sets it
  -- explicitly, because a business account topping up must not credit the
  -- individual who happened to press the button.
  credit_owner_type TEXT CHECK (credit_owner_type IN ('user', 'organisation')),
  credit_owner_id   UUID,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,

  -- Both or neither: half a credit target is a payment that settles somewhere
  -- unintended.
  CONSTRAINT payments_credit_owner_complete CHECK (
    (credit_owner_type IS NULL) = (credit_owner_id IS NULL)
  )
);

CREATE INDEX payments_order_idx ON payments (order_id);
CREATE INDEX payments_payer_idx ON payments (payer_user_id, created_at DESC);

-- A provider webhook arrives knowing only its own reference, so that is the
-- key the settlement path looks a payment up by. Unique because two payments
-- sharing a provider reference would make settlement ambiguous, and NULL is
-- exempt from the constraint, so wallet payments and unstarted attempts are
-- unaffected.
CREATE UNIQUE INDEX payments_provider_ref_idx ON payments (provider_ref)
  WHERE provider_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Webhook idempotency
--
-- Payment providers retry: on a timeout, on any non-2xx, and sometimes simply
-- because they do. Without a record of what has already been handled, a retry
-- of charge.success credits the buyer's wallet a second time for one payment.
-- The unique constraint is the whole mechanism — the settling transaction
-- inserts here first, and a duplicate delivery loses the race and does nothing.
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX webhook_events_received_idx ON webhook_events (provider, received_at DESC);

-- ---------------------------------------------------------------------------
-- MODULE: payouts - withdrawals from a wallet to a Nigerian bank account
--
-- A bank account is saved only after the provider has resolved the account
-- number to a name, and that name is what the owner confirmed. The provider's
-- recipient code is kept so a repeat withdrawal needs no second lookup.
--
-- A payout debits the wallet when it is requested, in the same transaction as
-- its own row, and is then sent through the provider. A failed or reversed
-- transfer puts the money back; nothing is ever paid out that the ledger did
-- not first take from the wallet.
-- ---------------------------------------------------------------------------

CREATE TYPE payout_status AS ENUM ('processing', 'paid', 'failed');

CREATE TABLE bank_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type         TEXT NOT NULL CHECK (owner_type IN ('user', 'organisation')),
  owner_id           UUID NOT NULL,
  bank_code          TEXT NOT NULL,
  bank_name          TEXT NOT NULL,
  account_number     TEXT NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name       TEXT NOT NULL,
  recipient_code     TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id, bank_code, account_number)
);

CREATE INDEX bank_accounts_owner_idx ON bank_accounts (owner_type, owner_id);

CREATE TABLE payouts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ours, sent to the provider and echoed back on its webhooks.
  reference            TEXT NOT NULL UNIQUE,
  owner_type           TEXT NOT NULL CHECK (owner_type IN ('user', 'organisation')),
  owner_id             UUID NOT NULL,
  -- Kept even if the account is later removed: the payout must stay readable.
  bank_account_id      UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  bank_name            TEXT NOT NULL,
  account_number       TEXT NOT NULL,
  account_name         TEXT NOT NULL,
  amount               BIGINT NOT NULL CHECK (amount > 0),
  currency             TEXT NOT NULL DEFAULT 'NGN',
  status               payout_status NOT NULL DEFAULT 'processing',
  provider             TEXT NOT NULL,
  provider_ref         TEXT,
  failure_reason       TEXT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX payouts_owner_idx  ON payouts (owner_type, owner_id, created_at DESC);
CREATE INDEX payouts_status_idx ON payouts (status) WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- MODULE: logistics
-- ---------------------------------------------------------------------------

CREATE TABLE deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  rider_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  status         delivery_status NOT NULL DEFAULT 'unassigned',
  pickup_lat     DOUBLE PRECISION,
  pickup_lng     DOUBLE PRECISION,
  dropoff_lat    DOUBLE PRECISION,
  dropoff_lng    DOUBLE PRECISION,
  distance_km    NUMERIC(8,2),
  eta_minutes    INTEGER,
  -- What the rider earns for this job, taken out of the order's delivery fee.
  -- Fixed when the job is created so the offer a rider accepts cannot change.
  rider_fee      BIGINT NOT NULL DEFAULT 0,
  proof_note     TEXT,
  proof_url      TEXT,
  assigned_at    TIMESTAMPTZ,
  picked_up_at   TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deliveries_order_idx  ON deliveries (order_id);
CREATE INDEX deliveries_rider_idx  ON deliveries (rider_user_id, status);
CREATE INDEX deliveries_open_idx   ON deliveries (status) WHERE status = 'unassigned';

-- ---------------------------------------------------------------------------
-- MODULE: messaging
-- "Customer communication" (PRD Retailer Module).
--
-- Conversations are scoped to an order rather than being open-ended. Both
-- sides then have a shared, verifiable subject, and a stranger cannot message
-- a shop out of the blue - which is what stops the inbox becoming a spam
-- channel the moment the network grows.
-- ---------------------------------------------------------------------------

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_org_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX conversations_buyer_idx  ON conversations (buyer_user_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON conversations (seller_org_id, last_message_at DESC);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which side of the trade sent it, so the thread renders correctly even if
  -- the seller's staff member who replied is no longer with the business.
  sender_side     TEXT NOT NULL CHECK (sender_side IN ('buyer', 'seller')),
  body            TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- MODULE: notifications - event-driven, retryable, multi-channel
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel        notification_channel NOT NULL DEFAULT 'in_app',
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'general',
  reference_type TEXT,
  reference_id   TEXT,
  status         notification_status NOT NULL DEFAULT 'queued',
  attempts       INTEGER NOT NULL DEFAULT 0,
  read_at        TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- MODULE: support
-- ---------------------------------------------------------------------------

-- Inbound "Contact us" submissions. `user_id` is nullable on purpose: the
-- showcase landing page and the shop/product pages it leads to are the most
-- likely place someone reaches for this before they have an account.
CREATE TABLE contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  -- Which shell the visitor was in when they reached the form, so a real
  -- support inbox can triage a shopkeeper's question differently from a
  -- shopper's.
  source     TEXT NOT NULL DEFAULT 'consumer',
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX contact_messages_created_idx ON contact_messages (created_at DESC);

-- ---------------------------------------------------------------------------
-- MODULE: analytics / demand intelligence (Inventory doc §9)
-- ---------------------------------------------------------------------------

CREATE TABLE search_queries (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  query         TEXT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  results_count INTEGER NOT NULL DEFAULT 0,
  took_ms       INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX search_queries_query_idx ON search_queries (query);

CREATE TABLE product_views (
  id         BIGSERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_views_product_idx ON product_views (product_id, created_at DESC);

-- Ratings require a verified transaction (PRD business rule) - hence the
-- mandatory, unique order reference.
CREATE TABLE ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  rater_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  stars           INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ratings_org_idx ON ratings (organisation_id);

CREATE TABLE favourites (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT favourites_target CHECK (num_nonnulls(product_id, organisation_id) = 1)
);

CREATE UNIQUE INDEX favourites_product_uidx ON favourites (user_id, product_id)      WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX favourites_org_uidx     ON favourites (user_id, organisation_id) WHERE organisation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- MODULE: api - the public platform API
--
-- "AfriMesh will be API-first ... API licensing is expected to become a
-- strategic revenue stream." - CIM Volume III §9, API Platform Strategy.
--
-- Machine clients authenticate with a key rather than a session: a Flutter
-- app, a bank integration or a manufacturer's ERP has no browser, no cookie
-- jar and no person to re-authenticate it. Keys are stored hashed for the same
-- reason session tokens are - a database dump must not be replayable.
--
-- Every key is bound to one organisation and carries explicit scopes, so an
-- integration built for stock levels cannot read anybody's orders.
-- ---------------------------------------------------------------------------

CREATE TYPE api_key_status AS ENUM ('active', 'revoked');

CREATE TABLE api_keys (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  -- Shown in the UI and carried in the key itself, so a key can be identified
  -- in a log or a support conversation without ever revealing the secret.
  prefix             TEXT NOT NULL UNIQUE,
  key_hash           TEXT NOT NULL UNIQUE,

  organisation_id    UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Least privilege by default: a key with no scopes can read nothing.
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  status             api_key_status NOT NULL DEFAULT 'active',
  -- Per-key ceiling, so one noisy integration cannot exhaust the platform for
  -- everybody else (SAD/CIM §10, secure API authentication).
  rate_limit_per_min INTEGER NOT NULL DEFAULT 120 CHECK (rate_limit_per_min > 0),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ
);

CREATE INDEX api_keys_org_idx    ON api_keys (organisation_id);
CREATE INDEX api_keys_active_idx ON api_keys (key_hash) WHERE status = 'active';

-- Append-only request log. Serves three purposes at once: the rate-limit
-- window, the audit trail the CIM's security section requires, and the usage
-- record any future metered billing would be computed from.
CREATE TABLE api_requests (
  id          BIGSERIAL PRIMARY KEY,
  api_key_id  UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  request_id  TEXT NOT NULL,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_requests_key_idx  ON api_requests (api_key_id, created_at DESC);
CREATE INDEX api_requests_time_idx ON api_requests (created_at DESC);

-- ---------------------------------------------------------------------------
-- MODULE: platform - event log, configuration, fraud
-- ---------------------------------------------------------------------------

-- "Comprehensive event logging from day one to support future analytics, AI
-- and graph-based intelligence" (PRD CTO note). Append-only; this table is the
-- seam where an Apache Kafka topic is introduced when scale demands it.
CREATE TABLE event_log (
  id             BIGSERIAL PRIMARY KEY,
  event_type     TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id   TEXT NOT NULL,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_log_type_idx      ON event_log (event_type, occurred_at DESC);
CREATE INDEX event_log_aggregate_idx ON event_log (aggregate_type, aggregate_id);

-- Recommendation weights live in data, not code: "Weights should be
-- configurable without changing application code" (SAD).
CREATE TABLE ranking_weights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      ranking_scope NOT NULL,
  factor     TEXT NOT NULL,
  weight     NUMERIC(5,2) NOT NULL CHECK (weight >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, factor)
);

CREATE TABLE platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fraud_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'low',
  detail          TEXT,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fraud_alerts_open_idx ON fraud_alerts (resolved, created_at DESC);
