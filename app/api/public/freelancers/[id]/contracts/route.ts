import { NextRequest } from 'next/server'

import {
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_LIMIT_WINDOW_MS,
  PublicProfileError,
  buildPaginationMeta,
  freelancerNotFound,
  listCompletedContracts,
  parseFreelancerId,
  parsePagination,
  publicError,
  publicJson,
  publicProfileErrorResponse,
  publicFreelancerExists,
} from '@/lib/publicFreelancerProfile'
import { buildRateLimitKey, enforceRateLimit } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/public/freelancers/[id]/contracts
 *
 * Paginated list of contracts the freelancer completed, newest first. Contract
 * `terms` and the client's identity are withheld; the on-chain address and
 * deployment tx hash are included so consumers can verify the work themselves.
 *
 * Query: `?page=1&limit=20` (limit capped at 100).
 *
 * Responses:
 *   200 { data, meta }
 *   400 INVALID_FREELANCER_ID | INVALID_PAGINATION
 *   404 FREELANCER_NOT_FOUND
 *   429 RATE_LIMITED
 *   503 CONTRACTS_UNAVAILABLE
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, 'public:freelancers:contracts'),
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
  try {
    pagination = parsePagination(request.nextUrl.searchParams)
  } catch (error) {
    if (error instanceof PublicProfileError) return publicProfileErrorResponse(error)
    throw error
  }

  try {
    if (!(await publicFreelancerExists(freelancerId))) return freelancerNotFound()

    const { items, totalCount } = await listCompletedContracts(freelancerId, pagination)
    return publicJson(items, buildPaginationMeta(pagination, totalCount))
  } catch (error) {
    console.error(`[GET /api/public/freelancers/${freelancerId}/contracts]`, error)
    return publicError(
      503,
      'CONTRACTS_UNAVAILABLE',
      'Unable to load completed contracts',
    )
  }
}
