import { NextRequest, NextResponse } from 'next/server'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'
import {
  stellarTransactionHistoryService,
  type TransactionHistoryResult,
} from '@/lib/stellar/transaction-history'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

function parsePagination(searchParams: URLSearchParams): {
  limit: number
  cursor?: string
} {
  const limitRaw = searchParams.get('limit')
  const cursor = searchParams.get('cursor') || undefined

  let limit = 20
  if (limitRaw) {
    const parsed = parseInt(limitRaw, 10)
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
      limit = parsed
    }
  }

  return { limit, cursor }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const token = readAccessToken(request)
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }

  const payload = verifyAccessToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      { status: 401 }
    )
  }

  try {
    const { id } = await context.params

    const contractId = id

    const { limit, cursor } = parsePagination(
      request.nextUrl.searchParams
    )

    const result: TransactionHistoryResult =
      await stellarTransactionHistoryService.fetchContractTransactions(
        contractId,
        limit,
        cursor
      )

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GET /api/contracts/[id]/transactions]', error)

    const message =
      error instanceof Error ? error.message : 'Failed to fetch transaction history'

    const status = message.includes('not found') ? 404 : 500

    return NextResponse.json(
      {
        error: message,
        code: status === 404 ? 'CONTRACT_NOT_FOUND' : 'FETCH_FAILED',
      },
      { status }
    )
  }
}
