import { NextRequest } from 'next/server'

import {
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_LIMIT_WINDOW_MS,
  freelancerNotFound,
  getPublicProfile,
  parseFreelancerId,
  publicError,
  publicJson,
} from '@/lib/publicFreelancerProfile'
import { buildRateLimitKey, enforceRateLimit } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/public/freelancers/[id]
 *
 * Public, unauthenticated freelancer profile: identity, bio, skills, derived
 * availability, rating summary and work-history counts. Sensitive columns are
 * never selected — see `SENSITIVE_FIELDS` in `lib/publicFreelancerProfile.ts`.
 *
 * Responses:
 *   200 { data }
 *   400 INVALID_FREELANCER_ID
 *   404 FREELANCER_NOT_FOUND     (unknown id, or a client-only account)
 *   429 RATE_LIMITED
 *   503 PROFILE_UNAVAILABLE
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, 'public:freelancers:profile'),
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
    const profile = await getPublicProfile(freelancerId)
    if (!profile) return freelancerNotFound()
    return publicJson(profile)
  } catch (error) {
    console.error(`[GET /api/public/freelancers/${freelancerId}]`, error)
    return publicError(503, 'PROFILE_UNAVAILABLE', 'Unable to load profile')
  }
}
