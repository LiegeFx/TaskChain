export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { readEncryptedFile, removeEncryptedFile } from '@/lib/security/fileEncryption'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const segments = request.nextUrl.pathname.split('/')
  const milestoneId = segments.at(-3)
  const deliverableId = segments.at(-1)

  if (!milestoneId || !deliverableId) {
    return NextResponse.json(
      { error: 'Milestone ID and deliverable ID are required', code: 'MISSING_PARAMS' },
      { status: 400 },
    )
  }

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const [deliverable] = await sql`
      SELECT md.*, m.contract_id, c.client_id, c.freelancer_id
      FROM milestone_deliverables md
      JOIN milestones m ON m.id = md.milestone_id
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE md.id = ${deliverableId} AND md.milestone_id = ${milestoneId} AND md.is_removed = FALSE
      LIMIT 1
    `
    if (!deliverable) {
      return NextResponse.json({ error: 'Deliverable not found', code: 'DELIVERABLE_NOT_FOUND' }, { status: 404 })
    }

    if (deliverable.client_id !== user.id && deliverable.freelancer_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    const plaintext = await readEncryptedFile(deliverable.file_path, deliverable.encryption_iv)

    return new NextResponse(plaintext, {
      status: 200,
      headers: {
        'Content-Type': deliverable.mime_type,
        'Content-Disposition': `attachment; filename="${deliverable.original_filename}"`,
        'Content-Length': String(plaintext.length),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to download deliverable', code: 'DOWNLOAD_FAILED' },
      { status: 500 },
    )
  }
})

export const DELETE = withAuth(async (request: NextRequest, auth) => {
  const segments = request.nextUrl.pathname.split('/')
  const milestoneId = segments.at(-3)
  const deliverableId = segments.at(-1)

  if (!milestoneId || !deliverableId) {
    return NextResponse.json(
      { error: 'Milestone ID and deliverable ID are required', code: 'MISSING_PARAMS' },
      { status: 400 },
    )
  }

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const [deliverable] = await sql`
      SELECT md.*, m.contract_id, c.freelancer_id
      FROM milestone_deliverables md
      JOIN milestones m ON m.id = md.milestone_id
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE md.id = ${deliverableId} AND md.milestone_id = ${milestoneId} AND md.is_removed = FALSE
      LIMIT 1
    `
    if (!deliverable) {
      return NextResponse.json({ error: 'Deliverable not found', code: 'DELIVERABLE_NOT_FOUND' }, { status: 404 })
    }

    if (deliverable.freelancer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the uploader freelancer can remove deliverables', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const allowedStatuses = ['in_progress', 'submitted']
    const [milestone] = await sql`
      SELECT status FROM milestones WHERE id = ${milestoneId} LIMIT 1
    `
    if (!milestone || !allowedStatuses.includes(milestone.status)) {
      return NextResponse.json(
        { error: `Cannot remove deliverables when milestone status is '${milestone?.status}'`, code: 'INVALID_STATUS' },
        { status: 422 },
      )
    }

    await sql`
      UPDATE milestone_deliverables SET is_removed = TRUE WHERE id = ${deliverableId}
    `

    await removeEncryptedFile(deliverable.file_path)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove deliverable', code: 'DELETE_FAILED' },
      { status: 500 },
    )
  }
})
