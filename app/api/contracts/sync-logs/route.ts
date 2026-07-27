import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  try {
    const tokenStr = readAccessToken(request)
    if (!tokenStr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = verifyAccessToken(tokenStr)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRows = (await sql`
      SELECT role FROM users WHERE wallet_address = ${token.walletAddress} LIMIT 1
    `) as { role: string }[]
    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('contractId')
    const status = searchParams.get('status')
    const eventType = searchParams.get('eventType')
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)
    const offset = Number(searchParams.get('offset')) || 0

    const filterQuery = sql`
      ${contractId ? sql`AND l.contract_id = ${contractId}::uuid` : sql``}
      ${status ? sql`AND l.status = ${status}::sync_status` : sql``}
      ${eventType ? sql`AND l.event_type = ${eventType}::contract_sync_event_type` : sql``}
    `

    const countResult = (await sql`
      SELECT COUNT(*)::int AS total FROM contract_sync_log l WHERE 1=1 ${filterQuery}
    `) as { total: number }[]
    const total = countResult[0]?.total ?? 0

    let logs: Record<string, unknown>[] = []
    if (total > 0) {
      const rows = (await sql`
        SELECT l.*
          FROM contract_sync_log l
         WHERE 1=1 ${filterQuery}
         ORDER BY l.created_at DESC
         LIMIT ${limit}
         OFFSET ${offset}
      `) as Record<string, unknown>[]

      logs = rows.map((row) => ({
        id: row.id,
        contractId: row.contract_id,
        milestoneId: row.milestone_id,
        eventType: row.event_type,
        txHash: row.tx_hash,
        ledgerSequence: row.ledger_sequence,
        status: row.status,
        errorMessage: row.error_message,
        retryCount: row.retry_count,
        rawPayload: row.raw_payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    }

    return NextResponse.json({
      logs,
      pagination: {
        limit,
        offset,
        total,
        nextOffset: offset + logs.length < total ? offset + logs.length : null,
        hasMore: offset + logs.length < total,
      },
    })
  } catch (err) {
    console.error('[SyncLogs API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
