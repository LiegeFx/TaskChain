import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn().mockImplementation((body: any, init?: any) => ({
      status: init?.status ?? 200,
      body,
    })),
  },
}))

vi.mock('@/lib/db', () => ({
  sql: mockSql,
}))

vi.mock('@/lib/auth/session', () => ({
  readAccessToken: vi.fn().mockReturnValue('token'),
  verifyAccessToken: vi.fn().mockReturnValue({ walletAddress: 'GABC', jti: 'jti-1' }),
}))

import { withAdmin } from '@/lib/auth/adminMiddleware'
import { NextResponse } from 'next/server'

const mockJson = vi.mocked(NextResponse.json)

function makeRequest() {
  return { headers: { get: () => null } } as any
}

describe('withAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJson.mockImplementation(((body: any, init?: any) => ({
      status: init?.status ?? 200,
      body,
    })) as any)
  })

  it('returns 404 when user not found', async () => {
    mockSql.mockResolvedValue([])
    const handler = withAdmin(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(404)
    expect(result.body.code).toBe('USER_NOT_FOUND')
  })

  it('returns 403 when user is not admin', async () => {
    mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
    const handler = withAdmin(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(403)
  })

  it('returns 500 for invalid role', async () => {
    mockSql.mockResolvedValue([{ id: 'u1', role: 'invalid_role' }])
    const handler = withAdmin(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(500)
    expect(result.body.code).toBe('INVALID_ROLE')
  })

  it('passes when user is admin', async () => {
    mockSql.mockResolvedValue([{ id: 'u1', role: 'admin' }])
    const handler = withAdmin(async (_req: any, auth: any) => {
      return { role: auth.role, userId: auth.userId } as any
    })
    const result = await handler(makeRequest())
    expect(result.role).toBe('admin')
    expect(result.userId).toBe('u1')
  })

  it('returns 500 on DB error', async () => {
    mockSql.mockRejectedValue(new Error('DB error'))
    const handler = withAdmin(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(500)
  })
})
