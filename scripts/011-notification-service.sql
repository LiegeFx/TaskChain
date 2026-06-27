-- 011-notification-service.sql
--
-- Notification service enrichment for TaskChain issue #122
-- (Notification Service Backend).
--
-- The original notifications table (scripts/005-notifications.sql) is a
-- lightweight schema with `title`, `message`, `type`, `is_read`. This
-- migration adds the columns that the notification-service helper
-- (lib/notifications.ts) needs without breaking existing writes from
-- scripts/worker.ts.
--
-- All statements are idempotent (`ADD COLUMN IF NOT EXISTS`,
-- `CREATE INDEX IF NOT EXISTS`) so re-running this migration on an
-- environment that already applied it is a no-op.

-- Ensure the table exists with the operational shape (integer ids, the
-- shape that scripts/worker.ts writes against). Safe no-op when the table
-- was created by scripts/005-notifications.sql.
CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  type            VARCHAR(50) DEFAULT 'info',
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1) Event-type channel: replaces the free-form `type` column with a
--    checked enum so callers cannot invent arbitrary strings.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(64);

-- Backfill: existing rows default to a value present in the CHECK list
-- below. We map any unknown legacy `type` to 'info' so the ADD CONSTRAINT
-- step cannot fail on a stray value (e.g. a hand-written 'banana').
UPDATE notifications
  SET event_type = CASE
    WHEN type IN ('info', 'success', 'warning') THEN type
    ELSE 'info'
  END
  WHERE event_type IS NULL;

-- Constrain the column now that every row has a value. The CHECK is
-- tolerant of legacy `info`/`success`/`warning` types the worker writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_event_type_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_event_type_check
      CHECK (
        event_type IN (
          'info', 'success', 'warning',
          'contract_created',
          'milestone_submitted',
          'milestone_approved',
          'escrow_released',
          'escrow_refunded',
          'dispute_created',
          'dispute_resolved'
        )
      );
  END IF;
END $$;

-- 2) Event-specific structured payload. Stored as JSONB so callers can
--    do attribute-level filtering ("show all notifications about job #42")
--    on the frontend without a schema change.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3) Delivery channel + timestamp. delivery_status lets us distinguish
--    "created but not yet fanned out" from "delivered (or attempted)".
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channel VARCHAR(32) NOT NULL DEFAULT 'in_app';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications(created_at);

-- Composite: (user_id, is_read, created_at DESC) is exactly the shape the
-- listNotificationsForUser query uses for `unreadOnly=true | false` lists.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- Composite: (user_id, event_type, created_at DESC) powers the `?type=`
-- filter on the GET endpoint.
CREATE INDEX IF NOT EXISTS idx_notifications_user_event
  ON notifications(user_id, event_type, created_at DESC);
