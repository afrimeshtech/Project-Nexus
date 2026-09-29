-- ---------------------------------------------------------------------------
-- 001 — Paystack adapter and webhook settlement
--
-- schema.sql is the source of truth and is applied whole, which works for a
-- fresh database and refuses to run over one that already holds data. This
-- file is the same change expressed for a database that is already live.
--
-- There is no migration runner. Apply it by hand, once, against each
-- environment, BEFORE deploying the code that needs it:
--
--   psql "$DATABASE_URL" -f src/db/migrations/001-paystack-webhooks.sql
--
-- It is written to be safe to run twice.
-- ---------------------------------------------------------------------------

BEGIN;

-- Where a settling payment credits. NULL means the payer's own user wallet,
-- which is what every existing row is, so no backfill is needed.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS credit_owner_type TEXT,
  ADD COLUMN IF NOT EXISTS credit_owner_id   UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_credit_owner_type_check'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_credit_owner_type_check
      CHECK (credit_owner_type IN ('user', 'organisation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_credit_owner_complete'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_credit_owner_complete
      CHECK ((credit_owner_type IS NULL) = (credit_owner_id IS NULL));
  END IF;
END $$;

-- The webhook arrives knowing only the provider's reference, so that is how a
-- payment is found. Unique because two payments sharing a reference would make
-- settlement ambiguous — i.e. it would be a coin flip which order got paid.
--
-- If this index fails to build, STOP: it means duplicate provider references
-- already exist and they have to be reconciled by hand before any webhook is
-- allowed to settle against them.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_idx
  ON payments (provider_ref) WHERE provider_ref IS NOT NULL;

-- Webhook idempotency. Without this, a provider retry of charge.success
-- credits a wallet a second time for one payment.
CREATE TABLE IF NOT EXISTS webhook_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_received_idx
  ON webhook_events (provider, received_at DESC);

COMMIT;
