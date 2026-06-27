export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withRbac('dispute:resolve', async (request: NextRequest, auth: RbacContext, context: RouteContext) => {
  const { id } = await context.params
  try {
    const { resolution, newState } = await request.json()
    if (!resolution) return NextResponse.json({ error: 'Missing required field: resolution', code: 'MISSING_FIELDS' }, { status: 400 })
    const [dispute] = await sql`SELECT d.*, j.escrow_contract_id FROM disputes d JOIN jobs j ON d.job_id = j.id WHERE d.id = ${id}`
    if (!dispute) return NextResponse.json({ error: 'Dispute not found', code: 'DISPUTE_NOT_FOUND' }, { status: 404 })
    const nextState = newState || 'resolved'
    await sql`UPDATE disputes SET updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    await sql`UPDATE jobs SET escrow_status = ${nextState}, updated_at = CURRENT_TIMESTAMP WHERE id = ${dispute.job_id}`
    return NextResponse.json({ message: 'Dispute resolved', disputeId: id, resolution }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to resolve dispute', code: 'RESOLVE_FAILED' }, { status: 500 })
  }
})
