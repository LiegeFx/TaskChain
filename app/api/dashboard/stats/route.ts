/**
 * GET /api/dashboard/stats
 *
 * Returns aggregated statistics for the authenticated user:
 *   - activeContracts    – contracts with status = 'active'
 *   - completedContracts – contracts with status = 'completed'
 *   - totalEarnings      – sum of confirmed milestone_release escrow transactions
 *   - escrowVolume       – sum of total_amount on funded/partially_released contracts
 *
 * Cache-Control: private, max-age=60 (1 minute client-side cache)
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { getDashboardStats } from '@/lib/dashboard/stats'

export const GET = withAuth(async (_request: NextRequest, auth) => {
  try {
    const stats = await getDashboardStats(auth.walletAddress)

    return NextResponse.json(
      {
        data: stats,
        meta: { generatedAt: new Date().toISOString() },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, max-age=60' },
      }
    )
  } catch (err) {
    if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Authenticated wallet has no platform account', code: 'USER_NOT_FOUND' },
        { status: 404 }
      )
    }

    console.error('[GET /api/dashboard/stats]', err)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
})
