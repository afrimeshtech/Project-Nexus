-- ---------------------------------------------------------------------------
-- ProductDNA - product identity and lifecycle intelligence
-- Specification: AFRI-PDNA-TIS-001 v1.0 (AFRIMESH PRODUCT DNA.pdf)
--
-- Its own schema, `productdna`, not `public`: the specification makes
-- ProductDNA an independently governed domain that owns its identity and
-- verification records while Commerce owns orders, inventory and payments
-- (§2, §18). Table names are the specification's. Nothing here has a foreign
-- key into Commerce - Commerce records are referred to by opaque references
-- (commerce_order_reference and friends, as §4.11 already does) - so the
-- domain can later move to its own database without unpicking constraints.
--
-- Dormant: see src/lib/launch-productdna.ts. Creating these tables changes
-- nothing for Commerce; nothing reads or writes them until launch.
--
-- Applied by db:push (schema.sql) on a fresh database, and by migration 005
-- on an existing one. Safe to run twice.
--
-- Status values the specification defines are enforced as written. Where it
-- names a status column but not its values (manufacturer users and keys,
-- batches, alerts, sales, returns, observation sources) the sets below are a
-- minimal starting point, marked PROVISIONAL, to be confirmed in the phase
-- that first uses them.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS productdna;

-- 4.1 manufacturers ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.manufacturers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_code    VARCHAR(64) UNIQUE,
  legal_name           VARCHAR(255) NOT NULL,
  registration_number  VARCHAR(100),
  verification_status  VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'SUSPENDED', 'REJECTED')),
  country_code         CHAR(2),
  -- Cross-domain link to the Commerce organisation, if the manufacturer also
  -- trades on AfriMesh. An opaque reference, not a foreign key.
  commerce_organisation_reference VARCHAR(128),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.2 manufacturer_users -----------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.manufacturer_users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id  UUID NOT NULL REFERENCES productdna.manufacturers(id),
  -- The Commerce user id, as an opaque reference.
  user_reference   VARCHAR(128) NOT NULL,
  -- Roles are defined in Phase 1 alongside manufacturer authentication.
  role             VARCHAR(50) NOT NULL,
  status           VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),       -- PROVISIONAL
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, user_reference)
);

-- 4.3 manufacturer_keys - public keys only, never private signing keys ------
CREATE TABLE IF NOT EXISTS productdna.manufacturer_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id  UUID NOT NULL REFERENCES productdna.manufacturers(id),
  key_id           VARCHAR(128) NOT NULL,
  public_key       TEXT NOT NULL,
  algorithm        VARCHAR(32) NOT NULL,
  status           VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED')),                     -- PROVISIONAL
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  UNIQUE (manufacturer_id, key_id),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

-- 4.4 product_identities -----------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_identities (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id                 UUID NOT NULL REFERENCES productdna.manufacturers(id),
  manufacturer_product_reference  VARCHAR(128) NOT NULL,
  product_name                    VARCHAR(255) NOT NULL,
  brand_reference                 VARCHAR(128),
  -- The specification's category; a Commerce category id held as a reference.
  category_id                     UUID NOT NULL,
  -- 1 = product-level, 2 = batch-level, 3 = individually serialised.
  identification_level            SMALLINT NOT NULL CHECK (identification_level IN (1, 2, 3)),
  identity_status                 VARCHAR(32) NOT NULL DEFAULT 'PENDING_REGISTRATION'
    CHECK (identity_status IN ('PENDING_REGISTRATION', 'REGISTERED', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manufacturer_id, manufacturer_product_reference)
);

-- 4.5 product_batches --------------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_batches (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_identity_id           UUID NOT NULL REFERENCES productdna.product_identities(id),
  manufacturer_batch_reference  VARCHAR(128) NOT NULL,
  production_date               DATE,
  expiry_date                   DATE,
  production_quantity           BIGINT NOT NULL CHECK (production_quantity > 0),
  registered_quantity           BIGINT NOT NULL DEFAULT 0 CHECK (registered_quantity >= 0),
  batch_status                  VARCHAR(32) NOT NULL DEFAULT 'REGISTERED'
    CHECK (batch_status IN ('REGISTERED', 'RELEASED', 'QUARANTINED', 'RECALLED', 'EXPIRED')), -- PROVISIONAL
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_identity_id, manufacturer_batch_reference),
  CHECK (registered_quantity <= production_quantity)
);

