import { NextRequest } from 'next/server'

import {
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_LIMIT_WINDOW_MS,
  PublicProfileError,
  buildPaginationMeta,
  freelancerNotFound,
  listReviews,
  parseFreelancerId,
  parsePagination,
  parseVerifiedFilter,
  publicError,
  publicJson,
  publicProfileErrorResponse,
  publicFreelancerExists,
} from '@/lib/publicFreelancerProfile'
import { buildRateLimitKey, enforceRateLimit } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/public/freelancers/[id]/reviews
 *
 * Paginated client reviews, newest first. Reviewers are identified by public
 * username only. `meta.summary` covers the whole filtered set, not just the
 * current page.
 *
 * Query: `?page=1&limit=20&verified=true` (limit capped at 100).
 *
 * Responses:
 *   200 { data, meta }
 *   400 INVALID_FREELANCER_ID | INVALID_PAGINATION | INVALID_VERIFIED_FILTER
 *   404 FREELANCER_NOT_FOUND
 *   429 RATE_LIMITED
 *   503 REVIEWS_UNAVAILABLE
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, 'public:freelancers:reviews'),
    limit: PUBLIC_RATE_LIMIT,
    windowMs: PUBLIC_RATE_LIMIT_WINDOW_MS,
  })
  if (limited) return limited

  const { id: rawId } = await context.params
  const freelancerId = parseFreelancerId(rawId)
  if (freelancerId === null) {
    return publicError(
      400,
      'INVALID_FREELANCER_ID',
      'Freelancer id must be a positive integer',
    )
  }

  let pagination
  let verified: boolean | null
  try {
    pagination = parsePagination(request.nextUrl.searchParams)
    verified = parseVerifiedFilter(request.nextUrl.searchParams)
  } catch (error) {
    if (error instanceof PublicProfileError) return publicProfileErrorResponse(error)
    throw error
  }

  try {
    if (!(await publicFreelancerExists(freelancerId))) return freelancerNotFound()

    const { items, totalCount, summary } = await listReviews(freelancerId, {
      ...pagination,
      verified,
    })

    return publicJson(items, {
      ...buildPaginationMeta(pagination, totalCount),
      filters: { verified },
      summary,
    })
  } catch (error) {
    console.error(`[GET /api/public/freelancers/${freelancerId}/reviews]`, error)
    return publicError(503, 'REVIEWS_UNAVAILABLE', 'Unable to load reviews')
  }
}
