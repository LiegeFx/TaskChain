-- Fail-Safe Critical Operations Table
-- This table tracks critical operations that require approval, confirmation, or time delays

CREATE TABLE IF NOT EXISTS critical_operations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('escrow_fund', 'escrow_release', 'escrow_refund', 'dispute_resolve', 'admin_action', 'emergency_withdrawal')),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed', 'rolled_back')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  requires_confirmation BOOLEAN NOT NULL DEFAULT false,
  time_delay_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  rollback_until TIMESTAMPTZ,
  approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_wallet_address TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_critical_operations_user ON critical_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_critical_operations_resource ON critical_operations(resource_id);
CREATE INDEX IF NOT EXISTS idx_critical_operations_status ON critical_operations(status);
CREATE INDEX IF NOT EXISTS idx_critical_operations_type ON critical_operations(type);
CREATE INDEX IF NOT EXISTS idx_critical_operations_created_at ON critical_operations(created_at);

-- Comment for documentation
COMMENT ON TABLE critical_operations IS 'Tracks critical operations requiring approval, confirmation, or time delays for fail-safe execution';
COMMENT ON COLUMN critical_operations.type IS 'Type of critical operation (escrow_fund, escrow_release, etc.)';
COMMENT ON COLUMN critical_operations.requires_approval IS 'Whether the operation requires admin approval before execution';
COMMENT ON COLUMN critical_operations.requires_confirmation IS 'Whether the operation requires user confirmation';
COMMENT ON COLUMN critical_operations.time_delay_seconds IS 'Time delay in seconds before operation can be executed after approval';
COMMENT ON COLUMN critical_operations.rollback_until IS 'Timestamp until which the operation can be rolled back';
