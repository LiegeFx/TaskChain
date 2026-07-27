/**
 * app/api/dashboard/stats/stats.test.ts
 *
 * Unit tests for:
 *   - lib/dashboard/stats  (query layer)
 *   - GET /api/dashboard/stats (route handler)
 *
 * The `sql` export from @/lib/db is a Proxy, so it cannot be spied on
 * directly. Instead we replace the entire module with a vi.mock factory
 * that exposes a plain vi.fn() which tests can configure per-call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DashboardStats } from '@/lib/dashboard/stats'

// ─── Module-level mock for @/lib/db ─────────────────────────────────────────

const mockSqlFn = vi.fn()

vi.mock('@/lib/db', () => ({
  sql: mockSqlFn,
}))

// ─── queryStats ──────────────────────────────────────────────────────────────

describe('queryStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps DB row to DashboardStats correctly', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      active_contracts: 3,
      completed_contracts: 7,
      total_earnings: '1500.00',
      escrow_volume: '2500.50',
    }])

    const { queryStats } = await import('@/lib/dashboard/stats')
    const result = await queryStats('user-uuid-1')

    expect(result).toEqual<DashboardStats>({
      activeContracts: 3,
      completedContracts: 7,
      totalEarnings: '1500.00',
      escrowVolume: '2500.50',
    })
  })

  it('returns zero values when query returns no rows', async () => {
    mockSqlFn.mockResolvedValueOnce([])

    const { queryStats } = await import('@/lib/dashboard/stats')
    const result = await queryStats('user-uuid-no-data')

    expect(result).toEqual<DashboardStats>({
      activeContracts: 0,
      completedContracts: 0,
      totalEarnings: '0',
      escrowVolume: '0',
    })
  })

  it('handles null numeric fields by defaulting to "0"', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      active_contracts: 0,
      completed_contracts: 0,
      total_earnings: null,
      escrow_volume: null,
    }])

    const { queryStats } = await import('@/lib/dashboard/stats')
    const result = await queryStats('user-uuid-nulls')

    expect(result.totalEarnings).toBe('0')
    expect(result.escrowVolume).toBe('0')
  })
})

// ─── getDashboardStats ───────────────────────────────────────────────────────

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws USER_NOT_FOUND when wallet is not registered', async () => {
    mockSqlFn.mockResolvedValueOnce([])  // getUserIdByWallet → no rows

    const { getDashboardStats } = await import('@/lib/dashboard/stats')
    await expect(getDashboardStats('GUNKNOWN')).rejects.toThrow('USER_NOT_FOUND')
  })

  it('returns stats for a registered wallet', async () => {
    mockSqlFn
      .mockResolvedValueOnce([{ id: 'user-uuid-1' }])  // getUserIdByWallet
      .mockResolvedValueOnce([{                          // queryStats
        active_contracts: 2,
        completed_contracts: 5,
        total_earnings: '800.00',
        escrow_volume: '400.00',
      }])

    const { getDashboardStats } = await import('@/lib/dashboard/stats')
    const stats = await getDashboardStats('GABC123')

    expect(stats).toEqual<DashboardStats>({
      activeContracts: 2,
      completedContracts: 5,
      totalEarnings: '800.00',
      escrowVolume: '400.00',
    })
  })
})

// ─── Route handler ───────────────────────────────────────────────────────────

describe('GET /api/dashboard/stats route', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 200 with stats and cache header on success', async () => {
    vi.doMock('@/lib/dashboard/stats', () => ({
      getDashboardStats: vi.fn().mockResolvedValue({
        activeContracts: 1,
        completedContracts: 4,
        totalEarnings: '300.00',
        escrowVolume: '100.00',
      } satisfies DashboardStats),
    }))

    vi.doMock('@/lib/auth/middleware', () => ({
      withAuth: (handler: (req: Request, auth: { walletAddress: string }) => Promise<Response>) =>
        (req: Request) => handler(req, { walletAddress: 'GABC123' }),
    }))

    const { GET } = await import('@/app/api/dashboard/stats/route')
    const req = new Request('http://localhost/api/dashboard/stats')
    const res = await GET(req as never)

    expect(res.status).toBe(200)
    const body = await res.json() as { data: DashboardStats; meta: { generatedAt: string } }
    expect(body.data).toEqual({
      activeContracts: 1,
      completedContracts: 4,
      totalEarnings: '300.00',
      escrowVolume: '100.00',
    })
    expect(body.meta.generatedAt).toBeDefined()
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60')
  })

  it('returns 404 when wallet is not registered', async () => {
    vi.doMock('@/lib/dashboard/stats', () => ({
      getDashboardStats: vi.fn().mockRejectedValue(new Error('USER_NOT_FOUND')),
    }))

    vi.doMock('@/lib/auth/middleware', () => ({
      withAuth: (handler: (req: Request, auth: { walletAddress: string }) => Promise<Response>) =>
        (req: Request) => handler(req, { walletAddress: 'GUNKNOWN' }),
    }))

    const { GET } = await import('@/app/api/dashboard/stats/route')
    const req = new Request('http://localhost/api/dashboard/stats')
    const res = await GET(req as never)

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('USER_NOT_FOUND')
  })

  it('returns 500 on unexpected DB error', async () => {
    vi.doMock('@/lib/dashboard/stats', () => ({
      getDashboardStats: vi.fn().mockRejectedValue(new Error('connection refused')),
    }))

    vi.doMock('@/lib/auth/middleware', () => ({
      withAuth: (handler: (req: Request, auth: { walletAddress: string }) => Promise<Response>) =>
        (req: Request) => handler(req, { walletAddress: 'GABC123' }),
    }))

    const { GET } = await import('@/app/api/dashboard/stats/route')
    const req = new Request('http://localhost/api/dashboard/stats')
    const res = await GET(req as never)

    expect(res.status).toBe(500)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})
