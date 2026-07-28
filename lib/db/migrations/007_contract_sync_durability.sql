-- Durability improvements for the Soroban contract-sync indexer:
--   1. dedupe_key + unique index — guarantees an on-chain event is recorded
--      exactly once in the audit trail, even if the same event is redelivered
--      after a service restart (the in-memory queue alone can't guarantee this
--      across process boundaries).
--   2. contract_sync_checkpoint — persists the last ledger sequence the
--      listener has fully processed, so a restart resumes polling from where
--      it left off instead of jumping to "now" and silently skipping any
--      events emitted while the service was down.

ALTER TABLE contract_sync_log
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_sync_log_dedupe_key
  ON contract_sync_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS contract_sync_checkpoint (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  last_ledger  BIGINT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
