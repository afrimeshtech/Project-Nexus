-- ---------------------------------------------------------------------------
-- AfriMesh Circular - circular-economy materials network
-- Specification: "AfriMesh Circular - Technical Architecture and
-- Implementation Specification" (AfriMesh Circular.pdf)
--
-- A native Commerce module, so these tables live beside Commerce's in
-- `public` and point at its records with real foreign keys: businesses are
-- organisations, people are users, payments are AfriMesh Pay's payments and
-- deliveries are AfriMesh Logistics' deliveries (§1, §6 "All business
-- references must connect to the existing AfriMesh business records",
-- §16). The opposite of ProductDNA, which the specification makes a
-- separate domain - see docs/circular.md.
--
-- Circular keeps its own resource catalogue and listings; it does not reuse
-- the retail products or inventory (§5 "must not overload the existing
-- retail product inventory").
--
-- Dormant: see src/lib/launch-circular.ts. Creating these tables changes
-- nothing for Commerce; nothing reads or writes them until launch.
--
-- Applied by db:push after schema.sql on a fresh database, and by hand on an
-- existing one. Safe to run twice.
--
-- Money is BIGINT minor units (kobo), as everywhere in the platform.
-- Quantities are NUMERIC: materials trade in tonnes and litres, not whole
-- items (§5.2 "Do not assume all resources are sold by individual product
-- units"). Status sets the specification names but does not list are marked
-- PROVISIONAL, to confirm in the phase that first uses them.
-- ---------------------------------------------------------------------------

-- 5.1 Hierarchical, database-driven taxonomy ---------------------------------
CREATE TABLE IF NOT EXISTS circular_resource_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    UUID REFERENCES circular_resource_categories(id) ON DELETE RESTRICT,
  -- Stable key, so the seed below and any later additions are idempotent.
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Units a material can be measured in (§5.2).
-- kg, tonne, litre, cubic_metre per the specification; unit and bale for
-- counted or baled goods (reusable building components, baled cardboard).
-- Conversions between them live in modules/circular/matching.ts.

CREATE TABLE IF NOT EXISTS circular_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID NOT NULL REFERENCES circular_resource_categories(id) ON DELETE RESTRICT,
  resource_name   TEXT NOT NULL,
  material_type   TEXT,
  description     TEXT,
  default_unit    TEXT NOT NULL DEFAULT 'kg'
    CHECK (default_unit IN ('kg', 'tonne', 'litre', 'cubic_metre', 'unit', 'bale')),
  -- Material-specific specifications (grade, purity, moisture...), free-form
  -- until each category's attributes are settled.
  specifications  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, resource_name)
);

-- §4: roles are capabilities on the existing business account, never a
-- separate account per role. A business may hold several.
CREATE TABLE IF NOT EXISTS circular_business_capabilities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  capability_type      TEXT NOT NULL CHECK (capability_type IN (
                         'RESOURCE_GENERATOR', 'RECYCLER', 'RESOURCE_AGGREGATOR',
                         'MATERIAL_PROCESSOR', 'RESOURCE_BUYER')),
  verification_status  TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, capability_type)
);

-- 5.2 Listings ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS circular_listings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id             UUID NOT NULL REFERENCES circular_resources(id) ON DELETE RESTRICT,
  business_id             UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  listing_type            TEXT NOT NULL DEFAULT 'RECYCLABLE'
    CHECK (listing_type IN ('SURPLUS', 'RECYCLABLE', 'REUSABLE', 'BY_PRODUCT')),   -- PROVISIONAL
  material_name           TEXT NOT NULL,
  description             TEXT,
  quantity_available      NUMERIC(14, 3) NOT NULL CHECK (quantity_available >= 0),
  unit                    TEXT NOT NULL
    CHECK (unit IN ('kg', 'tonne', 'litre', 'cubic_metre', 'unit', 'bale')),
  minimum_quantity        NUMERIC(14, 3) CHECK (minimum_quantity IS NULL OR minimum_quantity > 0),
  replenishment_quantity  NUMERIC(14, 3) CHECK (replenishment_quantity IS NULL OR replenishment_quantity > 0),
  replenishment_interval  TEXT CHECK (replenishment_interval IN ('WEEKLY', 'MONTHLY', 'QUARTERLY')), -- PROVISIONAL
  price_type              TEXT NOT NULL DEFAULT 'NEGOTIABLE'
    CHECK (price_type IN ('FIXED', 'NEGOTIABLE', 'FREE')),
  price_per_unit          BIGINT CHECK (price_per_unit IS NULL OR price_per_unit >= 0),
  currency                TEXT NOT NULL DEFAULT 'NGN',
  collection_preference   TEXT NOT NULL DEFAULT 'EITHER'
    CHECK (collection_preference IN ('SELLER_DELIVERS', 'BUYER_COLLECTS', 'THIRD_PARTY', 'EITHER')),
  -- Same coordinate convention as organisations: the listing's own location,
  -- defaulting to the business's when created.
  lat                     DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                     DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_reference      TEXT,
  -- What this particular lot measures as (grade, purity, moisture...), which
  -- a requirement's mandatory specifications are checked against (§7.1).
  specifications          JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition               TEXT NOT NULL DEFAULT 'SORTED'
    CHECK (condition IN ('NEW_SURPLUS', 'CLEAN_SORTED', 'SORTED', 'MIXED', 'CONTAMINATED')), -- PROVISIONAL
  availability_status     TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (availability_status IN ('DRAFT', 'AVAILABLE', 'EXHAUSTED', 'WITHDRAWN', 'EXPIRED')),
  published_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A fixed price is stated; a free listing carries none.
  CHECK (price_type <> 'FIXED' OR price_per_unit IS NOT NULL),
  CHECK (price_type <> 'FREE' OR price_per_unit IS NULL),
  -- Live means published.
  CHECK (availability_status <> 'AVAILABLE' OR published_at IS NOT NULL)
);

