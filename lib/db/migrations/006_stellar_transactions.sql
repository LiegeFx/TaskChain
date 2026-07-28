CREATE TABLE IF NOT EXISTS stellar_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      UUID        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  tx_hash          TEXT        NOT NULL UNIQUE,
  timestamp        TIMESTAMPTZ NOT NULL,
  amount           NUMERIC(18,6) NOT NULL DEFAULT 0,
  asset_type       TEXT        NOT NULL DEFAULT 'native',
  status           TEXT        NOT NULL DEFAULT 'successful'
    CHECK (status IN ('successful', 'failed', 'pending')),
  transaction_type TEXT,
  source_account   TEXT,
  destination_account TEXT,
  memo_type        TEXT,
  memo             TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stellar_transactions_contract
  ON stellar_transactions (contract_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_stellar_transactions_hash
  ON stellar_transactions (tx_hash);

CREATE INDEX IF NOT EXISTS idx_stellar_transactions_fetched
  ON stellar_transactions (fetched_at);