import { describe, it, expect, vi, beforeEach } from 'vitest'

import { GET as listFreelancers } from '@/app/api/freelancers/route'
import { GET as getFreelancer } from '@/app/api/freelancers/[id]/route'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/reputation', () => ({
  userExists: vi.fn().mockResolvedValue(true),
  getFreelancerReputation: vi.fn().mockResolvedValue({
    userId: 1,
    metrics: {
      completionRate: 1,
      disputeRate: 0,
      totalVolume: 0,
      onTimeDeliveryPct: 1,
      jobsStarted: 3,
      jobsCompleted: 3,
      jobsWithDispute: 0,
      completedWithDeadline: 3,
      onTimeDeliveries: 3,
    },
    reputationScore: 100,
    computedAt: '2026-06-27T00:00:00.000Z',
  }),
}))

import { sql } from '@/lib/db'
import {
  mapUserRowToListing,
  parseDiscoveryParams,
  FreelancerDiscoveryError,
  FREELANCER_SORTABLE_FIELDS,
  FREELANCER_MAX_LIMIT,
} from '@/lib/freelancerDiscovery'
import { NextRequest } from 'next/server'

type SqlMock = ReturnType<typeof vi.fn>

interface UserRowOverrides {
  id?: number
  wallet_address?: string
  username?: string
  email?: string | null
  user_type?: string
  bio?: string | null
  skills?: string[] | null
  rating?: number | string | null
  total_jobs_completed?: number | null
  total_count?: string
  created_at?: Date
}

function buildUserRow(
  overrides: UserRowOverrides = {},
): Array<Record<string, unknown>> {
  return [
    {
      id: 1,
      wallet_address: 'GABC123',
      username: 'maya_chen',
      email: 'maya@example.com',
      user_type: 'freelancer',
      bio: 'Builds polished dApps',
      skills: ['React', 'Next.js'],
      rating: 4.5,
      total_jobs_completed: 12,
      created_at: new Date('2026-01-01T00:00:00Z'),
      total_count: '7',
      ...overrides,
    },
  ]
}

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

function makeRequest(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseDiscoveryParams', () => {
  it('applies defaults when no params are provided', () => {
    const params = parseDiscoveryParams(new URLSearchParams())
    expect(params).toEqual({
      query: '',
      skills: [],
      minRating: null,
      sort: 'rating',
      order: 'desc',
      limit: 6,
      page: 1,
    })
  })

  it('dedupes skills across repeating and comma-separated values', () => {
    const params = parseDiscoveryParams(
      new URLSearchParams('skills=react&skills=react,nodejs&skills=next.js'),
    )
    expect(params.skills).toEqual(['react', 'nodejs', 'next.js'])
  })

  it('accepts the legacy `rating=` alias for minRating', () => {
    const params = parseDiscoveryParams(new URLSearchParams('rating=4'))
    expect(params.minRating).toBe(4)
  })

  it('rejects out-of-range minRating', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('minRating=6')))
      .toThrowError(FreelancerDiscoveryError)
    expect(() => parseDiscoveryParams(new URLSearchParams('minRating=0')))
      .toThrowError(FreelancerDiscoveryError)
  })

  it('rejects unknown sort fields', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('sort=password')))
      .toThrowError(FreelancerDiscoveryError)
  })

  it('accepts whitelisted sort fields', () => {
    for (const field of FREELANCER_SORTABLE_FIELDS) {
      const params = parseDiscoveryParams(new URLSearchParams(`sort=${field}`))
      expect(params.sort).toBe(field)
    }
  })

  it('rejects bogus order values', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('order=ascending')))
      .toThrowError(FreelancerDiscoveryError)
  })

  it('clamps limit above the maximum', () => {
    const huge = FREELANCER_MAX_LIMIT * 10
    const params = parseDiscoveryParams(new URLSearchParams(`limit=${huge}`))
    expect(params.limit).toBe(FREELANCER_MAX_LIMIT)
  })

  it('rejects zero or negative page', () => {
    expect(() => parseDiscoveryParams(new URLSearchParams('page=0')))
      .toThrowError(FreelancerDiscoveryError)
    expect(() => parseDiscoveryParams(new URLSearchParams('page=-1')))
      .toThrowError(FreelancerDiscoveryError)
  })

  it('normalises unsupported limit values to default', () => {
    const params = parseDiscoveryParams(new URLSearchParams('limit=abc'))
    expect(params.limit).toBe(6)
  })

  it('trims the search query', () => {
    const params = parseDiscoveryParams(new URLSearchParams('q=%20%20hello%20%20'))
    expect(params.query).toBe('hello')
  })
})

