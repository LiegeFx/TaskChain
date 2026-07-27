import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

import { GET as getProfile } from '@/app/api/public/freelancers/[id]/route'
import { GET as getContracts } from '@/app/api/public/freelancers/[id]/contracts/route'
import { GET as getReviews } from '@/app/api/public/freelancers/[id]/reviews/route'
import { GET as getReputation } from '@/app/api/public/freelancers/[id]/reputation/route'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
  buildRateLimitKey: vi.fn().mockReturnValue('test-key'),
}))

vi.mock('@/lib/reputation', () => ({
  getFreelancerReputation: vi.fn(),
}))

import { sql } from '@/lib/db'
import { getFreelancerReputation } from '@/lib/reputation'
import { enforceRateLimit } from '@/lib/security/rateLimit'
import {
  PUBLIC_MAX_LIMIT,
  SENSITIVE_FIELDS,
  computeReputationScore,
  parseFreelancerId,
  parsePagination,
  parseVerifiedFilter,
  PublicProfileError,
  type ReputationComponentKey,
} from '@/lib/publicFreelancerProfile'

type SqlMock = ReturnType<typeof vi.fn>

function queueSql(...responses: unknown[]) {
  const mock = sql as unknown as SqlMock
  for (const response of responses) {
    mock.mockResolvedValueOnce(response)
  }
}

function makeRequest(url = 'http://localhost/api/public/freelancers/7'): NextRequest {
  return new NextRequest(new Request(url))
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** A freelancer row as returned by the profile query. */
function profileRow(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: 7,
      username: 'ada',
      bio: 'Solidity and Soroban contracts.',
      skills: ['rust', 'soroban'],
      user_type: 'freelancer',
      wallet_address: 'GABC123',
      rating: '4.50',
      total_jobs_completed: 12,
      created_at: new Date('2026-01-05T10:00:00.000Z'),
      review_count: 4,
      average_rating: '4.2500',
      active_engagements: 0,
      completed_contracts: 9,
      ...overrides,
    },
  ]
}

const baseMetrics = {
  completionRate: 0.9,
  disputeRate: 0.1,
  totalVolume: 5000,
  onTimeDeliveryPct: 0.8,
  jobsStarted: 10,
  jobsCompleted: 9,
  jobsWithDispute: 1,
  completedWithDeadline: 5,
  onTimeDeliveries: 4,
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(enforceRateLimit as unknown as SqlMock).mockResolvedValue(null)
  ;(getFreelancerReputation as unknown as SqlMock).mockResolvedValue({
    userId: 7,
    metrics: baseMetrics,
    reputationScore: 88,
    computedAt: '2026-07-26T00:00:00.000Z',
  })
})

describe('GET /api/public/freelancers/[id]', () => {
  it.each(['abc', '0', '-3', '1.5', '7abc', ''])(
    'rejects id %j with 400 INVALID_FREELANCER_ID',
    async (rawId) => {
      const response = await getProfile(makeRequest(), routeContext(rawId))
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('INVALID_FREELANCER_ID')
      expect(sql).not.toHaveBeenCalled()
    },
  )

  it('returns the profile in a single query', async () => {
    queueSql(profileRow())

    const response = await getProfile(makeRequest(), routeContext('7'))
    expect(response.status).toBe(200)
    expect(sql).toHaveBeenCalledTimes(1)

    const { data } = await response.json()
    expect(data).toEqual({
      id: 7,
      username: 'ada',
      bio: 'Solidity and Soroban contracts.',
      skills: ['rust', 'soroban'],
      userType: 'freelancer',
      walletAddress: 'GABC123',
      availability: { status: 'available', activeEngagements: 0 },
      ratings: { average: 4.25, reviewCount: 4, storedRating: 4.5 },
      stats: { completedContracts: 9, completedJobs: 12 },
      memberSince: '2026-01-05T10:00:00.000Z',
    })
  })

  it('never leaks sensitive columns even when the row carries them', async () => {
    queueSql(
      profileRow({
        email: 'ada@example.com',
        password_hash: 'argon2-hash',
        last_login_at: '2026-07-20T00:00:00Z',
      }),
    )

    const response = await getProfile(makeRequest(), routeContext('7'))
    const body = await response.text()

    expect(body).not.toContain('ada@example.com')
    expect(body).not.toContain('argon2-hash')
    expect(body).not.toContain('last_login_at')
  })

  it('reports busy when the freelancer has active engagements', async () => {
    queueSql(profileRow({ active_engagements: 2 }))

    const response = await getProfile(makeRequest(), routeContext('7'))
    const { data } = await response.json()
    expect(data.availability).toEqual({ status: 'busy', activeEngagements: 2 })
  })

  it('reports a null average rating when there are no reviews', async () => {
    queueSql(profileRow({ review_count: 0, average_rating: null }))

    const response = await getProfile(makeRequest(), routeContext('7'))
    const { data } = await response.json()
    expect(data.ratings).toEqual({ average: null, reviewCount: 0, storedRating: 4.5 })
  })

  it('returns 404 for an unknown or client-only account', async () => {
    queueSql([])

    const response = await getProfile(makeRequest(), routeContext('7'))
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('FREELANCER_NOT_FOUND')
  })

  it('returns 503 when the query fails', async () => {
    ;(sql as unknown as SqlMock).mockRejectedValueOnce(new Error('connection lost'))

    const response = await getProfile(makeRequest(), routeContext('7'))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('PROFILE_UNAVAILABLE')
  })

  it('is cacheable at the edge', async () => {
    queueSql(profileRow())

    const response = await getProfile(makeRequest(), routeContext('7'))
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300',
    )
  })

  it('passes a rate-limit rejection straight through', async () => {
    ;(enforceRateLimit as unknown as SqlMock).mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 }),
    )

    const response = await getProfile(makeRequest(), routeContext('7'))
    expect(response.status).toBe(429)
    expect(sql).not.toHaveBeenCalled()
  })
})

