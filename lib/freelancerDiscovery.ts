/**
 * Freelancer Discovery API helper.
 *
 * Encapsulates the SQL query logic, pagination math, sort/filter validation,
 * and DB row → API response mapping used by:
 *   - GET /api/freelancers  (list with search, filter, sort, paginate)
 *   - GET /api/freelancers/[id]  (detail by id)
 *
 * The data source is the `users` table (filtered to freelancer-or-both roles).
 * Performance-critical search ranking on the `skills` column is supported by
 * a GIN index added in `scripts/010-freelancer-discovery-indexes.sql`.
 */

import { sql } from '@/lib/db'

/** Fields that can be used as sort keys. Whitelisted to prevent SQL injection. */
export const FREELANCER_SORTABLE_FIELDS = [
  'rating',
  'total_jobs_completed',
  'created_at',
  'username',
] as const

export type FreelancerSortField = (typeof FREELANCER_SORTABLE_FIELDS)[number]

export const FREELANCER_SORT_ORDERS = ['asc', 'desc'] as const
export type FreelancerSortOrder = (typeof FREELANCER_SORT_ORDERS)[number]

/** Allowed range for the minimum rating filter. */
export const FREELANCER_MIN_RATING = 1
export const FREELANCER_MAX_RATING = 5

/** Pagination bounds. `limit` is clamped to keep responses reasonable. */
export const FREELANCER_DEFAULT_LIMIT = 6
export const FREELANCER_MAX_LIMIT = 50
export const FREELANCER_DEFAULT_PAGE = 1

export interface FreelancerListing {
  id: number
  /** Display name. Matches the `name` field consumed by `app/freelancers/page.tsx`. */
  name: string
  title: string
  bio: string
  skills: string[]
  rating: number
  profileImage: string
  completedProjects: number
  /** Default 0 — the `users` table does not store a rate yet. */
  hourlyRate: number
  /** Default '' — the `users` table does not store a location yet. */
  location: string
  walletAddress: string
  userType: string
  createdAt: string
}

export interface ListFreelancersParams {
  /** Free-text query that matches username, bio, or any skill (case-insensitive). */
  query: string
  /** Required skills (a freelancer must have *all* of them). Empty = no filter. */
  skills: string[]
  /** Minimum rating in the inclusive range [1, 5]. Null = no filter. */
  minRating: number | null
  /** 1-based page number. */
  page: number
  /** Items per page (1..FREELANCER_MAX_LIMIT). */
  limit: number
  /** Sort column. */
  sort: FreelancerSortField
  /** Sort direction. */
  order: FreelancerSortOrder
}

export interface ListFreelancersResult {
  freelancers: FreelancerListing[]
  totalItems: number
}

export interface FreelancerListResponse {
  freelancers: FreelancerListing[]
  skills: string[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export class FreelancerDiscoveryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FreelancerDiscoveryError'
  }
}

interface UserRow {
  id: number
  wallet_address: string
  username: string
  email: string | null
  user_type: string
  bio: string | null
  skills: string[] | null
  rating: number | string | null
  total_jobs_completed: number | null
  created_at: Date | string
}

interface UserRowWithCount extends UserRow {
  total_count: string | number
}

interface SkillRow {
  skill: string | null
}

const DEFAULT_PROFILE_IMAGE = '/placeholder-user.jpg'
const DEFAULT_TITLE = 'TaskChain Freelancer'

/**
 * Convert a DB row to the API listing shape. Fields the DB doesn't store
 * (hourlyRate, location, profileImage, title) get safe placeholder values so
 * the response is always well-formed.
 */
export function mapUserRowToListing(row: UserRow): FreelancerListing {
  const skills = Array.isArray(row.skills) ? row.skills : []
  const numericRating =
    typeof row.rating === 'number'
      ? row.rating
      : row.rating === null || row.rating === undefined
        ? 0
        : Number(row.rating)

  const rating =
    Number.isFinite(numericRating) &&
    numericRating >= 0 &&
    numericRating <= FREELANCER_MAX_RATING
      ? numericRating
      : 0

  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at

  return {
    id: row.id,
    name: row.username,
    title: DEFAULT_TITLE,
    bio: row.bio ?? '',
    skills,
    rating,
    profileImage: DEFAULT_PROFILE_IMAGE,
    completedProjects: row.total_jobs_completed ?? 0,
    hourlyRate: 0,
    location: '',
    walletAddress: row.wallet_address,
    userType: row.user_type,
    createdAt,
  }
}

