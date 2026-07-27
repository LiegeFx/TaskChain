import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  sql: Object.assign(
    vi.fn().mockResolvedValue([]),
    { raw: vi.fn() },
  ),
}))

vi.mock('@/lib/auth/store', () => ({
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  rotateRefreshToken: vi.fn().mockResolvedValue(true),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  findValidRefreshToken: vi.fn().mockResolvedValue(true),
  touchRefreshToken: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: vi.fn().mockImplementation(() => ({
    cookies: {
      set: vi.fn(),
      get: vi.fn(),
    },
    json: vi.fn(),
  })),
}))

const VALID_SECRET = 'test-secret-key-that-is-at-least-32-chars-long'

import {
  createSession,
  rotateSession,
  revokeSession,
  readAccessToken,
  readRefreshToken,
  verifyAccessToken,
  setSessionCookies,
  clearSessionCookies,
} from '@/lib/auth/session'
import { signSessionToken } from '@/lib/auth/jwt'
import { storeRefreshToken, rotateRefreshToken, revokeRefreshToken } from '@/lib/auth/store'

function makeRequest(overrides: Record<string, string> = {}) {
  return {
    headers: {
      get: (name: string) => overrides[name] ?? null,
    },
    cookies: {
      get: (name: string) => {
        const val = overrides[`cookie:${name}`]
        return val !== undefined ? { value: val } : undefined
      },
    },
  } as any
}

