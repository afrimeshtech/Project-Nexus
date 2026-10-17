-- ---------------------------------------------------------------------------
-- 003 — Support inbox: two-way conversations between members and AfriMesh
--
-- "Contact us" used to store a one-way message in contact_messages that no
-- screen showed and nobody could answer. A signed-in shopper or retailer now
-- opens a support thread instead, and an administrator replies from the
-- console. contact_messages stays for signed-out visitors.
--
-- schema.sql carries the same tables for a fresh database. There is no
-- migration runner: apply this by hand, once, against each environment,
-- BEFORE deploying the code that needs it:
--
--   psql "$DATABASE_URL" -f src/db/migrations/003-support-inbox.sql
--
-- It is written to be safe to run twice.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS support_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The member who opened it; only they (and administrators) can read it.
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The business they wrote on behalf of, for a retailer's thread.
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  source          TEXT NOT NULL CHECK (source IN ('consumer', 'partner')),
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_threads_user_idx   ON support_threads (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_threads_status_idx ON support_threads (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'member' is the shopper or retailer; 'admin' is AfriMesh support.
  sender_side    TEXT NOT NULL CHECK (sender_side IN ('member', 'admin')),
  body           TEXT NOT NULL,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages (thread_id, created_at);

COMMIT;