describe('GET /api/public/freelancers/[id]/contracts', () => {
  const contractRow = {
    id: 31,
    job_id: 12,
    job_title: 'Escrow audit',
    total_amount: '1500.000000',
    currency: 'XLM',
    contract_address: 'CDEF456',
    contract_tx_hash: 'abc123',
    completed_at: new Date('2026-06-01T12:00:00.000Z'),
    created_at: new Date('2026-05-01T12:00:00.000Z'),
    total_count: '3',
  }

  it('returns completed contracts with pagination meta', async () => {
    queueSql([{ '?column?': 1 }], [contractRow])

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts?page=1&limit=1'),
      routeContext('7'),
    )
    expect(response.status).toBe(200)

    const { data, meta } = await response.json()
    expect(data).toEqual([
      {
        id: 31,
        jobId: 12,
        jobTitle: 'Escrow audit',
        totalAmount: '1500.000000',
        currency: 'XLM',
        contractAddress: 'CDEF456',
        contractTxHash: 'abc123',
        completedAt: '2026-06-01T12:00:00.000Z',
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    ])
    expect(meta).toEqual({
      page: 1,
      limit: 1,
      totalCount: 3,
      totalPages: 3,
      hasNextPage: true,
    })
  })

  it('withholds contract terms and the client identity', async () => {
    queueSql(
      [{ '?column?': 1 }],
      [{ ...contractRow, terms: 'Confidential retainer terms', client_id: 99 }],
    )

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts'),
      routeContext('7'),
    )
    const body = await response.text()

    expect(body).not.toContain('Confidential retainer terms')
    expect(body).not.toContain('client')
  })

  it('returns an empty page with zero totals', async () => {
    queueSql([{ '?column?': 1 }], [])

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts?page=4'),
      routeContext('7'),
    )
    const { data, meta } = await response.json()

    expect(data).toEqual([])
    expect(meta).toEqual({
      page: 4,
      limit: 20,
      totalCount: 0,
      totalPages: 0,
      hasNextPage: false,
    })
  })

  it('returns 404 without running the list query when the freelancer is unknown', async () => {
    queueSql([])

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts'),
      routeContext('7'),
    )
    expect(response.status).toBe(404)
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('rejects a bad page before touching the database', async () => {
    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts?page=0'),
      routeContext('7'),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_PAGINATION')
    expect(sql).not.toHaveBeenCalled()
  })

  it('returns 503 when the list query fails', async () => {
    queueSql([{ '?column?': 1 }])
    ;(sql as unknown as SqlMock).mockRejectedValueOnce(new Error('timeout'))

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts'),
      routeContext('7'),
    )
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('CONTRACTS_UNAVAILABLE')
  })
})

