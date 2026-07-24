-- Activity Logs
-- System-wide activity tracking for transparency, auditability, and debugging.

CREATE TYPE activity_action_type AS ENUM (
  'contract_created',
  'milestone_created',
  'milestone_updated',
  'milestone_submitted',
  'milestone_approved',
  'milestone_rejected',
  'escrow_funded',
  'payment_released',
  'escrow_refunded',
  'dispute_created',
  'dispute_resolved',
  'contract_completed',
  'contract_cancelled'
);

CREATE TABLE activity_logs (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         UUID           NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  contract_id      UUID           REFERENCES contracts (id) ON DELETE SET NULL,
  project_id       UUID           REFERENCES projects (id) ON DELETE SET NULL,
  milestone_id     UUID           REFERENCES milestones (id) ON DELETE SET NULL,
  dispute_id       UUID           REFERENCES disputes (id) ON DELETE SET NULL,
  action_type      activity_action_type NOT NULL,
  description      TEXT           NOT NULL,
  metadata         JSONB          NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Fast lookups by actor
CREATE INDEX idx_activity_logs_actor_id ON activity_logs (actor_id, created_at DESC);

-- Fast lookups by contract
CREATE INDEX idx_activity_logs_contract_id ON activity_logs (contract_id, created_at DESC);

-- Fast lookups by action type (for filtering)
CREATE INDEX idx_activity_logs_action_type ON activity_logs (action_type, created_at DESC);

-- Time-ordered scans (dashboard timeline)
CREATE INDEX idx_activity_logs_created_at ON activity_logs (created_at DESC);