-- Images and supporting documents (§5.2). Stored through the existing media
-- storage (modules/storage) - this table only references the result.
CREATE TABLE IF NOT EXISTS circular_listing_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES circular_listings(id) ON DELETE CASCADE,
  media_url   TEXT NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'DOCUMENT')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What a business needs ------------------------------------------------------
CREATE TABLE IF NOT EXISTS circular_requirements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  resource_id          UUID NOT NULL REFERENCES circular_resources(id) ON DELETE RESTRICT,
  required_quantity    NUMERIC(14, 3) NOT NULL CHECK (required_quantity > 0),
  unit                 TEXT NOT NULL
    CHECK (unit IN ('kg', 'tonne', 'litre', 'cubic_metre', 'unit', 'bale')),
  -- Worst condition acceptable, on the listing condition scale.
  minimum_quality      TEXT NOT NULL DEFAULT 'MIXED'
    CHECK (minimum_quality IN ('NEW_SURPLUS', 'CLEAN_SORTED', 'SORTED', 'MIXED', 'CONTAMINATED')),
  -- Where to search from: the business's own location unless set.
  preferred_lat        DOUBLE PRECISION CHECK (preferred_lat BETWEEN -90 AND 90),
  preferred_lng        DOUBLE PRECISION CHECK (preferred_lng BETWEEN -180 AND 180),
  location_reference   TEXT,
  maximum_distance_km  NUMERIC(8, 2) CHECK (maximum_distance_km IS NULL OR maximum_distance_km > 0),
  -- §7.3: when true, several listings may together satisfy the requirement.
  accepts_partial      BOOLEAN NOT NULL DEFAULT false,
  budget_type          TEXT NOT NULL DEFAULT 'NEGOTIABLE'
    CHECK (budget_type IN ('FIXED', 'NEGOTIABLE', 'OPEN')),                     -- PROVISIONAL
  maximum_price        BIGINT CHECK (maximum_price IS NULL OR maximum_price >= 0), -- per unit, kobo
  status               TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'MATCHED', 'FULFILLED', 'CANCELLED', 'EXPIRED')), -- PROVISIONAL
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((preferred_lat IS NULL) = (preferred_lng IS NULL))
);

-- §7: what the matching engine found ---------------------------------------
CREATE TABLE IF NOT EXISTS circular_matches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id           UUID NOT NULL REFERENCES circular_listings(id) ON DELETE CASCADE,
  requirement_id       UUID NOT NULL REFERENCES circular_requirements(id) ON DELETE CASCADE,
  distance_km          NUMERIC(8, 2) NOT NULL CHECK (distance_km >= 0),
  compatibility_score  NUMERIC(5, 2) NOT NULL CHECK (compatibility_score BETWEEN 0 AND 100),
  -- §7.3: only a listing that meets the specification and the quantity on
  -- its own is "fully qualified"; partial ones are kept but marked.
  fully_qualified      BOOLEAN NOT NULL,
  match_status         TEXT NOT NULL DEFAULT 'SUGGESTED'
    CHECK (match_status IN ('SUGGESTED', 'VIEWED', 'ENQUIRED', 'DISMISSED')),    -- PROVISIONAL
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, requirement_id)
);