describe('GET /api/public/freelancers/[id]/reviews', () => {
  const reviewRow = {
    id: 5,
    contract_id: 31,
    rating: 5,
    comment: 'Shipped early.',
    verified: true,
    reviewer_username: 'grace',
    created_at: new Date('2026-06-02T09:00:00.000Z'),
    total_count: '2',
    average_rating: '4.5000',
    verified_count: '1',
  }

  it('returns reviews with a summary computed over the full set', async () => {
    queueSql([{ '?column?': 1 }], [reviewRow])

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews?limit=1'),
      routeContext('7'),
    )
    expect(response.status).toBe(200)

    const { data, meta } = await response.json()
    expect(data).toEqual([
      {
        id: 5,
        contractId: 31,
        rating: 5,
        comment: 'Shipped early.',
        verified: true,
        reviewer: { username: 'grace' },
        createdAt: '2026-06-02T09:00:00.000Z',
      },
    ])
    // totalCount is 2 while the page holds 1 — the window aggregates cover the
    // whole filtered set, not the page.
    expect(meta.totalCount).toBe(2)
    expect(meta.summary).toEqual({ averageRating: 4.5, verifiedCount: 1 })
    expect(meta.filters).toEqual({ verified: null })
  })

  it('exposes the reviewer username but not their id', async () => {
    queueSql([{ '?column?': 1 }], [{ ...reviewRow, reviewer_id: 4242 }])

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews'),
      routeContext('7'),
    )
    const body = await response.text()

    expect(body).toContain('grace')
    expect(body).not.toContain('4242')
  })

  it('records the verified filter in meta', async () => {
    queueSql([{ '?column?': 1 }], [reviewRow])

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews?verified=true'),
      routeContext('7'),
    )
    const { meta } = await response.json()
    expect(meta.filters).toEqual({ verified: true })
  })

  it('rejects a non-boolean verified filter', async () => {
    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews?verified=maybe'),
      routeContext('7'),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_VERIFIED_FILTER')
    expect(sql).not.toHaveBeenCalled()
  })

  it('summarises an empty result as null, not zero', async () => {
    queueSql([{ '?column?': 1 }], [])

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews'),
      routeContext('7'),
    )
    const { meta } = await response.json()
    expect(meta.summary).toEqual({ averageRating: null, verifiedCount: 0 })
  })

  it('returns 404 for an unknown freelancer', async () => {
    queueSql([])

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews'),
      routeContext('7'),
    )
    expect(response.status).toBe(404)
  })
})

describe('GET /api/public/freelancers/[id]/reputation', () => {
  const sourceRow = [
    {
      completed_contracts: 9,
      review_count: 4,
      verified_review_count: 3,
      average_rating: '4.2500',
    },
  ]

  it('blends delivery metrics with client reviews', async () => {
    queueSql([{ '?column?': 1 }], sourceRow)

    const response = await getReputation(makeRequest(), routeContext('7'))
    expect(response.status).toBe(200)

    const { data } = await response.json()
    // 0.3*0.9 + 0.25*0.8 + 0.2*0.9 + 0.25*0.8125 = 0.853125 → 85.3
    expect(data.score).toBe(85.3)
    expect(data.freelancerId).toBe(7)
    expect(data.sources).toEqual({
      completedContracts: 9,
      reviewCount: 4,
      verifiedReviewCount: 3,
      averageRating: 4.25,
      metrics: baseMetrics,
    })
    expect(data.computedAt).toBe('2026-07-26T00:00:00.000Z')
  })

  it('scores on delivery history alone when there are no reviews', async () => {
    queueSql(
      [{ '?column?': 1 }],
      [{ completed_contracts: 9, review_count: 0, verified_review_count: 0, average_rating: null }],
    )

    const response = await getReputation(makeRequest(), routeContext('7'))
    const { data } = await response.json()

    const clientRating = data.components.find(
      (c: { key: ReputationComponentKey }) => c.key === 'clientRating',
    )
    expect(clientRating).toEqual({
      key: 'clientRating',
      value: null,
      weight: 0.25,
      appliedWeight: 0,
    })
    // Remaining 0.75 of weight is redistributed:
    // (0.3*0.9 + 0.25*0.8 + 0.2*0.9) / 0.75 = 0.8666… → 86.7
    expect(data.score).toBe(86.7)
  })

  it('returns 503 when reputation cannot be computed', async () => {
    queueSql([{ '?column?': 1 }])
    ;(getFreelancerReputation as unknown as SqlMock).mockRejectedValueOnce(
      new Error('snapshot missing'),
    )
    ;(sql as unknown as SqlMock).mockResolvedValueOnce(sourceRow)

    const response = await getReputation(makeRequest(), routeContext('7'))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('REPUTATION_UNAVAILABLE')
  })

  it('returns 404 for an unknown freelancer', async () => {
    queueSql([])

    const response = await getReputation(makeRequest(), routeContext('7'))
    expect(response.status).toBe(404)
    expect(getFreelancerReputation).not.toHaveBeenCalled()
  })
})

