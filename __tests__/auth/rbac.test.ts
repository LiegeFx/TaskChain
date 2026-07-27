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

import { withRbac, withAnyRbac, withAllRbac, withRole, checkUserPermission, checkUserAnyPermission, checkUserAllPermissions } from '@/lib/auth/rbacMiddleware'
import { NextResponse } from 'next/server'
import { RbacContext } from '@/lib/auth/rbacMiddleware'

const mockJson = vi.mocked(NextResponse.json)

function makeRequest() {
  return { headers: { get: () => null } } as any
}

describe('rbacMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJson.mockImplementation(((body: any, init?: any) => ({
      status: init?.status ?? 200,
      body,
    })) as any)
  })

  describe('withRbac', () => {
    it('returns 404 when user not found', async () => {
      mockSql.mockResolvedValue([])
      const handler = withRbac('project:view', async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(404)
      expect(result.body.code).toBe('USER_NOT_FOUND')
    })

    it('returns 500 for invalid role', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'INVALID_ROLE' }])
      const handler = withRbac('project:view', async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('INVALID_ROLE')
    })

    it('returns 403 for insufficient permissions', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
      const handler = withRbac('project:create', async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('INSUFFICIENT_PERMISSIONS')
    })

    it('calls handler with RbacContext when authorized', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'client' }])
      const handler = withRbac('project:create', async (_req: any, auth: RbacContext) => {
        return { userId: auth.userId, role: auth.role } as any
      })
      const result = await handler(makeRequest())
      expect(result.userId).toBe('u1')
      expect(result.role).toBe('client')
    })

    it('returns 500 on DB error', async () => {
      mockSql.mockRejectedValue(new Error('DB error'))
      const handler = withRbac('project:view', async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('withAnyRbac', () => {
    it('returns 404 when user not found', async () => {
      mockSql.mockResolvedValue([])
      const handler = withAnyRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(404)
    })

    it('returns 500 for invalid role', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'unknown' }])
      const handler = withAnyRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('INVALID_ROLE')
    })

    it('returns 403 when no matching permission', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
      const handler = withAnyRbac(['project:create', 'admin:users_manage'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(403)
    })

    it('passes when user has one of the permissions', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
      const handler = withAnyRbac(['project:view', 'project:create'], async (_req: any, auth: RbacContext) => {
        return { userId: auth.userId } as any
      })
      const result = await handler(makeRequest())
      expect(result.userId).toBe('u1')
    })

    it('returns 500 on DB error', async () => {
      mockSql.mockRejectedValue(new Error('DB error'))
      const handler = withAnyRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
    })
  })

  describe('withAllRbac', () => {
    it('returns 404 when user not found', async () => {
      mockSql.mockResolvedValue([])
      const handler = withAllRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(404)
    })

    it('returns 500 for invalid role', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'NOPE' }])
      const handler = withAllRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('INVALID_ROLE')
    })

    it('returns 403 when missing required permissions', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
      const handler = withAllRbac(['project:view', 'project:create'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(403)
    })

    it('passes when user has all permissions', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'admin' }])
      const handler = withAllRbac(['project:view', 'project:create'], async (_req: any, auth: RbacContext) => {
        return { userId: auth.userId } as any
      })
      const result = await handler(makeRequest())
      expect(result.userId).toBe('u1')
    })

    it('returns 500 on DB error', async () => {
      mockSql.mockRejectedValue(new Error('DB error'))
      const handler = withAllRbac(['project:view'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
    })
  })

  describe('withRole', () => {
    it('returns 404 when user not found', async () => {
      mockSql.mockResolvedValue([])
      const handler = withRole(['admin'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(404)
    })

    it('returns 500 for invalid role', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'INVALID' }])
      const handler = withRole(['admin'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
      expect(result.body.code).toBe('INVALID_ROLE')
    })

    it('returns 403 when role not in allowed list', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'freelancer' }])
      const handler = withRole(['admin'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('INSUFFICIENT_PERMISSIONS')
    })

    it('passes when role is in allowed list', async () => {
      mockSql.mockResolvedValue([{ id: 'u1', role: 'admin' }])
      const handler = withRole(['admin'], async (_req: any, auth: RbacContext) => {
        return { userId: auth.userId } as any
      })
      const result = await handler(makeRequest())
      expect(result.userId).toBe('u1')
    })

    it('returns 500 on DB error', async () => {
      mockSql.mockRejectedValue(new Error('DB error'))
      const handler = withRole(['admin'], async () => ({ ok: true } as any))
      const result = await handler(makeRequest())
      expect(result.status).toBe(500)
    })
  })

  describe('helper functions', () => {
    it('checkUserPermission returns true when role has permission', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'admin' }
      expect(checkUserPermission(auth, 'admin:users_manage')).toBe(true)
    })

    it('checkUserPermission returns false when role lacks permission', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'freelancer' }
      expect(checkUserPermission(auth, 'admin:users_manage')).toBe(false)
    })

    it('checkUserAnyPermission returns true when role has one', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'freelancer' }
      expect(checkUserAnyPermission(auth, ['project:create', 'project:view'])).toBe(true)
    })

    it('checkUserAnyPermission returns false when role has none', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'freelancer' }
      expect(checkUserAnyPermission(auth, ['project:create', 'admin:users_manage'])).toBe(false)
    })

    it('checkUserAllPermissions returns true when role has all', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'admin' }
      expect(checkUserAllPermissions(auth, ['project:view', 'project:create'])).toBe(true)
    })

    it('checkUserAllPermissions returns false when role misses some', () => {
      const auth: RbacContext = { walletAddress: 'GABC', tokenJti: 'jti-1', userId: 'u1', role: 'freelancer' }
      expect(checkUserAllPermissions(auth, ['project:view', 'project:create'])).toBe(false)
    })
  })
})
