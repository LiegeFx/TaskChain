import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { globalSearch, SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX } from '@/lib/search'

const QuerySchema = z.object({
  q:     z.string().min(1).max(200).trim(),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
})

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl
  const parsed = QuerySchema.safeParse({
    q:     searchParams.get('q') ?? '',
    limit: searchParams.get('limit') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const payload = await globalSearch(parsed.data.q, parsed.data.limit)
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('[GET /api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
})
