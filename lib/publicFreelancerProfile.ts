/**
 * Public Freelancer Profile API helper.
 *
 * Backs the read-only, unauthenticated endpoints under `/api/public/freelancers/[id]`:
 *   - GET /api/public/freelancers/[id]              → profile
 *   - GET /api/public/freelancers/[id]/contracts    → completed contracts
 *   - GET /api/public/freelancers/[id]/reviews      → client reviews
 *   - GET /api/public/freelancers/[id]/reputation   → aggregated reputation score
 *
 * Design rules for everything in this module:
 *
 *  1. **Public data only.** Rows are never spread into responses. Every field is
 *     copied explicitly by a `map*` function, so a column added to `users`,
 *     `contracts`, or `reviews` later cannot leak by accident. See
 *     `SENSITIVE_FIELDS` for what is deliberately withheld.
 *  2. **One round-trip per endpoint.** Aggregates ride along as scalar
 *     sub-selects, and list endpoints get their total via `COUNT(*) OVER()`
 *     (window functions run before `LIMIT`, so the count covers the whole
 *     filtered set, not just the page).
 *  3. **Consistent envelope.** Every response is `{ data, meta }` and every
 *     error is `{ error, code }` — see `publicJson` / `publicError`.
 *
 * Supporting indexes live in `scripts/011-public-profile-indexes.sql`.
 */

import { NextResponse } from 'next/server'

import { sql } from '@/lib/db'
import { getFreelancerReputation, type ReputationMetrics } from '@/lib/reputation'

/**
 * Columns that exist on the underlying tables and are intentionally *not*
 * exposed by these endpoints. Kept as a list so the docs and the code cannot
 * drift apart.
 *
 *   users.email              — contact detail, private
 *   contracts.terms          — private agreement between client and freelancer
 *   contracts.client_id      — the client never opted into a public listing
 *   jobs.escrow_contract_id  — escrow wiring, not profile data
 *   reviews.reviewer_id      — replaced by the reviewer's public username
 */
export const SENSITIVE_FIELDS = [
  'users.email',
  'contracts.terms',
  'contracts.client_id',
  'jobs.escrow_contract_id',
  'reviews.reviewer_id',
] as const

/** `Cache-Control` used by every public profile endpoint. */
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

/** Requests per minute allowed per IP, per endpoint. */
export const PUBLIC_RATE_LIMIT = 120
export const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000

export const PUBLIC_DEFAULT_PAGE = 1
export const PUBLIC_DEFAULT_LIMIT = 20
export const PUBLIC_MAX_LIMIT = 100

/**
 * Job states that mean the freelancer is currently engaged. Used to derive
 * `availability`, which the `users` table does not store.
 */
export const ACTIVE_JOB_STATUSES = ['assigned', 'in_progress', 'in_review'] as const

/** Contract state that qualifies a contract as publicly listable work history. */
export const COMPLETED_CONTRACT_STATUS = 'completed'

// ---------- Public response types ------------------------------------------

export type AvailabilityStatus = 'available' | 'busy'

export interface PublicFreelancerProfile {
  id: number
  username: string
  bio: string | null
  skills: string[]
  /** `'freelancer'` or `'both'` — clients-only accounts are not exposed here. */
  userType: string
  /**
   * Stellar account address. Public by nature (it is the on-chain identity used
   * to verify escrow payments), and already exposed by `GET /api/freelancers`.
   */
  walletAddress: string
  availability: {
    status: AvailabilityStatus
    /** Jobs currently assigned / in progress / in review. */
    activeEngagements: number
  }
  ratings: {
    /** Mean of every review's rating, 1–5, rounded to 2dp. `null` with no reviews. */
    average: number | null
    reviewCount: number
    /** Denormalised `users.rating`, kept for parity with `GET /api/freelancers`. */
    storedRating: number | null
  }
  stats: {
    /** Contracts in `completed` state where this user is the freelancer. */
    completedContracts: number
    /** Denormalised `users.total_jobs_completed`. */
    completedJobs: number
  }
  memberSince: string
}

export interface PublicCompletedContract {
  id: number
  jobId: number
  jobTitle: string
  /** Decimal string — money is never converted to a float. */
  totalAmount: string
  currency: string
  /** Soroban contract address, `null` until the contract is deployed on-chain. */
  contractAddress: string | null
  /** Deployment transaction hash, for independent on-chain verification. */
  contractTxHash: string | null
  /** `jobs.completed_at`, falling back to `contracts.updated_at`. */
  completedAt: string | null
  createdAt: string
}

