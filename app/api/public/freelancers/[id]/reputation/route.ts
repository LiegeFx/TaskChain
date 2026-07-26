import { NextRequest } from 'next/server'

import {
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_LIMIT_WINDOW_MS,
  freelancerNotFound,
  getPublicReputation,
  parseFreelancerId,
  publicError,
  publicJson,
  publicFreelancerExists,
} from '@/lib/publicFreelancerProfile'
import { buildRateLimitKey, enforceRateLimit } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/public/freelancers/[id]/reputation
 *
 * Aggregated reputation: a 0–100 score blended from completed contracts,
 * client reviews and delivery metrics, plus the per-component breakdown and the
 * raw inputs behind it. Delivery metrics come from the pre-aggregated
 * `freelancer_reputation` snapshot (refreshed at most once per five minutes),
 * so this stays cheap under load.
 *
 * Responses:
 *   200 { data }
 *   400 INVALID_FREELANCER_ID
 *   404 FREELANCER_NOT_FOUND
 *   429 RATE_LIMITED
 *   503 REPUTATION_UNAVAILABLE
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, 'public:freelancers:reputation'),
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

  try {
    if (!(await publicFreelancerExists(freelancerId))) return freelancerNotFound()

    const reputation = await getPublicReputation(freelancerId)
    return publicJson(reputation)
  } catch (error) {
    console.error(`[GET /api/public/freelancers/${freelancerId}/reputation]`, error)
    return publicError(503, 'REPUTATION_UNAVAILABLE', 'Unable to load reputation')
  }
}
