export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { z } from 'zod'
import { withRbac, RbacContext } from '@/lib/auth/rbacMiddleware'

const MOCK_WALLET = 'GMOCKUSER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'

const milestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  dueDate: z.string().datetime().optional(),
})

const bodySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  deadline: z.string().datetime(),
  totalAmount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().min(1),
  terms: z.string().optional(),
  milestones: z.array(milestoneSchema).min(1),
})

async function saveProject(userId: string, body: z.infer<typeof bodySchema>) {
  const projectRows = await sql<{ id: string }[]>`
    INSERT INTO projects (
      client_id, title, description, category,
      budget_min, budget_max, currency, deadline, status
    ) VALUES (
      ${userId}, ${body.title}, ${body.description},
      ${body.category ?? null}, ${body.totalAmount}, ${body.totalAmount},
      ${body.currency}, ${body.deadline}, 'draft'
    )
    RETURNING id
  `

  const projectId = projectRows[0]?.id
  if (!projectId) throw new Error('Failed to create project')

  for (const [i, m] of body.milestones.entries()) {
    await sql`
      INSERT INTO milestones (
        project_id, title, description, amount,
        currency, due_date, sort_order, status
      ) VALUES (
        ${projectId}, ${m.title}, ${m.description ?? null},
        ${m.amount}, ${body.currency}, ${m.dueDate ?? null}, ${i}, 'pending'
      )
    `
  }

  return { projectId, title: body.title, milestonesCreated: body.milestones.length }
}

export const POST = withRbac('project:create', async (request: NextRequest, auth: RbacContext): Promise<NextResponse> => {
  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await saveProject(auth.userId, parsed.data)
    return NextResponse.json({ ...result, status: 'draft' }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Database error' }, { status: 500 })
  }
})
