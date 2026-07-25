-- Scheduled Contract Deadline Monitor: adds the bookkeeping columns needed
-- to detect overdue milestones and send each reminder/overdue notification
-- exactly once (re-running the sweep must not re-notify users).

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS is_overdue        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS overdue_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at  TIMESTAMPTZ;

-- Sweep for milestones that just became overdue and haven't been flagged yet.
CREATE INDEX IF NOT EXISTS idx_milestones_overdue_sweep
  ON milestones (due_date)
  WHERE due_date IS NOT NULL AND is_overdue = FALSE;
