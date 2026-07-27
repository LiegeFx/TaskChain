-- Emergency Withdrawal Tables
-- These tables support the emergency withdrawal mechanism for recovering funds
-- from the platform escrow account in case of critical failures

-- Emergency withdrawal requests table
CREATE TABLE IF NOT EXISTS emergency_withdrawals (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  required_approvals INTEGER NOT NULL DEFAULT 3,
  current_approvals INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Emergency signers table (multi-sig approval authorities)
CREATE TABLE IF NOT EXISTS emergency_signers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emergency approvals table (tracks individual signer approvals)
CREATE TABLE IF NOT EXISTS emergency_approvals (
  id TEXT PRIMARY KEY,
  withdrawal_request_id TEXT NOT NULL REFERENCES emergency_withdrawals(id) ON DELETE CASCADE,
  signer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signer_wallet_address TEXT NOT NULL,
  signature TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(withdrawal_request_id, signer_id)
);

-- Emergency withdrawal audit log table
CREATE TABLE IF NOT EXISTS emergency_withdrawal_logs (
  id SERIAL PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES emergency_withdrawals(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_by_wallet TEXT NOT NULL,
  tx_hash TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_emergency_withdrawals_status ON emergency_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_emergency_withdrawals_requested_by ON emergency_withdrawals(requested_by);
CREATE INDEX IF NOT EXISTS idx_emergency_withdrawals_contract ON emergency_withdrawals(contract_id);
CREATE INDEX IF NOT EXISTS idx_emergency_withdrawals_created_at ON emergency_withdrawals(created_at);

CREATE INDEX IF NOT EXISTS idx_emergency_approvals_request ON emergency_approvals(withdrawal_request_id);
CREATE INDEX IF NOT EXISTS idx_emergency_approvals_signer ON emergency_approvals(signer_id);

CREATE INDEX IF NOT EXISTS idx_emergency_signers_active ON emergency_signers(is_active);
CREATE INDEX IF NOT EXISTS idx_emergency_signers_wallet ON emergency_signers(wallet_address);

CREATE INDEX IF NOT EXISTS idx_emergency_logs_request ON emergency_withdrawal_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_created_at ON emergency_withdrawal_logs(created_at);

-- Comments for documentation
COMMENT ON TABLE emergency_withdrawals IS 'Emergency withdrawal requests for recovering funds from escrow';
COMMENT ON TABLE emergency_signers IS 'Authorized signers for emergency withdrawal multi-sig approval';
COMMENT ON TABLE emergency_approvals IS 'Individual signer approvals for emergency withdrawal requests';
COMMENT ON TABLE emergency_withdrawal_logs IS 'Audit log for all emergency withdrawal actions';

COMMENT ON COLUMN emergency_withdrawals.required_approvals IS 'Minimum number of signer approvals required (default: 3 of 5)';
COMMENT ON COLUMN emergency_withdrawals.expires_at IS 'Request expiration timestamp (default: 7 days from creation)';
COMMENT ON COLUMN emergency_signers.role IS 'Primary signers have higher priority for approval';