describe('session', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = VALID_SECRET
    process.env.NODE_ENV = 'test'
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('creates a session with normalized wallet address', async () => {
      const request = makeRequest({ 'user-agent': 'test-agent' })
      const session = await createSession(request, 'gabc123')
      expect(session.walletAddress).toBe('GABC123')
      expect(session.accessToken).toBeTruthy()
      expect(session.refreshToken).toBeTruthy()
      expect(session.accessTokenExpiresAt).toBeInstanceOf(Date)
      expect(session.refreshTokenExpiresAt).toBeInstanceOf(Date)
      expect(session.refreshJti).toBeTruthy()
    })

    it('stores refresh token with metadata', async () => {
      const request = makeRequest({
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      })
      await createSession(request, 'GABC123')
      expect(storeRefreshToken).toHaveBeenCalledTimes(1)
      const call = (storeRefreshToken as any).mock.calls[0][0]
      expect(call.walletAddress).toBe('GABC123')
      expect(call.userAgent).toBe('Mozilla/5.0')
      expect(call.ipAddress).toBe('1.2.3.4')
    })

    it('uses x-real-ip as fallback for client IP', async () => {
      const request = makeRequest({ 'x-real-ip': '9.8.7.6' })
      await createSession(request, 'GABC123')
      const call = (storeRefreshToken as any).mock.calls[0][0]
      expect(call.ipAddress).toBe('9.8.7.6')
    })

    it('returns null IP when no forwarded-for or x-real-ip', async () => {
      const request = makeRequest()
      await createSession(request, 'GABC123')
      const call = (storeRefreshToken as any).mock.calls[0][0]
      expect(call.ipAddress).toBeNull()
    })

    it('throws when JWT_SECRET is not set', async () => {
      delete process.env.JWT_SECRET
      const request = makeRequest()
      await expect(createSession(request, 'GABC123')).rejects.toThrow('JWT_SECRET')
    })

    it('throws when JWT_SECRET is too short', async () => {
      process.env.JWT_SECRET = 'short'
      const request = makeRequest()
      await expect(createSession(request, 'GABC123')).rejects.toThrow('JWT_SECRET')
    })
  })

  describe('rotateSession', () => {
    it('rotates a valid refresh token', async () => {
      const { token } = signSessionToken({
        subject: 'GABC123',
        walletAddress: 'GABC123',
        type: 'refresh',
        expiresInSeconds: 604800,
        secret: VALID_SECRET,
      })
      const request = makeRequest()
      const session = await rotateSession(request, token)
      expect(session).not.toBeNull()
      expect(session?.walletAddress).toBe('GABC123')
      expect(rotateRefreshToken).toHaveBeenCalledTimes(1)
    })

    it('returns null for invalid token', async () => {
      const request = makeRequest()
      const session = await rotateSession(request, 'invalid.token.here')
      expect(session).toBeNull()
    })

    it('returns null for access token (not refresh)', async () => {
      const { token } = signSessionToken({
        subject: 'GABC123',
        walletAddress: 'GABC123',
        type: 'access',
        expiresInSeconds: 900,
        secret: VALID_SECRET,
      })
      const request = makeRequest()
      const session = await rotateSession(request, token)
      expect(session).toBeNull()
    })

    it('returns null when rotateRefreshToken returns false', async () => {
      ;(rotateRefreshToken as any).mockResolvedValueOnce(false)
      const { token } = signSessionToken({
        subject: 'GABC123',
        walletAddress: 'GABC123',
        type: 'refresh',
        expiresInSeconds: 604800,
        secret: VALID_SECRET,
      })
      const request = makeRequest()
      const session = await rotateSession(request, token)
      expect(session).toBeNull()
    })
  })

  describe('revokeSession', () => {
    it('revokes a valid refresh token', async () => {
      const { token } = signSessionToken({
        subject: 'GABC123',
        walletAddress: 'GABC123',
        type: 'refresh',
        expiresInSeconds: 604800,
        secret: VALID_SECRET,
      })
      await revokeSession(token)
      expect(revokeRefreshToken).toHaveBeenCalledTimes(1)
    })

    it('does nothing for invalid token', async () => {
      await revokeSession('invalid')
      expect(revokeRefreshToken).not.toHaveBeenCalled()
    })

    it('does nothing for access token', async () => {
      const { token } = signSessionToken({
        subject: 'GABC123', walletAddress: 'GABC123',
        type: 'access', expiresInSeconds: 900, secret: VALID_SECRET,
      })
      await revokeSession(token)
      expect(revokeRefreshToken).not.toHaveBeenCalled()
    })
  })

  describe('readAccessToken', () => {
    it('reads token from Authorization header', () => {
      const request = makeRequest({ authorization: 'Bearer abc123' })
      expect(readAccessToken(request)).toBe('abc123')
    })

    it('returns null when no Authorization header and no cookie', () => {
      const request = makeRequest()
      expect(readAccessToken(request)).toBeNull()
    })

    it('reads token from cookie fallback', () => {
      const request = makeRequest({ 'cookie:tc_access_token': 'cookie-val' })
      expect(readAccessToken(request)).toBe('cookie-val')
    })
  })

  describe('readRefreshToken', () => {
    it('reads refresh token from cookie', () => {
      const request = makeRequest({ 'cookie:tc_refresh_token': 'refresh-val' })
      expect(readRefreshToken(request)).toBe('refresh-val')
    })

    it('returns null when no refresh token cookie', () => {
      const request = makeRequest()
      expect(readRefreshToken(request)).toBeNull()
    })
  })

  describe('verifyAccessToken', () => {
    it('verifies a valid access token', () => {
      const { token } = signSessionToken({
        subject: 'GABC123', walletAddress: 'GABC123',
        type: 'access', expiresInSeconds: 900, secret: VALID_SECRET,
      })
      const result = verifyAccessToken(token)
      expect(result).not.toBeNull()
      expect(result?.walletAddress).toBe('GABC123')
    })

    it('returns null for refresh token', () => {
      const { token } = signSessionToken({
        subject: 'GABC123', walletAddress: 'GABC123',
        type: 'refresh', expiresInSeconds: 604800, secret: VALID_SECRET,
      })
      expect(verifyAccessToken(token)).toBeNull()
    })

    it('returns null for invalid token', () => {
      expect(verifyAccessToken('bad')).toBeNull()
    })
  })

  describe('setSessionCookies', () => {
    it('sets access and refresh cookies with correct names and attributes', () => {
      const response = {
        cookies: { set: vi.fn() },
      } as any
      const session = {
        accessToken: 'acc',
        refreshToken: 'ref',
        accessTokenExpiresAt: new Date('2026-01-01'),
        refreshTokenExpiresAt: new Date('2026-12-31'),
      } as any
      setSessionCookies(response, session)
      expect(response.cookies.set).toHaveBeenCalledTimes(2)

      const calls = response.cookies.set.mock.calls
      const accessCookie = calls[0][0]
      const refreshCookie = calls[1][0]

      expect(accessCookie.name).toBe('tc_access_token')
      expect(accessCookie.value).toBe('acc')
      expect(accessCookie.httpOnly).toBe(true)
      expect(accessCookie.sameSite).toBe('lax')
      expect(accessCookie.path).toBe('/')
      expect(accessCookie.expires).toEqual(new Date('2026-01-01'))

      expect(refreshCookie.name).toBe('tc_refresh_token')
      expect(refreshCookie.value).toBe('ref')
      expect(refreshCookie.httpOnly).toBe(true)
      expect(refreshCookie.sameSite).toBe('lax')
      expect(refreshCookie.path).toBe('/')
      expect(refreshCookie.expires).toEqual(new Date('2026-12-31'))
    })

    it('sets secure=true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production'
      const response = { cookies: { set: vi.fn() } } as any
      const session = {
        accessToken: 'acc', refreshToken: 'ref',
        accessTokenExpiresAt: new Date(), refreshTokenExpiresAt: new Date(),
      } as any
      setSessionCookies(response, session)
      expect(response.cookies.set.mock.calls[0][0].secure).toBe(true)
    })

    it('sets secure=false when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test'
      const response = { cookies: { set: vi.fn() } } as any
      const session = {
        accessToken: 'acc', refreshToken: 'ref',
        accessTokenExpiresAt: new Date(), refreshTokenExpiresAt: new Date(),
      } as any
      setSessionCookies(response, session)
      expect(response.cookies.set.mock.calls[0][0].secure).toBe(false)
    })
  })

  describe('clearSessionCookies', () => {
    it('clears both cookies with correct names, maxAge 0, and security attributes', () => {
      const response = {
        cookies: { set: vi.fn() },
      } as any
      clearSessionCookies(response)
      expect(response.cookies.set).toHaveBeenCalledTimes(2)

      const calls = response.cookies.set.mock.calls
      const accessClear = calls[0][0]
      const refreshClear = calls[1][0]

      expect(accessClear.name).toBe('tc_access_token')
      expect(accessClear.value).toBe('')
      expect(accessClear.maxAge).toBe(0)
      expect(accessClear.httpOnly).toBe(true)
      expect(accessClear.path).toBe('/')

      expect(refreshClear.name).toBe('tc_refresh_token')
      expect(refreshClear.value).toBe('')
      expect(refreshClear.maxAge).toBe(0)
      expect(refreshClear.httpOnly).toBe(true)
      expect(refreshClear.path).toBe('/')
    })
  })
})
