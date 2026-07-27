export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { UpdateMilestoneSchema, IMMUTABLE_MILESTONE_STATUS_VALUES } from '@/lib/validations'

export const PATCH = withAuth(async (request: NextRequest, auth) => {
  const id = request.nextUrl.pathname.split('/').at(-1)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be valid JSON', code: 'INVALID_JSON' },
      { status: 400 }
    )
  }

  const parsed = UpdateMilestoneSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'INVALID_REQUEST_BODY', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { title, description, amount, currency, due_date, sort_order, deliverables } = parsed.data

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })

    const [milestone] = await sql`
      SELECT m.*, p.client_id
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      WHERE m.id = ${id}
      LIMIT 1
    `
    if (!milestone) return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })
    if (milestone.client_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    if ((IMMUTABLE_MILESTONE_STATUS_VALUES as readonly string[]).includes(milestone.status)) {
      return NextResponse.json(
        { error: `Cannot update a milestone with status '${milestone.status}'`, code: 'INVALID_STATUS' },
        { status: 422 }
      )
    }

    const [updated] = await sql`
      UPDATE milestones SET
        title        = COALESCE(${title ?? null}, title),
        description  = COALESCE(${description ?? null}, description),
        amount       = COALESCE(${amount ?? null}, amount),
        currency     = COALESCE(${currency ?? null}, currency),
        due_date     = COALESCE(${due_date ? due_date.toISOString() : null}, due_date),
        sort_order   = COALESCE(${sort_order ?? null}, sort_order),
        deliverables = COALESCE(${deliverables ? JSON.stringify(deliverables) : null}, deliverables),
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({ milestone: updated })
  } catch {
    return NextResponse.json({ error: 'Failed to update milestone', code: 'MILESTONE_UPDATE_FAILED' }, { status: 500 })
  }
})
