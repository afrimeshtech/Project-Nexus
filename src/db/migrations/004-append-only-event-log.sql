-- ---------------------------------------------------------------------------
-- 004 — The event log becomes append-only in the database itself
--
-- event_log is the platform's audit trail (Security & Trust Framework §E:
-- "audit records must be append-only from the application's normal operating
-- perspective"). Until now that was a convention: nothing in the app edits or
-- deletes events, but nothing stopped it either - a bug, a bad query or a
-- compromised app could rewrite history. These triggers refuse UPDATE, DELETE
-- and TRUNCATE outright.
--
-- One update is allowed: actor_user_id is ON DELETE SET NULL, so erasing a
-- user's account clears their id from the events they caused. That is an
-- erasure, not an edit - every other column must be untouched for it to pass.
--
-- The database owner can still drop the triggers. Separating the app's
-- database role from the owner is the next step (see the gap assessment).
--
-- schema.sql carries the same triggers for a fresh database. There is no
-- migration runner: apply this by hand, once, against each environment:
--
--   psql "$DATABASE_URL" -f src/db/migrations/004-append-only-event-log.sql
--
-- It is written to be safe to run twice.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE OR REPLACE FUNCTION event_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.event_type = OLD.event_type
     AND NEW.aggregate_type = OLD.aggregate_type
     AND NEW.aggregate_id = OLD.aggregate_id
     AND NEW.payload = OLD.payload
     AND NEW.occurred_at = OLD.occurred_at
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'event_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS event_log_no_rewrite ON event_log;
CREATE TRIGGER event_log_no_rewrite
  BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION event_log_append_only();

DROP TRIGGER IF EXISTS event_log_no_truncate ON event_log;
CREATE TRIGGER event_log_no_truncate
  BEFORE TRUNCATE ON event_log
  FOR EACH STATEMENT EXECUTE FUNCTION event_log_append_only();

COMMIT;
