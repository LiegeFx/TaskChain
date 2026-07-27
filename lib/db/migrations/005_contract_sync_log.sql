DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_sync_event_type') THEN
    CREATE TYPE contract_sync_event_type AS ENUM (
      'init',
      'fund',
      'submit',
      'approve',
      'confirm',
      'release',
      'refund',
      'dispute',
      'resolve',
      'expire'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN
    CREATE TYPE sync_status AS ENUM (
      'pending',
      'processing',
      'success',
      'failed',
      'dead_letter'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS contract_sync_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID REFERENCES contracts (id) ON DELETE SET NULL,
  milestone_id      UUID REFERENCES milestones (id) ON DELETE SET NULL,
  event_type        contract_sync_event_type NOT NULL,
  tx_hash           TEXT,
  ledger_sequence   BIGINT,
  status            sync_status NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  raw_payload       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_sync_log_status
  ON contract_sync_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_sync_log_contract
  ON contract_sync_log (contract_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contract_sync_log_tx_hash
  ON contract_sync_log (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_sync_log_event_type
  ON contract_sync_log (event_type, created_at DESC);