-- 4.6 product_serials --------------------------------------------------------
-- UNIQUE(product_identity_id, manufacturer_serial) also means a serial can
-- belong to only one batch: "must not be assigned to conflicting batches".
CREATE TABLE IF NOT EXISTS productdna.product_serials (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_identity_id  UUID NOT NULL REFERENCES productdna.product_identities(id),
  batch_id             UUID REFERENCES productdna.product_batches(id),
  manufacturer_serial  VARCHAR(255) NOT NULL,
  -- The commercial lifecycle (§10), kept apart from identity_status.
  serial_status        VARCHAR(32) NOT NULL DEFAULT 'COMMISSIONED'
    CHECK (serial_status IN (
      'COMMISSIONED', 'RELEASED', 'IN_DISTRIBUTION', 'RETAILER_INVENTORY',
      'AVAILABLE_FOR_SALE', 'SOLD', 'RETURN_REQUESTED', 'RETURN_INSPECTED',
      'RETURN_ACCEPTED', 'RESALE_ELIGIBLE',
      'DAMAGED', 'LOST', 'DESTROYED', 'RECALLED', 'QUARANTINED', 'EXPIRED')),
  commissioned_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_identity_id, manufacturer_serial)
);

-- 4.7 production_manifests ---------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.production_manifests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id      UUID NOT NULL REFERENCES productdna.manufacturers(id),
  product_identity_id  UUID NOT NULL REFERENCES productdna.product_identities(id),
  batch_id             UUID REFERENCES productdna.product_batches(id),
  manifest_reference   VARCHAR(128) NOT NULL,
  production_quantity  BIGINT NOT NULL CHECK (production_quantity > 0),
  payload_hash         VARCHAR(128) NOT NULL,
  -- "A verified manifest must retain its original signed payload" (§4.7).
  signed_payload       TEXT NOT NULL,
  signing_key_id       VARCHAR(128),
  signature            TEXT,
  verification_status  VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at          TIMESTAMPTZ,
  UNIQUE (manufacturer_id, manifest_reference)
);

-- 4.8 product_lifecycle_events - append-only ---------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_lifecycle_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_serial_id         UUID REFERENCES productdna.product_serials(id),
  batch_id                  UUID REFERENCES productdna.product_batches(id),
  product_identity_id       UUID NOT NULL REFERENCES productdna.product_identities(id),
  event_type                VARCHAR(64) NOT NULL,
  previous_status           VARCHAR(64),
  new_status                VARCHAR(64),
  actor_type                VARCHAR(32) NOT NULL
    CHECK (actor_type IN ('MANUFACTURER', 'COMMERCE', 'CONSUMER', 'RETAILER', 'ADMINISTRATOR', 'SYSTEM')),
  actor_reference           VARCHAR(128),
  external_event_reference  VARCHAR(128),
  location_reference        VARCHAR(128),
  occurred_at               TIMESTAMPTZ NOT NULL,
  recorded_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (product_serial_id IS NOT NULL OR batch_id IS NOT NULL)
);

-- 4.9 product_observations ---------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_observations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_serial_id   UUID REFERENCES productdna.product_serials(id),
  batch_id            UUID REFERENCES productdna.product_batches(id),
  observation_type    VARCHAR(32) NOT NULL
    CHECK (observation_type IN ('SCAN', 'INSPECTION', 'PHYSICAL_SECURITY_CHECK')),  -- PROVISIONAL
  source_type         VARCHAR(32) NOT NULL
    CHECK (source_type IN ('CONSUMER_APP', 'RETAILER_APP', 'MANUFACTURER', 'AFRIMESH_STAFF', 'API')), -- PROVISIONAL
  source_reference    VARCHAR(128),
  observed_at         TIMESTAMPTZ NOT NULL,
  -- Only what verification needs, under privacy controls (§4.9).
  location_reference  VARCHAR(128),
  latitude            NUMERIC(10, 7) CHECK (latitude BETWEEN -90 AND 90),
  longitude           NUMERIC(10, 7) CHECK (longitude BETWEEN -180 AND 180),
  device_reference    VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (product_serial_id IS NOT NULL OR batch_id IS NOT NULL)
);

-- 4.10 product_risk_alerts ---------------------------------------------------
-- COUNTERFEIT_CONFIRMED is an investigation outcome only (§12): nothing
-- automated sets it, and a repeated scan alone never can.
CREATE TABLE IF NOT EXISTS productdna.product_risk_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_serial_id     UUID REFERENCES productdna.product_serials(id),
  alert_type            VARCHAR(64) NOT NULL,
  severity              VARCHAR(32) NOT NULL
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),   -- PROVISIONAL
  evidence              JSONB NOT NULL,
  investigation_status  VARCHAR(32) NOT NULL DEFAULT 'OPEN'
    CHECK (investigation_status IN ('OPEN', 'UNDER_INVESTIGATION', 'DISMISSED', 'COUNTERFEIT_CONFIRMED')), -- PROVISIONAL
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ
);

-- 4.11 product_sales ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_sales (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_serial_id               UUID REFERENCES productdna.product_serials(id),
  batch_id                        UUID REFERENCES productdna.product_batches(id),
  commerce_order_reference        VARCHAR(128) NOT NULL,
  commerce_transaction_reference  VARCHAR(128),
  merchant_reference              VARCHAR(128) NOT NULL,
  quantity                        BIGINT NOT NULL CHECK (quantity > 0),
  sale_status                     VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (sale_status IN ('ACTIVE', 'RETURNED', 'REVERSED', 'QUARANTINED')), -- PROVISIONAL
  confirmed_at                    TIMESTAMPTZ NOT NULL,
  -- "A sale must reference either an individual serial or a batch-level
  -- quantity allocation", and a serial sale is always one unit.
  CHECK (product_serial_id IS NOT NULL OR batch_id IS NOT NULL),
  CHECK (product_serial_id IS NULL OR quantity = 1)
);

