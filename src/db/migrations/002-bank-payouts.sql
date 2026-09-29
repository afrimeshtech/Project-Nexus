-- 002: bank accounts and payouts (withdrawals to a bank via Paystack Transfers).
-- Safe to run more than once. See the payouts section of schema.sql for the
-- reasoning; this only brings an existing database up to it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status') THEN
    CREATE TYPE payout_status AS ENUM ('processing', 'paid', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_accounts (
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

CREATE INDEX IF NOT EXISTS bank_accounts_owner_idx ON bank_accounts (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS payouts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference            TEXT NOT NULL UNIQUE,
  owner_type           TEXT NOT NULL CHECK (owner_type IN ('user', 'organisation')),
  owner_id             UUID NOT NULL,
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

CREATE INDEX IF NOT EXISTS payouts_owner_idx  ON payouts (owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payouts_status_idx ON payouts (status) WHERE status = 'processing';