describe('sensitive field guard', () => {
  /**
   * Every sensitive column, injected into each endpoint's rows with a
   * recognisable value. Because the handlers copy fields explicitly rather than
   * spreading rows, none of these may reach the response — this test fails if a
   * future change starts spreading a row.
   */
  const contamination = {
    email: 'leak-email@example.com',
    password_hash: 'leak-password-hash',
    terms: 'leak-contract-terms',
    client_id: 987654,
    escrow_contract_id: 'leak-escrow-id',
    reviewer_id: 4242,
  }

  const columnNames = SENSITIVE_FIELDS.map((field) => field.split('.')[1])

  function expectClean(body: string) {
    for (const value of Object.values(contamination)) {
      expect(body).not.toContain(String(value))
    }
    for (const column of columnNames) {
      expect(body).not.toContain(column)
    }
  }

  it('keeps sensitive columns out of the profile response', async () => {
    queueSql(profileRow(contamination))

    const response = await getProfile(makeRequest(), routeContext('7'))
    expectClean(await response.text())
  })

  it('keeps sensitive columns out of the contracts response', async () => {
    queueSql(
      [{ '?column?': 1 }],
      [
        {
          id: 31,
          job_id: 12,
          job_title: 'Escrow audit',
          total_amount: '1500.000000',
          currency: 'XLM',
          contract_address: 'CDEF456',
          contract_tx_hash: 'abc123',
          completed_at: new Date('2026-06-01T12:00:00.000Z'),
          created_at: new Date('2026-05-01T12:00:00.000Z'),
          total_count: '1',
          ...contamination,
        },
      ],
    )

    const response = await getContracts(
      makeRequest('http://localhost/api/public/freelancers/7/contracts'),
      routeContext('7'),
    )
    expectClean(await response.text())
  })

  it('keeps sensitive columns out of the reviews response', async () => {
    queueSql(
      [{ '?column?': 1 }],
      [
        {
          id: 5,
          contract_id: 31,
          rating: 5,
          comment: 'Shipped early.',
          verified: true,
          reviewer_username: 'grace',
          created_at: new Date('2026-06-02T09:00:00.000Z'),
          total_count: '1',
          average_rating: '5.0000',
          verified_count: '1',
          ...contamination,
        },
      ],
    )

    const response = await getReviews(
      makeRequest('http://localhost/api/public/freelancers/7/reviews'),
      routeContext('7'),
    )
    expectClean(await response.text())
  })
})

describe('computeReputationScore', () => {
  const emptyMetrics = {
    ...baseMetrics,
    completionRate: null,
    disputeRate: null,
    onTimeDeliveryPct: null,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsWithDispute: 0,
    completedWithDeadline: 0,
    onTimeDeliveries: 0,
  }

  it('returns a null score with no signal at all', () => {
    const { score, components } = computeReputationScore({
      metrics: emptyMetrics,
      averageRating: null,
      reviewCount: 0,
    })

    expect(score).toBeNull()
    expect(components.every((c) => c.value === null && c.appliedWeight === 0)).toBe(true)
  })

  it('scores on reviews alone when there is no job history', () => {
    const { score, components } = computeReputationScore({
      metrics: emptyMetrics,
      averageRating: 5,
      reviewCount: 3,
    })

    // Sole available component absorbs the full weight.
    expect(score).toBe(100)
    expect(components.find((c) => c.key === 'clientRating')?.appliedWeight).toBe(1)
  })

  it('maps the 1-5 review scale onto 0-1', () => {
    const { components } = computeReputationScore({
      metrics: emptyMetrics,
      averageRating: 3,
      reviewCount: 1,
    })

    expect(components.find((c) => c.key === 'clientRating')?.value).toBe(0.5)
  })

  it('turns the dispute rate into a dispute-free component', () => {
    const { components } = computeReputationScore({
      metrics: { ...emptyMetrics, disputeRate: 0.25 },
      averageRating: null,
      reviewCount: 0,
    })

    expect(components.find((c) => c.key === 'disputeFree')?.value).toBe(0.75)
  })

  it('clamps out-of-range inputs instead of producing a score above 100', () => {
    const { score } = computeReputationScore({
      metrics: { ...emptyMetrics, completionRate: 1.4 },
      averageRating: null,
      reviewCount: 0,
    })

    expect(score).toBe(100)
  })
})

describe('parameter parsing', () => {
  it('accepts a plain positive integer id', () => {
    expect(parseFreelancerId('42')).toBe(42)
  })

  it.each(['0', '-1', '1.5', '4abc', ' ', '', '007', '+7'])(
    'rejects id %j',
    (raw) => {
      expect(parseFreelancerId(raw)).toBeNull()
    },
  )

  it('defaults pagination when absent', () => {
    expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, limit: 20 })
  })

  it('caps limit at the ceiling instead of erroring', () => {
    expect(parsePagination(new URLSearchParams('limit=5000')).limit).toBe(
      PUBLIC_MAX_LIMIT,
    )
  })

  it.each(['page=0', 'limit=0', 'page=-2', 'limit=abc'])(
    'rejects %s',
    (query) => {
      expect(() => parsePagination(new URLSearchParams(query))).toThrow(
        PublicProfileError,
      )
    },
  )

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['TRUE', true],
  ])('parses verified=%s', (raw, expected) => {
    expect(parseVerifiedFilter(new URLSearchParams(`verified=${raw}`))).toBe(expected)
  })

  it('treats an absent verified filter as no filter', () => {
    expect(parseVerifiedFilter(new URLSearchParams())).toBeNull()
  })
})