export interface PublicReview {
  id: number
  contractId: number
  rating: number
  comment: string | null
  /** True when the review was left on a contract that reached `completed`. */
  verified: boolean
  reviewer: {
    username: string
  }
  createdAt: string
}

export interface PublicReviewSummary {
  /** Mean rating across the filtered set, 1–5, rounded to 2dp. */
  averageRating: number | null
  verifiedCount: number
}

export type ReputationComponentKey =
  | 'completion'
  | 'onTime'
  | 'disputeFree'
  | 'clientRating'

export interface ReputationComponent {
  key: ReputationComponentKey
  /** Normalised 0–1 input. `null` when there is no data for this component. */
  value: number | null
  /** Base weight before redistribution. */
  weight: number
  /** Weight actually applied; `0` when `value` is `null`. */
  appliedWeight: number
}

export interface PublicReputation {
  freelancerId: number
  /** Blended 0–100 score, or `null` when the freelancer has no history at all. */
  score: number | null
  components: ReputationComponent[]
  sources: {
    completedContracts: number
    reviewCount: number
    verifiedReviewCount: number
    averageRating: number | null
    metrics: ReputationMetrics
  }
  computedAt: string
}

export interface PaginationMeta {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
}

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
}

/**
 * Base weights for the reputation blend. Components without data are dropped
 * and their weight is redistributed proportionally across the rest, so a
 * freelancer with no reviews is scored on delivery history alone rather than
 * being penalised for a missing signal.
 */
export const REPUTATION_WEIGHTS: Record<ReputationComponentKey, number> = {
  completion: 0.3,
  onTime: 0.25,
  disputeFree: 0.2,
  clientRating: 0.25,
}

export class PublicProfileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message)
    this.name = 'PublicProfileError'
  }
}

// ---------- Row shapes -----------------------------------------------------

interface ProfileRow {
  id: number
  username: string
  bio: string | null
  skills: string[] | null
  user_type: string
  wallet_address: string
  rating: string | number | null
  total_jobs_completed: number | null
  created_at: Date | string
  review_count: number
  average_rating: string | number | null
  active_engagements: number
  completed_contracts: number
}

interface CompletedContractRow {
  id: number
  job_id: number
  job_title: string
  total_amount: string | number
  currency: string
  contract_address: string | null
  contract_tx_hash: string | null
  completed_at: Date | string | null
  created_at: Date | string
  total_count: string | number
}

interface ReviewRow {
  id: number
  contract_id: number
  rating: number
  comment: string | null
  verified: boolean | null
  reviewer_username: string | null
  created_at: Date | string
  total_count: string | number
  average_rating: string | number | null
  verified_count: string | number
}

interface ReputationSourceRow {
  completed_contracts: number
  review_count: number
  verified_review_count: number
  average_rating: string | number | null
}

// ---------- Coercion helpers -----------------------------------------------

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toCount(value: string | number | null | undefined): number {
  const parsed = toNumber(value)
  return parsed === null ? 0 : Math.trunc(parsed)
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  // Postgres `TIMESTAMP` columns come back without a zone over the HTTP driver;
  // parse and re-serialise so every timestamp we emit is unambiguous UTC.
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Clamps a rating to the 1–5 review scale, or returns `null` when unrated. */
function toRating(value: string | number | null | undefined): number | null {
  const parsed = toNumber(value)
  if (parsed === null || parsed <= 0) return null
  return roundTo(Math.min(5, parsed), 2)
}

// ---------- Row → response mapping -----------------------------------------

export function mapProfileRow(row: ProfileRow): PublicFreelancerProfile {
  const activeEngagements = toCount(row.active_engagements)

  return {
    id: row.id,
    username: row.username,
    bio: row.bio ?? null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    userType: row.user_type,
    walletAddress: row.wallet_address,
    availability: {
      status: activeEngagements > 0 ? 'busy' : 'available',
      activeEngagements,
    },
    ratings: {
      average: toRating(row.average_rating),
      reviewCount: toCount(row.review_count),
      storedRating: toRating(row.rating),
    },
    stats: {
      completedContracts: toCount(row.completed_contracts),
      completedJobs: toCount(row.total_jobs_completed),
    },
    memberSince: toIso(row.created_at) ?? '',
  }
}

export function mapCompletedContractRow(
  row: CompletedContractRow,
): PublicCompletedContract {
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.job_title,
    totalAmount: String(row.total_amount),
    currency: row.currency,
    contractAddress: row.contract_address ?? null,
    contractTxHash: row.contract_tx_hash ?? null,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? '',
  }
}

