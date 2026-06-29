/**
 * lib/dashboard/stats.ts
 *
 * DB query functions for dashboard statistics.
 * All queries are scoped to a wallet address (resolved to a user id).
 */

import { sql } from '@/lib/db'

export interface DashboardStats {
  activeContracts: number
  completedContracts: number
  totalEarnings: string   // NUMERIC as string to preserve precision
  escrowVolume: string    // NUMERIC as string to preserve precision
}

/**
 * Resolve a wallet address to a user UUID.
 * Returns null if the wallet is not registered.
 */
async function getUserIdByWallet(walletAddress: string): Promise<string | null> {
  const rows = (await sql`
    SELECT id FROM users
    WHERE wallet_address = ${walletAddress}
    LIMIT 1
  `) as unknown as { id: string }[]
  return rows[0]?.id ?? null
}

/**
 * Fetch all four dashboard metrics in a single query for a given user.
 * The user is treated as either client OR freelancer so the stats are
 * unified from their perspective.
 */
async function queryStats(userId: string): Promise<DashboardStats> {
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'active'
        AND   (client_id = ${userId} OR freelancer_id = ${userId})
      )::int AS active_contracts,

      COUNT(*) FILTER (
        WHERE status = 'completed'
        AND   (client_id = ${userId} OR freelancer_id = ${userId})
      )::int AS completed_contracts,

      COALESCE(SUM(etl.amount) FILTER (
        WHERE etl.transaction_type = 'milestone_release'
        AND   etl.status = 'confirmed'
        AND   etl.actor_user_id = ${userId}
      ), 0)::text AS total_earnings,

      COALESCE(SUM(c.total_amount) FILTER (
        WHERE c.escrow_status IN ('funded', 'partially_released')
        AND   (c.client_id = ${userId} OR c.freelancer_id = ${userId})
      ), 0)::text AS escrow_volume

    FROM contracts c
    LEFT JOIN escrow_transaction_logs etl ON etl.contract_id = c.id
    WHERE c.client_id = ${userId} OR c.freelancer_id = ${userId}
  `) as unknown as {
    active_contracts: number
    completed_contracts: number
    total_earnings: string | null
    escrow_volume: string | null
  }[]

  const row = rows[0]

  return {
    activeContracts: row?.active_contracts ?? 0,
    completedContracts: row?.completed_contracts ?? 0,
    totalEarnings: row?.total_earnings ?? '0',
    escrowVolume: row?.escrow_volume ?? '0',
  }
}

/**
 * Public entry point: resolves wallet → user id → stats.
 * Throws if the wallet is not registered.
 */
export async function getDashboardStats(walletAddress: string): Promise<DashboardStats> {
  const userId = await getUserIdByWallet(walletAddress)
  if (!userId) {
    throw new Error('USER_NOT_FOUND')
  }
  return queryStats(userId)
}

// Export internals for unit testing
export { getUserIdByWallet, queryStats }