/**
 * Normalize a query string so it is safe to embed inside a Postgres
 * ILIKE pattern. We escape the only meta-characters `\` and `%` (and `_`)
 * which would otherwise let a caller alter the WHERE clause.
 */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Build the WHERE fragment in a SINGLE sql\`\`` call so the test layer
 * (and Postgres query planner) sees a predictable, stable number of
 * round-trips per request. Optional filters are activated via the standard
 * PostgreSQL `NULL/0 = 0 OR <actual condition>` pattern, which lets us
 * parameterise every value (no string interpolation, no concatenation) while
 * keeping the conditional semantics. Each filter that is "disabled" simply
 * resolves to TRUE at the row level and Postgres' planner will short-circuit.
 *
 * Why not compose via `sql\`${a} AND ${b}\``? Every nested template literal
 * is a separate `sql\`\`` invocation that the neon client must track. With
 * a single-template approach below we issue exactly one DB round-trip per
 * query, and mocking/test setup matches reality.
 */
function buildWhereFragment(
  params: ListFreelancersParams,
): ReturnType<typeof sql> {
  const normalizedQuery = params.query.trim()
  const needle = normalizedQuery
    ? `%${escapeIlike(normalizedQuery.toLowerCase())}%`
    : null
  const skillArray = params.skills.length > 0 ? params.skills : []
  const ratingFloor = params.minRating ?? 0

  return sql`
    u.user_type IN ('freelancer', 'both')
    AND (
      ${needle}::text IS NULL
      OR LOWER(u.username) LIKE ${needle} ESCAPE '\\'
      OR LOWER(COALESCE(u.bio, '')) LIKE ${needle} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(u.skills, ARRAY[]::text[])) AS s
        WHERE LOWER(s) LIKE ${needle} ESCAPE '\\'
      )
    )
    AND (
      cardinality(${skillArray}::text[]) = 0
      OR u.skills @> ${skillArray}::text[]
    )
    AND (
      ${ratingFloor}::int = 0
      OR COALESCE(u.rating, 0) >= ${ratingFloor}
    )
  `
}

/**
 * Build a fully-static ORDER BY fragment for the (sort, order) pair. Because
 * `sort` and `order` are pre-validated against a whitelist in `parseSort`
 * and `parseOrder`, we never have to interpolate caller-controlled strings
 * into the SQL identifier position. The switch below is exhaustive on
 * `FreelancerSortField` × `FreelancerSortOrder`; both literal `ASC` / `DESC`
 * and the column identifier are inlined in each branch.
 */
function buildOrderBy(
  sort: FreelancerSortField,
  order: FreelancerSortOrder,
): ReturnType<typeof sql> {
  switch (sort) {
    case 'rating':
      return order === 'asc'
        ? sql`u.rating ASC NULLS LAST, u.id ASC`
        : sql`u.rating DESC NULLS LAST, u.id ASC`
    case 'total_jobs_completed':
      return order === 'asc'
        ? sql`u.total_jobs_completed ASC NULLS LAST, u.id ASC`
        : sql`u.total_jobs_completed DESC NULLS LAST, u.id ASC`
    case 'created_at':
      return order === 'asc'
        ? sql`u.created_at ASC NULLS LAST, u.id ASC`
        : sql`u.created_at DESC NULLS LAST, u.id ASC`
    case 'username':
      return order === 'asc'
        ? sql`u.username ASC, u.id ASC`
        : sql`u.username DESC, u.id ASC`
  }
}

/**
 * Lists freelancers using a single round-trip per page (a combined data +
 * COUNT(*) OVER() query), so we get rows + total count in one shot. When the
 * main query returns zero rows (e.g. requesting a page past the end) we fall
 * back to a dedicated COUNT query so the pagination metadata stays accurate.
 */
export async function listFreelancers(
  params: ListFreelancersParams,
): Promise<ListFreelancersResult> {
  const where = buildWhereFragment(params)
  const orderBy = buildOrderBy(params.sort, params.order)
  const offset = (params.page - 1) * params.limit

  const rows = (await sql`
    SELECT
      u.id,
      u.wallet_address,
      u.username,
      u.email,
      u.user_type,
      u.bio,
      u.skills,
      u.rating,
      u.total_jobs_completed,
      u.created_at,
      COUNT(*) OVER() AS total_count
    FROM users u
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${params.limit}
    OFFSET ${offset}
  `) as UserRowWithCount[]

  let totalItems: number
  if (rows.length > 0) {
    const raw = rows[0].total_count
    totalItems =
      typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0
  } else {
    totalItems = await countFreelancers(params)
  }

  const freelancers: FreelancerListing[] = rows.map((row) => {
    const { total_count: _ignored, ...rest } = row as UserRowWithCount
    return mapUserRowToListing(rest as UserRow)
  })

  return { freelancers, totalItems }
}

async function countFreelancers(params: ListFreelancersParams): Promise<number> {
  const where = buildWhereFragment(params)
  const rows = (await sql`
    SELECT COUNT(*) AS count FROM users u WHERE ${where}
  `) as Array<{ count: string | number }>
  const value = rows[0]?.count ?? 0
  return typeof value === 'number' ? value : parseInt(String(value), 10) || 0
}