export function mapReviewRow(row: ReviewRow): PublicReview {
  return {
    id: row.id,
    contractId: row.contract_id,
    rating: toCount(row.rating),
    comment: row.comment ?? null,
    verified: row.verified === true,
    reviewer: {
      // A deleted reviewer cascades the review away, so this is defensive only.
      username: row.reviewer_username ?? 'unknown',
    },
    createdAt: toIso(row.created_at) ?? '',
  }
}

// ---------- Query parameter parsing ----------------------------------------

/** Validates a path id. Returns `null` when it is not a usable `users.id`. */
export function parseFreelancerId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null
  // Reject "12abc" / "1.5": parseInt would silently accept the prefix.
  if (String(parsed) !== raw.trim()) return null
  return parsed
}

/**
 * Parses `?page=` and `?limit=`. Out-of-range values are rejected rather than
 * silently clamped so that integrators notice a bad request, except for
 * `limit` above the ceiling, which is capped at `PUBLIC_MAX_LIMIT`.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = parsePositiveInt(searchParams.get('page'), PUBLIC_DEFAULT_PAGE, 'page')
  const limit = parsePositiveInt(searchParams.get('limit'), PUBLIC_DEFAULT_LIMIT, 'limit')
  return { page, limit: Math.min(limit, PUBLIC_MAX_LIMIT) }
}

function parsePositiveInt(raw: string | null, fallback: number, field: string): number {
  if (raw === null || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new PublicProfileError(
      'INVALID_PAGINATION',
      `${field} must be an integer greater than or equal to 1`,
    )
  }
  return parsed
}

/** Parses the `?verified=` review filter. Absent means "no filter". */
export function parseVerifiedFilter(searchParams: URLSearchParams): boolean | null {
  const raw = searchParams.get('verified')
  if (raw === null || raw === '') return null
  const normalized = raw.toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  throw new PublicProfileError(
    'INVALID_VERIFIED_FILTER',
    'verified must be one of: true, false',
  )
}

export function buildPaginationMeta(
  params: PaginationParams,
  totalCount: number,
): PaginationMeta {
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / params.limit)
  return {
    page: params.page,
    limit: params.limit,
    totalCount,
    totalPages,
    hasNextPage: params.page < totalPages,
  }
}

// ---------- Response helpers ------------------------------------------------

/** Wraps a payload in the standard `{ data, meta }` envelope. */
export function publicJson<T>(data: T, meta?: object): NextResponse {
  return NextResponse.json(
    meta === undefined ? { data } : { data, meta },
    { status: 200, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } },
  )
}

/** Wraps an error in the standard `{ error, code }` envelope. Never cached. */
export function publicError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

/** 404 used by every endpoint so a missing and a client-only user look alike. */
export function freelancerNotFound(): NextResponse {
  return publicError(404, 'FREELANCER_NOT_FOUND', 'Freelancer not found')
}

/** Maps a thrown `PublicProfileError` onto the error envelope. */
export function publicProfileErrorResponse(error: PublicProfileError): NextResponse {
  return publicError(error.status, error.code, error.message)
}

// ---------- Queries ---------------------------------------------------------

/**
 * Loads the public profile. Aggregates are scalar sub-selects so the whole
 * profile is one round-trip; each is backed by an index on `freelancer_id`.
 *
 * Returns `null` when the id does not exist *or* belongs to a client-only
 * account — callers must not distinguish the two in their response.
 */