-- §9 discovery stage: enquiry and negotiation, no money moves ---------------
CREATE TABLE IF NOT EXISTS circular_enquiries (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id              UUID NOT NULL REFERENCES circular_listings(id) ON DELETE CASCADE,
  requesting_business_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  requested_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_quantity      NUMERIC(14, 3) NOT NULL CHECK (requested_quantity > 0),
  proposed_price          BIGINT CHECK (proposed_price IS NULL OR proposed_price >= 0), -- per unit, kobo
  message                 TEXT,
  enquiry_status          TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (enquiry_status IN ('OPEN', 'NEGOTIATING', 'AGREED', 'DECLINED', 'WITHDRAWN', 'EXPIRED')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- §9 transaction stage --------------------------------------------------------
CREATE TABLE IF NOT EXISTS circular_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id            UUID NOT NULL REFERENCES circular_listings(id) ON DELETE RESTRICT,
  enquiry_id            UUID REFERENCES circular_enquiries(id) ON DELETE SET NULL,
  buyer_business_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  seller_business_id    UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  agreed_quantity       NUMERIC(14, 3) NOT NULL CHECK (agreed_quantity > 0),
  agreed_unit           TEXT NOT NULL
    CHECK (agreed_unit IN ('kg', 'tonne', 'litre', 'cubic_metre', 'unit', 'bale')),
  -- The whole agreed price, in kobo: what AfriMesh Pay is asked to collect.
  agreed_price          BIGINT NOT NULL CHECK (agreed_price >= 0),
  currency              TEXT NOT NULL DEFAULT 'NGN',
  transaction_status    TEXT NOT NULL DEFAULT 'CREATED'
    CHECK (transaction_status IN (
      'CREATED', 'PAYMENT_INITIATED', 'PAYMENT_VERIFIED', 'LOGISTICS_ARRANGED',
      'MATERIAL_HANDED_OVER', 'COMPLETION_CONFIRMED', 'CLOSED',
      'CANCELLED', 'DISPUTED', 'FAILED', 'REFUNDED', 'EXPIRED')),
  -- §10: an online payment AfriMesh verified, or a deal settled off-platform
  -- that the parties only declared. Never confused.
  payment_basis         TEXT NOT NULL DEFAULT 'ONLINE'
    CHECK (payment_basis IN ('ONLINE', 'OFFLINE_DECLARED', 'NO_CHARGE')),
  -- The existing AfriMesh Pay and Logistics records - not copies (§10, §11).
  payment_id            UUID REFERENCES payments(id) ON DELETE RESTRICT,
  delivery_id           UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (buyer_business_id <> seller_business_id),
  CHECK (payment_basis <> 'NO_CHARGE' OR agreed_price = 0)
);

-- Append-only history of every transaction state change (§6, §13 audit).
CREATE TABLE IF NOT EXISTS circular_transaction_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL REFERENCES circular_transactions(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL,
  previous_status  TEXT,
  new_status       TEXT,
  actor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS circular_categories_parent_idx ON circular_resource_categories (parent_id);
CREATE INDEX IF NOT EXISTS circular_resources_category_idx ON circular_resources (category_id);
CREATE INDEX IF NOT EXISTS circular_listings_business_idx ON circular_listings (business_id);
-- Discovery only ever looks at live listings.
CREATE INDEX IF NOT EXISTS circular_listings_discoverable_idx
  ON circular_listings (resource_id, expires_at) WHERE availability_status = 'AVAILABLE';
CREATE INDEX IF NOT EXISTS circular_requirements_business_idx ON circular_requirements (business_id, status);
CREATE INDEX IF NOT EXISTS circular_matches_requirement_idx ON circular_matches (requirement_id, compatibility_score DESC);
CREATE INDEX IF NOT EXISTS circular_enquiries_listing_idx ON circular_enquiries (listing_id, enquiry_status);
CREATE INDEX IF NOT EXISTS circular_transactions_buyer_idx ON circular_transactions (buyer_business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS circular_transactions_seller_idx ON circular_transactions (seller_business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS circular_transaction_events_tx_idx ON circular_transaction_events (transaction_id, created_at);
-- A payment settles at most one Circular transaction (§13 duplicate processing).
CREATE UNIQUE INDEX IF NOT EXISTS circular_transactions_one_per_payment
  ON circular_transactions (payment_id) WHERE payment_id IS NOT NULL;

-- Integrity triggers ---------------------------------------------------------
-- Test 9: "A Circular transaction cannot become payment-confirmed without
-- authoritative payment verification." Enforced against AfriMesh Pay's own
-- record: the linked payment must have succeeded, for the agreed amount, in
-- the agreed currency. A status write from anywhere else is refused.
CREATE OR REPLACE FUNCTION circular_require_verified_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  paid RECORD;
BEGIN
  IF NEW.transaction_status = 'PAYMENT_VERIFIED'
     AND (TG_OP = 'INSERT' OR OLD.transaction_status IS DISTINCT FROM 'PAYMENT_VERIFIED') THEN
    IF NEW.payment_basis <> 'ONLINE' OR NEW.payment_id IS NULL THEN
      RAISE EXCEPTION 'circular transaction %: PAYMENT_VERIFIED needs an online AfriMesh Pay payment', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT status, amount, currency INTO paid FROM payments WHERE id = NEW.payment_id;
    IF NOT FOUND OR paid.status <> 'succeeded' OR paid.amount <> NEW.agreed_price
       OR paid.currency <> NEW.currency THEN
      RAISE EXCEPTION 'circular transaction %: linked payment is not a verified payment of the agreed amount', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS circular_transactions_verified_payment ON circular_transactions;
CREATE TRIGGER circular_transactions_verified_payment
  BEFORE INSERT OR UPDATE ON circular_transactions
  FOR EACH ROW EXECUTE FUNCTION circular_require_verified_payment();

CREATE OR REPLACE FUNCTION circular_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS circular_transaction_events_no_rewrite ON circular_transaction_events;
CREATE TRIGGER circular_transaction_events_no_rewrite
  BEFORE UPDATE OR DELETE ON circular_transaction_events
  FOR EACH ROW EXECUTE FUNCTION circular_append_only();

-- Initial taxonomy (§5.1) ----------------------------------------------------
-- Data, not code: a new material is a row, never a deploy. Idempotent by slug.
INSERT INTO circular_resource_categories (slug, name, sort_order) VALUES
  ('plastics', 'Plastics', 1),
  ('metals', 'Metals', 2),
  ('paper-cardboard', 'Paper and Cardboard', 3),
  ('glass', 'Glass', 4),
  ('agricultural', 'Agricultural Materials', 5),
  ('construction', 'Construction Materials', 6),
  ('electronic', 'Electronic Materials', 7),
  ('industrial-byproducts', 'Industrial By-products', 8)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO circular_resource_categories (slug, name, parent_id, sort_order)
SELECT child.slug, child.name, parent.id, child.sort_order
  FROM (VALUES
    ('plastics', 'plastics-pet', 'PET', 1),
    ('plastics', 'plastics-hdpe', 'HDPE', 2),
    ('plastics', 'plastics-ldpe', 'LDPE', 3),
    ('plastics', 'plastics-pp', 'PP', 4),
    ('plastics', 'plastics-pvc', 'PVC', 5),
    ('plastics', 'plastics-mixed', 'Mixed plastics', 6),
    ('metals', 'metals-aluminium', 'Aluminium', 1),
    ('metals', 'metals-copper', 'Copper', 2),
    ('metals', 'metals-iron', 'Iron', 3),
    ('metals', 'metals-steel', 'Steel', 4),
    ('metals', 'metals-scrap', 'Scrap metals', 5),
    ('paper-cardboard', 'paper-cardboard-cardboard', 'Cardboard', 1),
    ('paper-cardboard', 'paper-office', 'Office paper', 2),
    ('paper-cardboard', 'paper-newspaper', 'Newspaper', 3),
    ('paper-cardboard', 'paper-mixed', 'Mixed paper', 4),
    ('glass', 'glass-clear', 'Clear glass', 1),
    ('glass', 'glass-coloured', 'Coloured glass', 2),
    ('glass', 'glass-broken', 'Broken glass', 3),
    ('agricultural', 'agri-crop-residues', 'Crop residues', 1),
    ('agricultural', 'agri-rice-husks', 'Rice husks', 2),
    ('agricultural', 'agri-sawdust', 'Sawdust', 3),
    ('agricultural', 'agri-organic-waste', 'Organic waste', 4),
    ('agricultural', 'agri-animal-manure', 'Animal manure', 5),
    ('construction', 'construction-concrete-rubble', 'Concrete rubble', 1),
    ('construction', 'construction-timber-offcuts', 'Timber offcuts', 2),
    ('construction', 'construction-scrap-reinforcement', 'Scrap reinforcement', 3),
    ('construction', 'construction-reusable-components', 'Reusable building components', 4),
    ('electronic', 'electronic-scrap', 'Electronic scrap', 1),
    ('electronic', 'electronic-components', 'Recoverable components', 2),
    ('electronic', 'electronic-cables', 'Electrical cables', 3),
    ('industrial-byproducts', 'industrial-residues', 'Manufacturing residues', 1),
    ('industrial-byproducts', 'industrial-surplus', 'Production surplus', 2),
    ('industrial-byproducts', 'industrial-reusable', 'Reusable industrial materials', 3)
  ) AS child(parent_slug, slug, name, sort_order)
  JOIN circular_resource_categories parent ON parent.slug = child.parent_slug
ON CONFLICT (slug) DO NOTHING;