-- 4.12 product_returns -------------------------------------------------------
CREATE TABLE IF NOT EXISTS productdna.product_returns (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_serial_id            UUID REFERENCES productdna.product_serials(id),
  original_sale_id             UUID NOT NULL REFERENCES productdna.product_sales(id),
  return_reference             VARCHAR(128) NOT NULL UNIQUE,
  inspection_status            VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (inspection_status IN ('PENDING', 'PASSED', 'FAILED')),        -- PROVISIONAL
  resale_authorisation_status  VARCHAR(32) NOT NULL DEFAULT 'PENDING'
    CHECK (resale_authorisation_status IN ('PENDING', 'AUTHORISED', 'DENIED')), -- PROVISIONAL
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  inspected_at                 TIMESTAMPTZ,
  -- A return cannot be authorised for resale before it has passed inspection.
  CHECK (resale_authorisation_status <> 'AUTHORISED' OR inspection_status = 'PASSED')
);

-- Commerce Integration Gateway (§9) -----------------------------------------
-- The inbox: every Commerce event the gateway has taken, so a redelivered or
-- replayed event is processed once (acceptance test 13).
CREATE TABLE IF NOT EXISTS productdna.processed_events (
  source_system  VARCHAR(32) NOT NULL,
  event_id       VARCHAR(128) NOT NULL,
  event_type     VARCHAR(64) NOT NULL,
  outcome        VARCHAR(32) NOT NULL
    CHECK (outcome IN ('RECORDED', 'UNMAPPED', 'IGNORED', 'FAILED')),
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system, event_id)
);

-- How far the gateway has read Commerce's outbox (the public.event_log).
CREATE TABLE IF NOT EXISTS productdna.gateway_cursor (
  source_system  VARCHAR(32) PRIMARY KEY,
  last_event_id  BIGINT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 3, Commerce identity mapping: which ProductDNA identity a Commerce
-- catalogue product is. A Commerce product maps to at most one identity.
CREATE TABLE IF NOT EXISTS productdna.commerce_product_links (
  product_identity_id         UUID NOT NULL REFERENCES productdna.product_identities(id),
  commerce_product_reference  VARCHAR(128) NOT NULL UNIQUE,
  linked_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_identity_id, commerce_product_reference)
);

-- 5. Indexes -----------------------------------------------------------------
-- The UNIQUE constraints above already index manufacturer_code,
-- (manufacturer_id, manufacturer_product_reference),
-- (product_identity_id, manufacturer_batch_reference) and
-- (product_identity_id, manufacturer_serial).
CREATE INDEX IF NOT EXISTS product_serials_batch_idx
  ON productdna.product_serials (batch_id);
CREATE INDEX IF NOT EXISTS lifecycle_events_serial_idx
  ON productdna.product_lifecycle_events (product_serial_id, occurred_at);
CREATE INDEX IF NOT EXISTS lifecycle_events_batch_idx
  ON productdna.product_lifecycle_events (batch_id, occurred_at);
CREATE INDEX IF NOT EXISTS observations_serial_idx
  ON productdna.product_observations (product_serial_id, observed_at);
CREATE INDEX IF NOT EXISTS risk_alerts_status_idx
  ON productdna.product_risk_alerts (investigation_status, severity);
CREATE INDEX IF NOT EXISTS product_sales_order_idx
  ON productdna.product_sales (commerce_order_reference);
-- "Use partial unique indexes to prevent duplicate active serial sales" (§5):
-- one serial, at most one ACTIVE sale (acceptance test 10).
CREATE UNIQUE INDEX IF NOT EXISTS product_sales_one_active_per_serial
  ON productdna.product_sales (product_serial_id)
  WHERE product_serial_id IS NOT NULL AND sale_status = 'ACTIVE';

-- "Events must be append-only. Corrections must be represented by
-- compensating events" (§4.8) - enforced, not assumed.
CREATE OR REPLACE FUNCTION productdna.append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS lifecycle_events_no_rewrite ON productdna.product_lifecycle_events;
CREATE TRIGGER lifecycle_events_no_rewrite
  BEFORE UPDATE OR DELETE ON productdna.product_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION productdna.append_only();

DROP TRIGGER IF EXISTS lifecycle_events_no_truncate ON productdna.product_lifecycle_events;
CREATE TRIGGER lifecycle_events_no_truncate
  BEFORE TRUNCATE ON productdna.product_lifecycle_events
  FOR EACH STATEMENT EXECUTE FUNCTION productdna.append_only();
