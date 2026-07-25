export const dynamic = 'force-dynamic'

import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import {
  ALLOWED_DELIVERABLE_MIME_TYPES,
  MAX_DELIVERABLE_FILE_SIZE,
  MAX_DELIVERABLE_FILES_PER_BATCH,
} from '@/lib/validations'
import {
  computeFileHash,
  storeEncryptedFile,
} from '@/lib/security/fileEncryption'

export const POST = withAuth(async (request: NextRequest, auth) => {
  const milestoneId = request.nextUrl.pathname.split('/').at(-2)

  if (!milestoneId) {
    return NextResponse.json(
      { error: 'Milestone ID is required', code: 'MISSING_MILESTONE_ID' },
      { status: 400 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be multipart/form-data', code: 'INVALID_FORM_DATA' },
      { status: 400 },
    )
  }

  const fileEntries = Array.from(formData.entries()).filter(
    (entry): entry is [string, File] => entry[1] instanceof File,
  )

  if (fileEntries.length === 0) {
    return NextResponse.json(
      { error: 'No files provided. Attach files using the "files" field.', code: 'NO_FILES' },
      { status: 400 },
    )
  }

  if (fileEntries.length > MAX_DELIVERABLE_FILES_PER_BATCH) {
    return NextResponse.json(
      {
        error: `Cannot upload more than ${MAX_DELIVERABLE_FILES_PER_BATCH} files at once`,
        code: 'TOO_MANY_FILES',
      },
      { status: 422 },
    )
  }

  const validationErrors: { filename: string; reason: string }[] = []

  for (const [, file] of fileEntries) {
    if (!file.size || file.size <= 0) {
      validationErrors.push({ filename: file.name, reason: 'File is empty' })
      continue
    }
    if (file.size > MAX_DELIVERABLE_FILE_SIZE) {
      validationErrors.push({ filename: file.name, reason: `File exceeds ${MAX_DELIVERABLE_FILE_SIZE / (1024 * 1024)} MB limit` })
      continue
    }
    if (!ALLOWED_DELIVERABLE_MIME_TYPES.includes(file.type as typeof ALLOWED_DELIVERABLE_MIME_TYPES[number])) {
      validationErrors.push({ filename: file.name, reason: `File type "${file.type}" is not allowed` })
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      { error: 'Some files failed validation', code: 'VALIDATION_ERRORS', details: validationErrors },
      { status: 422 },
    )
  }

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const [milestone] = await sql`
      SELECT m.*, c.freelancer_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${milestoneId}
      LIMIT 1
    `
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })
    }

    if (milestone.freelancer_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the assigned freelancer can upload deliverables', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    const allowedStatuses = ['in_progress', 'submitted']
    if (!allowedStatuses.includes(milestone.status)) {
      return NextResponse.json(
        { error: `Cannot upload deliverables when milestone status is '${milestone.status}'`, code: 'INVALID_STATUS' },
        { status: 422 },
      )
    }

    const uploaderId = user.id
    const deliverables: unknown[] = []

    for (const [, file] of fileEntries) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileHash = computeFileHash(buffer)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const storedFilename = `${randomUUID()}.${ext}`
      const { iv, filePath } = await storeEncryptedFile(buffer, storedFilename)

      const [record] = await sql`
        INSERT INTO milestone_deliverables
          (milestone_id, uploader_id, original_filename, stored_filename,
           mime_type, file_size, file_hash, encryption_iv, file_path)
        VALUES
          (${milestoneId}, ${uploaderId}, ${file.name}, ${storedFilename},
           ${file.type}, ${file.size}, ${fileHash}, ${iv}, ${filePath})
        RETURNING id, original_filename, mime_type, file_size, file_hash, created_at
      `

      deliverables.push(record)
    }

    return NextResponse.json({ deliverables }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Failed to upload deliverables', code: 'UPLOAD_FAILED' },
      { status: 500 },
    )
  }
})

export const GET = withAuth(async (request: NextRequest, auth) => {
  const milestoneId = request.nextUrl.pathname.split('/').at(-2)

  if (!milestoneId) {
    return NextResponse.json(
      { error: 'Milestone ID is required', code: 'MISSING_MILESTONE_ID' },
      { status: 400 },
    )
  }

  try {
    const [user] = await sql`SELECT id FROM users WHERE wallet_address = ${auth.walletAddress} LIMIT 1`
    if (!user) {
      return NextResponse.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, { status: 404 })
    }

    const [milestone] = await sql`
      SELECT m.*, c.client_id, c.freelancer_id
      FROM milestones m
      LEFT JOIN contracts c ON c.id = m.contract_id
      WHERE m.id = ${milestoneId}
      LIMIT 1
    `
    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found', code: 'MILESTONE_NOT_FOUND' }, { status: 404 })
    }

    if (milestone.client_id !== user.id && milestone.freelancer_id !== user.id) {
      return NextResponse.json({ error: 'Access denied', code: 'FORBIDDEN' }, { status: 403 })
    }

    const rows = await sql`
      SELECT id, milestone_id, uploader_id, original_filename, mime_type,
             file_size, file_hash, created_at
      FROM milestone_deliverables
      WHERE milestone_id = ${milestoneId} AND is_removed = FALSE
      ORDER BY created_at DESC
    `

    return NextResponse.json({ deliverables: rows })
  } catch {
    return NextResponse.json(
      { error: 'Failed to load deliverables', code: 'LIST_FAILED' },
      { status: 500 },
    )
  }
})
