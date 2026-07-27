import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signSessionToken } from '@/lib/auth/jwt'

const VALID_SECRET = 'test-secret-key-that-is-at-least-32-chars-long'

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn().mockImplementation((body: any, init?: any) => ({
      status: init?.status ?? 200,
      body,
    })),
  },
}))

vi.mock('@/lib/auth/session', () => ({
  readAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))

import { withAuth } from '@/lib/auth/middleware'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

const mockReadAccessToken = vi.mocked(readAccessToken)
const mockVerifyAccessToken = vi.mocked(verifyAccessToken)

function makeRequest() {
  return { headers: { get: () => null } } as any
}

describe('withAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(NextResponse.json).mockImplementation(((body: any, init?: any) => ({
      status: init?.status ?? 200,
      body,
    })) as any)
  })

  it('returns 401 when no token', async () => {
    mockReadAccessToken.mockReturnValue(null)
    const handler = withAuth(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockReadAccessToken.mockReturnValue('bad-token')
    mockVerifyAccessToken.mockReturnValue(null)
    const handler = withAuth(async () => ({ ok: true } as any))
    const result = await handler(makeRequest())
    expect(result.status).toBe(401)
  })

  it('calls handler with auth context when valid', async () => {
    mockReadAccessToken.mockReturnValue('good-token')
    mockVerifyAccessToken.mockReturnValue({ walletAddress: 'GABC', jti: 'jti-1' })
    const handler = withAuth(async (_req: any, auth: any) => {
      return { wallet: auth.walletAddress, jti: auth.tokenJti } as any
    })
    const result = await handler(makeRequest())
    expect(result.wallet).toBe('GABC')
    expect(result.jti).toBe('jti-1')
  })
})
