import { NextRequest, NextResponse } from 'next/server'

import {
  buildListResponse,
  parseDiscoveryParams,
  FreelancerDiscoveryError,
} from '@/lib/freelancerDiscovery'

export const dynamic = 'force-dynamic'

/**
 * GET /api/freelancers
 *
 * Lists freelancers for clients to discover and filter.
 *
 * Query parameters
 *   q        Free-text search across username, bio, and skills
 *   skills   Repeating or comma-separated list (every skill must match)
 *   minRating|rating  Minimum rating (1..5). `rating` is accepted for back-compat
 *   page     1-based page number (default 1)
 *   limit    Page size (1..50, default 6)
 *   sort     One of: rating, total_jobs_completed, created_at, username (default rating)
 *   order    asc | desc (default desc)
 *
 * Response: { freelancers, skills, pagination }
 *   - `pagination` carries page, pageSize, totalItems, totalPages so the UI can
 *     render accurate counts even when callers request a page past the end.
 */
export async function GET(request: NextRequest) {
  try {
    const params = parseDiscoveryParams(request.nextUrl.searchParams)
    const payload = await buildListResponse(params)
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    if (error instanceof FreelancerDiscoveryError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      )
    }
    console.error('Failed to list freelancers:', error)
    return NextResponse.json(
      { error: 'Unable to load freelancers', code: 'FREELANCER_LIST_FAILED' },
      { status: 503 },
    )
  }
}
