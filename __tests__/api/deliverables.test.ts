import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST, GET } from '@/app/api/milestones/[id]/deliverables/route'
import { GET as getDeliverable, DELETE } from '@/app/api/milestones/[id]/deliverables/[deliverableId]/route'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/security/fileEncryption', () => ({
  computeFileHash: vi.fn().mockReturnValue('dummy-hash'),
  storeEncryptedFile: vi.fn().mockResolvedValue({ iv: 'dummy-iv', filePath: '/tmp/dummy-path' }),
  readEncryptedFile: vi.fn().mockResolvedValue(Buffer.from('file-content')),
  removeEncryptedFile: vi.fn().mockResolvedValue(undefined),
}))

import { sql } from '@/lib/db'

type SqlMock = ReturnType<typeof vi.fn>

function queueSql(responses: unknown[]) {
  const mock = sql as unknown as SqlMock
  for (const response of responses) {
    mock.mockResolvedValueOnce(response)
  }
}

function queueSqlReject(error: unknown) {
  const mock = sql as unknown as SqlMock
  mock.mockRejectedValueOnce(error)
}

function makePostRequest(url: string, files: File[]): NextRequest {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  return new NextRequest(new Request(url, { method: 'POST', body: formData }))
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(new Request(url, { method: 'DELETE' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/milestones/[id]/deliverables', () => {
  const milestoneId = '00000000-0000-0000-0000-000000000001'

  it('returns 400 when no files are provided', async () => {
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [],
    )
    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('NO_FILES')
  })

  it('returns 422 when too many files are uploaded', async () => {
    const files = Array.from({ length: 11 }, (_, i) =>
      new File(['content'], `file${i}.pdf`, { type: 'application/pdf' }),
    )
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      files,
    )
    const response = await POST(request)
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.code).toBe('TOO_MANY_FILES')
  })

  it('returns 422 when a file has an invalid type', async () => {
    const file = new File(['<script>'], 'bad.html', { type: 'text/html' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.code).toBe('VALIDATION_ERRORS')
    expect(body.details[0].filename).toBe('bad.html')
  })

  it('returns 422 when a file exceeds the size limit', async () => {
    const oversized = new ArrayBuffer(60 * 1024 * 1024)
    const file = new File([oversized], 'huge.pdf', { type: 'application/pdf' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.code).toBe('VALIDATION_ERRORS')
  })

  it('returns 404 when user is not found', async () => {
    queueSql([[]]) // no user
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe('USER_NOT_FOUND')
  })

  it('returns 404 when milestone is not found', async () => {
    queueSql([
      [{ id: 'user-1' }],       // user found
      [],                        // milestone not found
    ])
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe('MILESTONE_NOT_FOUND')
  })

  it('returns 403 when user is not the assigned freelancer', async () => {
    queueSql([
      [{ id: 'user-1' }],             // user found
      [{ freelancer_id: 'user-2' }],  // milestone found, different freelancer
    ])
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.code).toBe('FORBIDDEN')
  })

  it('returns 201 and stores deliverable metadata on success', async () => {
    queueSql([
      [{ id: 'user-1' }],                        // user found
      [{ freelancer_id: 'user-1', status: 'in_progress' }], // milestone found
      [{ id: 'del-1', original_filename: 'doc.pdf', mime_type: 'application/pdf',
         file_size: 7, file_hash: 'dummy-hash', created_at: '2026-01-01T00:00:00Z' }], // insert result
    ])
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    const request = makePostRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
      [file],
    )
    const response = await POST(request)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.deliverables).toHaveLength(1)
    expect(body.deliverables[0].original_filename).toBe('doc.pdf')
  })
})

describe('GET /api/milestones/[id]/deliverables', () => {
  const milestoneId = '00000000-0000-0000-0000-000000000001'

  it('returns 404 when user is not found', async () => {
    queueSql([[]])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
    )
    const response = await GET(request)
    expect(response.status).toBe(404)
  })

  it('returns 404 when milestone is not found', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
    )
    const response = await GET(request)
    expect(response.status).toBe(404)
  })

  it('returns 403 when user has no access', async () => {
    queueSql([
      [{ id: 'user-3' }],
      [{ client_id: 'user-1', freelancer_id: 'user-2' }],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
    )
    const response = await GET(request)
    expect(response.status).toBe(403)
  })

  it('returns deliverables list for authorized user', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [{ client_id: 'user-1', freelancer_id: 'user-2' }],
      [{ id: 'del-1', original_filename: 'report.pdf', mime_type: 'application/pdf',
         file_size: 100, file_hash: 'abc', created_at: '2026-01-01T00:00:00Z' }],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables`,
    )
    const response = await GET(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.deliverables).toHaveLength(1)
    expect(body.deliverables[0].original_filename).toBe('report.pdf')
  })
})

describe('GET /api/milestones/[id]/deliverables/[deliverableId]', () => {
  const milestoneId = '00000000-0000-0000-0000-000000000001'
  const deliverableId = '00000000-0000-0000-0000-0000000000dd'

  it('returns 404 when deliverable is not found', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables/${deliverableId}`,
    )
    const response = await getDeliverable(request)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe('DELIVERABLE_NOT_FOUND')
  })

  it('returns 403 when user is not authorized', async () => {
    queueSql([
      [{ id: 'user-3' }],
      [{ file_path: '/tmp/f', encryption_iv: 'iv', mime_type: 'application/pdf',
         original_filename: 'doc.pdf', client_id: 'user-1', freelancer_id: 'user-2' }],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables/${deliverableId}`,
    )
    const response = await getDeliverable(request)
    expect(response.status).toBe(403)
  })

  it('returns the file content with correct headers for authorized user', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [{ file_path: '/tmp/f', encryption_iv: 'iv', mime_type: 'application/pdf',
         original_filename: 'doc.pdf', client_id: 'user-1', freelancer_id: 'user-2' }],
    ])
    const request = makeGetRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables/${deliverableId}`,
    )
    const response = await getDeliverable(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="doc.pdf"')
  })
})

describe('DELETE /api/milestones/[id]/deliverables/[deliverableId]', () => {
  const milestoneId = '00000000-0000-0000-0000-000000000001'
  const deliverableId = '00000000-0000-0000-0000-0000000000dd'

  it('returns 403 when user is not the freelancer', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [{ file_path: '/tmp/f', encryption_iv: 'iv', freelancer_id: 'user-2' }],
    ])
    const request = makeDeleteRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables/${deliverableId}`,
    )
    const response = await DELETE(request)
    expect(response.status).toBe(403)
  })

  it('returns success when deletion is allowed', async () => {
    queueSql([
      [{ id: 'user-1' }],
      [{ file_path: '/tmp/f', encryption_iv: 'iv', freelancer_id: 'user-1' }],
      [{ status: 'in_progress' }],
      [], // update result
    ])
    const request = makeDeleteRequest(
      `http://localhost/api/milestones/${milestoneId}/deliverables/${deliverableId}`,
    )
    const response = await DELETE(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })
})
