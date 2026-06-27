import { NextRequest, NextResponse } from 'next/server'

import { getFreelancerById } from '@/lib/freelancerDiscovery'
import { getFreelancerReputation, userExists } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/freelancers/[id]
 *
 * Returns a detailed freelancer profile by numeric id.
 * The response includes a nested `reputation` payload when one can be loaded,
 * otherwise `reputation` is null so clients can still render the profile.
 *
 * Responses:
 *   200 { freelancer, reputation }
 *   400 INVALID_ID          (non-numeric or non-positive id)
 *   404 FREELANCER_NOT_FOUND
 *   503 FREELANCER_FETCH_FAILED  (raised when the freelancer query fails)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: rawId } = await context.params
  const id = Number.parseInt(rawId, 10)

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json(
      { error: 'Invalid freelancer id', code: 'INVALID_ID' },
      { status: 400 },
    )
  }

  try {
    const freelancer = await getFreelancerById(id)
    if (!freelancer) {
      return NextResponse.json(
        { error: 'Freelancer not found', code: 'FREELANCER_NOT_FOUND' },
        { status: 404 },
      )
    }

    let reputation: unknown = null
    try {
      const exists = await userExists(id)
      if (exists) {
        reputation = await getFreelancerReputation(id)
      }
    } catch (error) {
      console.error(`Failed to load reputation for freelancer ${id}:`, error)
      reputation = null
    }

    return NextResponse.json(
      { freelancer, reputation },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    console.error(`Failed to load freelancer ${id}:`, error)
    return NextResponse.json(
      { error: 'Unable to load freelancer', code: 'FREELANCER_FETCH_FAILED' },
      { status: 503 },
    )
  }
}