/** Returns the distinct skills currently held by any freelancer-or-both user. */
export async function getAvailableSkills(): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT skill
    FROM users u, unnest(COALESCE(u.skills, ARRAY[]::text[])) AS skill
    WHERE u.user_type IN ('freelancer', 'both')
    ORDER BY skill ASC
  `) as SkillRow[]
  return rows
    .map((row) => row.skill)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
}

/** Fetches a single freelancer (by id) for the detail endpoint. */
export async function getFreelancerById(
  id: number,
): Promise<FreelancerListing | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const rows = (await sql`
    SELECT
      u.id,
      u.wallet_address,
      u.username,
      u.email,
      u.user_type,
      u.bio,
      u.skills,
      u.rating,
      u.total_jobs_completed,
      u.created_at
    FROM users u
    WHERE u.id = ${id} AND u.user_type IN ('freelancer', 'both')
    LIMIT 1
  `) as UserRow[]
  const row = rows[0]
  return row ? mapUserRowToListing(row) : null
}

// ---------- Query parameter parsing & validation ---------------------------

function parseInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

function parseOptionalRating(value: string | null): number | null {
  if (value === null || value === '') return null
  const parsed = Number.parseInt(value, 10)
  if (
    Number.isInteger(parsed) &&
    parsed >= FREELANCER_MIN_RATING &&
    parsed <= FREELANCER_MAX_RATING
  ) {
    return parsed
  }
  throw new FreelancerDiscoveryError(
    'INVALID_MIN_RATING',
    `minRating must be an integer between ${FREELANCER_MIN_RATING} and ${FREELANCER_MAX_RATING}`,
  )
}

function parseSort(value: string | null): FreelancerSortField {
  const candidate = value ?? 'rating'
  if ((FREELANCER_SORTABLE_FIELDS as readonly string[]).includes(candidate)) {
    return candidate as FreelancerSortField
  }
  throw new FreelancerDiscoveryError(
    'INVALID_SORT_FIELD',
    `sort must be one of: ${FREELANCER_SORTABLE_FIELDS.join(', ')}`,
  )
}

function parseOrder(value: string | null): FreelancerSortOrder {
  const candidate = (value ?? 'desc').toLowerCase()
  if ((FREELANCER_SORT_ORDERS as readonly string[]).includes(candidate)) {
    return candidate as FreelancerSortOrder
  }
  throw new FreelancerDiscoveryError(
    'INVALID_SORT_ORDER',
    `order must be one of: ${FREELANCER_SORT_ORDERS.join(', ')}`,
  )
}

function parseLimit(value: string | null): number {
  const parsed = parseInteger(value, FREELANCER_DEFAULT_LIMIT)
  if (parsed < 1) {
    throw new FreelancerDiscoveryError(
      'INVALID_LIMIT',
      'limit must be greater than or equal to 1',
    )
  }
  return Math.min(parsed, FREELANCER_MAX_LIMIT)
}

function parsePage(value: string | null): number {
  const parsed = parseInteger(value, FREELANCER_DEFAULT_PAGE)
  if (parsed < 1) {
    throw new FreelancerDiscoveryError(
      'INVALID_PAGE',
      'page must be greater than or equal to 1',
    )
  }
  return parsed
}

function parseSkills(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of raw) {
    for (const skill of chunk.split(',')) {
      const trimmed = skill.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out
}

/**
 * Parses and validates the search-parameters from the request URL.
 * Accepts legacy `?rating=` as a synonym for `?minRating=` so the existing
 * `/freelancers` frontend keeps working.
 */
export function parseDiscoveryParams(
  searchParams: URLSearchParams,
): ListFreelancersParams {
  const query = (searchParams.get('q') ?? searchParams.get('query') ?? '').trim()
  const skills = parseSkills(searchParams.getAll('skills'))
  const minRating = parseOptionalRating(
    searchParams.get('minRating') ?? searchParams.get('rating'),
  )
  const sort = parseSort(searchParams.get('sort'))
  const order = parseOrder(searchParams.get('order'))
  const limit = parseLimit(searchParams.get('limit'))
  const page = parsePage(searchParams.get('page'))

  return { query, skills, minRating, sort, order, limit, page }
}

/**
 * Builds the JSON response shape used by GET /api/freelancers, computing
 * pagination metadata (e.g. clamping page to totalPages) so the UI gets
 * accurate counts even when callers request pages past the end. We sequence
 * the list and skills queries (instead of `Promise.all`) so that a failure on
 * the main list call short-circuits cleanly with the 503 handler.
 */
export async function buildListResponse(
  params: ListFreelancersParams,
): Promise<FreelancerListResponse> {
  const result = await listFreelancers(params)
  const skills = await getAvailableSkills()

  const totalItems = result.totalItems
  const pageSize = result.freelancers.length
  const totalPages = Math.max(1, Math.ceil(totalItems / params.limit))
  const currentPage = Math.min(params.page, totalPages)

  return {
    freelancers: result.freelancers,
    skills,
    pagination: {
      page: currentPage === 0 ? 1 : currentPage,
      pageSize,
      totalItems,
      totalPages,
    },
  }
}