export async function getPublicProfile(
  freelancerId: number,
): Promise<PublicFreelancerProfile | null> {
  const rows = (await sql`
    SELECT
      u.id,
      u.username,
      u.bio,
      u.skills,
      u.user_type,
      u.wallet_address,
      u.rating,
      u.total_jobs_completed,
      u.created_at,
      (
        SELECT COUNT(*)::int
        FROM reviews r
        WHERE r.freelancer_id = u.id
      ) AS review_count,
      (
        SELECT AVG(r.rating)::numeric
        FROM reviews r
        WHERE r.freelancer_id = u.id
      ) AS average_rating,
      (
        SELECT COUNT(*)::int
        FROM jobs j
        WHERE j.freelancer_id = u.id
          AND j.status IN ('assigned', 'in_progress', 'in_review')
      ) AS active_engagements,
      (
        SELECT COUNT(*)::int
        FROM contracts c
        WHERE c.freelancer_id = u.id
          AND c.status = 'completed'
      ) AS completed_contracts
    FROM users u
    WHERE u.id = ${freelancerId}
      AND u.user_type IN ('freelancer', 'both')
    LIMIT 1
  `) as ProfileRow[]

  const row = rows[0]
  return row ? mapProfileRow(row) : null
}

/**
 * Existence check for the sub-resource endpoints, so `/reviews` on an unknown
 * id answers 404 instead of an empty page. Same visibility rule as
 * `getPublicProfile`: client-only accounts are treated as absent.
 */
