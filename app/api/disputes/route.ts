export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

export const POST = withRbac('dispute:create', async (request: NextRequest, auth: RbacContext) => {
  try {
    const body = await request.json()
    const { jobId, reason } = body
    if (!jobId || !reason) {
      return NextResponse.json({ error: 'Missing required fields: jobId, reason', code: 'MISSING_FIELDS' }, { status: 400 })
    }
    const [job] = await sql`SELECT id, client_id, freelancer_id FROM jobs WHERE id = ${jobId}`
    if (!job) return NextResponse.json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }, { status: 404 })
    const [dispute] = await sql`INSERT INTO disputes (job_id, raised_by, reason) VALUES (${job.id}, ${auth.userId}, ${reason}) RETURNING *`
    await sql`UPDATE jobs SET status = 'disputed', updated_at = CURRENT_TIMESTAMP WHERE id = ${jobId}`
    return NextResponse.json(dispute, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to raise dispute', code: 'DISPUTE_CREATION_FAILED' }, { status: 500 })
  }
})

export const GET = withRbac('dispute:view', async (_request: NextRequest, auth: RbacContext) => {
  try {
    const disputes = await sql`
      SELECT d.*, j.title as job_title, u.username as raised_by_username
      FROM disputes d JOIN jobs j ON d.job_id = j.id JOIN users u ON d.raised_by = u.id
      WHERE j.client_id = ${auth.userId} OR j.freelancer_id = ${auth.userId}
      ORDER BY d.created_at DESC
    `
    return NextResponse.json(disputes, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch disputes', code: 'DISPUTES_FETCH_FAILED' }, { status: 500 })
  }
})