describe('mapUserRowToListing', () => {
  it('falls back to placeholder values for missing DB fields', () => {
    const listing = mapUserRowToListing({
      id: 9,
      wallet_address: 'GXYZ',
      username: 'aisha',
      email: null,
      user_type: 'freelancer',
      bio: null,
      skills: null,
      rating: null,
      total_jobs_completed: null,
      created_at: new Date('2026-05-01T00:00:00Z'),
    })

    expect(listing).toMatchObject({
      id: 9,
      name: 'aisha',
      bio: '',
      skills: [],
      rating: 0,
      completedProjects: 0,
      profileImage: '/placeholder-user.jpg',
      hourlyRate: 0,
      location: '',
      title: 'TaskChain Freelancer',
    })
  })

  it('clamps out-of-range numeric ratings', () => {
    const listing = mapUserRowToListing({
      id: 1,
      wallet_address: 'GABC',
      username: 'sample',
      email: null,
      user_type: 'freelancer',
      bio: null,
      skills: [],
      rating: 99,
      total_jobs_completed: 0,
      created_at: new Date(),
    })
    expect(listing.rating).toBe(0)
  })
})

describe('GET /api/freelancers', () => {
  it('returns the discovery payload with proper pagination metadata', async () => {
    // Path: WHERE fragment → ORDER BY fragment → main list → skills query.
    // With the single-template WHERE/ORDER BY refactor, exactly 4 sql calls:
    //   1. WHERE fragment in listFreelancers
    //   2. ORDER BY fragment in listFreelancers
    //   3. main list query
    //   4. getAvailableSkills
    queueSql([
      [], // WHERE fragment
      [], // ORDER BY fragment
      buildUserRow(), // main list (returns 1 row, so no fallback COUNT)
      [{ skill: 'React' }, { skill: 'Node.js' }], // skills
    ])

    const request = makeRequest(
      'http://localhost/api/freelancers?q=maya&minRating=4&page=1&limit=2',
    )
    const response = await listFreelancers(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.freelancers).toHaveLength(1)
    expect(body.freelancers[0].name).toBe('maya_chen')
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 7,
      totalPages: 4,
    })
    expect(body.skills).toEqual(['React', 'Node.js'])
  })

  it('returns 0 freelancers for an out-of-range page with an accurate totalItems', async () => {
    // Path: WHERE → ORDER BY → main list (empty) → COUNT fallback
    // (which itself does WHERE + count) → skills. Six sql calls total.
    queueSql([
      [], // WHERE fragment for listFreelancers
      [], // ORDER BY fragment
      [], // main list (empty)
      [], // WHERE fragment rebuilt inside countFreelancers
      [{ count: '3' }], // COUNT(*) fallback
      [], // skills (none)
    ])

    const request = makeRequest(
      'http://localhost/api/freelancers?page=99&limit=10',
    )
    const response = await listFreelancers(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.freelancers).toEqual([])
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 0,
      totalItems: 3,
      totalPages: 1,
    })
  })

  it('returns 400 with structured error on invalid minRating', async () => {
    const request = makeRequest('http://localhost/api/freelancers?minRating=42')
    const response = await listFreelancers(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toEqual({
      error: expect.stringContaining('minRating'),
      code: 'INVALID_MIN_RATING',
    })
  })

  it('returns 400 on invalid sort field', async () => {
    const request = makeRequest(
      'http://localhost/api/freelancers?sort=payout_total',
    )
    const response = await listFreelancers(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_SORT_FIELD')
  })

  it('returns 503 when the DB query fails', async () => {
    // Path: WHERE succeeds → main list rejects → count_fallback and skills
    // are not invoked. Two sql calls: one resolve, one reject.
    queueSql([[]]) // WHERE fragment resolves first
    queueSqlReject(new Error('connection reset')) // main list rejects

    const request = makeRequest('http://localhost/api/freelancers')
    const response = await listFreelancers(request)

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      error: 'Unable to load freelancers',
      code: 'FREELANCER_LIST_FAILED',
    })
  })
})

describe('GET /api/freelancers/[id]', () => {
  it('returns the freelancer profile with nested reputation', async () => {
    queueSql([buildUserRow()])

    const request = makeRequest('http://localhost/api/freelancers/1')
    const response = await getFreelancer(request, {
      params: Promise.resolve({ id: '1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.freelancer.name).toBe('maya_chen')
    expect(body.reputation).toMatchObject({
      userId: 1,
      reputationScore: 100,
    })
  })

  it('returns the freelancer profile with null reputation when reputation lookup throws', async () => {
    const reputationModule = await import('@/lib/reputation')
    vi.mocked(reputationModule.userExists).mockRejectedValueOnce(
      new Error('downstream failure'),
    )

    queueSql([buildUserRow()])

    const request = makeRequest('http://localhost/api/freelancers/1')
    const response = await getFreelancer(request, {
      params: Promise.resolve({ id: '1' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.freelancer.name).toBe('maya_chen')
    expect(body.reputation).toBeNull()
  })

  it('returns 400 for a non-numeric id', async () => {
    const request = makeRequest('http://localhost/api/freelancers/abc')
    const response = await getFreelancer(request, {
      params: Promise.resolve({ id: 'abc' }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toEqual({
      error: 'Invalid freelancer id',
      code: 'INVALID_ID',
    })
  })

  it('returns 404 when the freelancer does not exist', async () => {
    queueSql([[]])

    const request = makeRequest('http://localhost/api/freelancers/9999')
    const response = await getFreelancer(request, {
      params: Promise.resolve({ id: '9999' }),
    })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.code).toBe('FREELANCER_NOT_FOUND')
  })
})
