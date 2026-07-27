-- Migration 008: Contract Lifecycle States

-- Note: Postgres does not support adding values inside a transaction if the enum
-- is created in the same transaction. However, these ENUMs exist in 001.
-- ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block 
-- prior to Postgres 12. TaskChain likely uses modern Postgres, but we'll issue them individually.

COMMIT; -- Ensure we are not in a transaction block if the runner wraps this

ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'pending_funding';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'submitted';

BEGIN;

CREATE TABLE IF NOT EXISTS contract_state_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  previous_status  contract_status,
  new_status       contract_status NOT NULL,
  changed_by_user_id UUID      REFERENCES users (id) ON DELETE SET NULL,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_state_logs_contract_id 
  ON contract_state_logs (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_state_logs_created_at 
  ON contract_state_logs (created_at DESC);

COMMIT;