export async function publicFreelancerExists(freelancerId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT 1
    FROM users u
    WHERE u.id = ${freelancerId}
      AND u.user_type IN ('freelancer', 'both')
    LIMIT 1
  `) as unknown[]
  return rows.length > 0
}

/**
 * Lists completed contracts, newest first. `COUNT(*) OVER()` gives the total in
 * the same round-trip; ordering ties break on `c.id` so paging is stable.
 */
export async function listCompletedContracts(
  freelancerId: number,
  params: PaginationParams,
): Promise<PaginatedResult<PublicCompletedContract>> {
  const offset = (params.page - 1) * params.limit

  const rows = (await sql`
    SELECT
      c.id,
      c.job_id,
      j.title AS job_title,
      c.total_amount,
      c.currency,
      c.contract_address,
      c.contract_tx_hash,
      COALESCE(j.completed_at, c.updated_at) AS completed_at,
      c.created_at,
      COUNT(*) OVER() AS total_count
    FROM contracts c
    JOIN jobs j ON j.id = c.job_id
    WHERE c.freelancer_id = ${freelancerId}
      AND c.status = 'completed'
    ORDER BY COALESCE(j.completed_at, c.updated_at) DESC NULLS LAST, c.id DESC
    LIMIT ${params.limit}
    OFFSET ${offset}
  `) as CompletedContractRow[]

  return {
    items: rows.map(mapCompletedContractRow),
    totalCount: rows.length > 0 ? toCount(rows[0].total_count) : 0,
  }
}

/**
 * Lists reviews, newest first, with the summary computed over the *whole*
 * filtered set: window functions are evaluated before `LIMIT`, so
 * `AVG(...) OVER()` is not the page average.
 *
 * `verified` is applied with the parameterised `NULL`-guard pattern used
 * elsewhere in the repo, keeping this to a single prepared statement.
 */
export async function listReviews(
  freelancerId: number,
  params: PaginationParams & { verified: boolean | null },
): Promise<PaginatedResult<PublicReview> & { summary: PublicReviewSummary }> {
  const offset = (params.page - 1) * params.limit
  const verified = params.verified

  const rows = (await sql`
    SELECT
      rv.id,
      rv.contract_id,
      rv.rating,
      rv.comment,
      rv.verified,
      ru.username AS reviewer_username,
      rv.created_at,
      COUNT(*) OVER() AS total_count,
      (AVG(rv.rating) OVER())::numeric AS average_rating,
      COUNT(*) FILTER (WHERE COALESCE(rv.verified, FALSE)) OVER() AS verified_count
    FROM reviews rv
    LEFT JOIN users ru ON ru.id = rv.reviewer_id
    WHERE rv.freelancer_id = ${freelancerId}
      AND (
        ${verified}::boolean IS NULL
        OR COALESCE(rv.verified, FALSE) = ${verified}::boolean
      )
    ORDER BY rv.created_at DESC, rv.id DESC
    LIMIT ${params.limit}
    OFFSET ${offset}
  `) as ReviewRow[]

  const first = rows[0]

  return {
    items: rows.map(mapReviewRow),
    totalCount: first ? toCount(first.total_count) : 0,
    summary: {
      averageRating: first ? toRating(first.average_rating) : null,
      verifiedCount: first ? toCount(first.verified_count) : 0,
    },
  }
}

/**
 * Blends delivery metrics with client reviews into a single 0–100 score.
 *
 * Components with no data are dropped and their weight is redistributed across
 * the remaining ones, so a freelancer with no reviews yet is scored on delivery
 * history rather than penalised for the gap. `null` when there is no signal at
 * all. `components` is returned so consumers can show the breakdown instead of
 * treating the number as a black box.
 */
export function computeReputationScore(input: {
  metrics: ReputationMetrics
  averageRating: number | null
  reviewCount: number
}): { score: number | null; components: ReputationComponent[] } {
  const { metrics, averageRating, reviewCount } = input

  const rawValues: Record<ReputationComponentKey, number | null> = {
    completion: metrics.completionRate,
    onTime: metrics.onTimeDeliveryPct,
    disputeFree: metrics.disputeRate === null ? null : 1 - metrics.disputeRate,
    // Map the 1–5 review scale onto 0–1.
    clientRating:
      reviewCount > 0 && averageRating !== null ? (averageRating - 1) / 4 : null,
  }

  const keys = Object.keys(REPUTATION_WEIGHTS) as ReputationComponentKey[]
  const availableWeight = keys.reduce(
    (sum, key) => (rawValues[key] === null ? sum : sum + REPUTATION_WEIGHTS[key]),
    0,
  )

  const components: ReputationComponent[] = keys.map((key) => {
    const value = rawValues[key]
    const clamped = value === null ? null : Math.min(1, Math.max(0, value))
    return {
      key,
      value: clamped === null ? null : roundTo(clamped, 4),
      weight: REPUTATION_WEIGHTS[key],
      appliedWeight:
        clamped === null || availableWeight === 0
          ? 0
          : roundTo(REPUTATION_WEIGHTS[key] / availableWeight, 4),
    }
  })

  if (availableWeight === 0) {
    return { score: null, components }
  }

  const weighted = keys.reduce((sum, key) => {
    const value = rawValues[key]
    if (value === null) return sum
    const clamped = Math.min(1, Math.max(0, value))
    return sum + clamped * (REPUTATION_WEIGHTS[key] / availableWeight)
  }, 0)

  return {
    score: roundTo(Math.min(100, Math.max(0, weighted * 100)), 1),
    components,
  }
}

/** Completed-contract and review aggregates, all in one round-trip. */
async function fetchReputationSources(
  freelancerId: number,
): Promise<ReputationSourceRow[]> {
  return (await sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM contracts c
        WHERE c.freelancer_id = ${freelancerId}
          AND c.status = 'completed'
      ) AS completed_contracts,
      (
        SELECT COUNT(*)::int
        FROM reviews r
        WHERE r.freelancer_id = ${freelancerId}
      ) AS review_count,
      (
        SELECT COUNT(*)::int
        FROM reviews r
        WHERE r.freelancer_id = ${freelancerId}
          AND r.verified
      ) AS verified_review_count,
      (
        SELECT AVG(r.rating)::numeric
        FROM reviews r
        WHERE r.freelancer_id = ${freelancerId}
      ) AS average_rating
  `) as ReputationSourceRow[]
}

/**
 * Assembles the public reputation payload: cached delivery metrics from
 * `lib/reputation` plus contract and review aggregates fetched in one query.
 */
export async function getPublicReputation(
  freelancerId: number,
): Promise<PublicReputation> {
  const [reputation, sourceRows] = await Promise.all([
    getFreelancerReputation(freelancerId),
    fetchReputationSources(freelancerId),
  ])

  const sourceRow = sourceRows[0]
  const reviewCount = toCount(sourceRow?.review_count)
  const averageRating = toRating(sourceRow?.average_rating)

  const { score, components } = computeReputationScore({
    metrics: reputation.metrics,
    averageRating,
    reviewCount,
  })

  return {
    freelancerId,
    score,
    components,
    sources: {
      completedContracts: toCount(sourceRow?.completed_contracts),
      reviewCount,
      verifiedReviewCount: toCount(sourceRow?.verified_review_count),
      averageRating,
      metrics: reputation.metrics,
    },
    computedAt: reputation.computedAt,
  }
}
