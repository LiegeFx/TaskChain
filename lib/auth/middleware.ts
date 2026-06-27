import { NextRequest, NextResponse } from 'next/server'
import { readAccessToken, verifyAccessToken } from '@/lib/auth/session'
import { sql } from '@/lib/db'

export interface AuthContext {
  walletAddress: string
  tokenJti: string
}

type AuthenticatedHandler = (
  request: NextRequest,
  auth: AuthContext
) => Promise<NextResponse> | NextResponse

type AuthenticatedHandlerWithCtx<Ctx> = (
  request: NextRequest,
  auth: AuthContext,
  context: Ctx
) => Promise<NextResponse> | NextResponse

function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
    { status: 401 }
  )
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const token = readAccessToken(request)
    if (!token) {
      return unauthorizedResponse()
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return unauthorizedResponse()
    }

    return handler(request, {
      walletAddress: payload.walletAddress,
      tokenJti: payload.jti,
    })
  }
}

export function withAuthCtx<Ctx>(
  handler: AuthenticatedHandlerWithCtx<Ctx>,
) {
  return async (
    request: NextRequest,
    context: Ctx,
  ): Promise<NextResponse> => {
    const token = readAccessToken(request)
    if (!token) {
      return unauthorizedResponse()
    }

    const payload = verifyAccessToken(token)
    if (!payload) {
      return unauthorizedResponse()
    }

    return handler(request, {
      walletAddress: payload.walletAddress,
      tokenJti: payload.jti,
    }, context)
  }
}

/**
 * Resolves the integer user.id for the given wallet_address. Returns null if
 * the wallet does not map to a row in `users`. Shared between the
 * notification routes and any other call site that needs the
 * authenticated user's database id (the JWT only carries the wallet
 * address).
 */
export async function resolveUserIdByWallet(
  walletAddress: string,
): Promise<number | null> {
  const rows = (await sql`
    SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `) as Array<{ id: number }>
  if (rows.length === 0) return null
  const raw = rows[0].id
  return typeof raw === 'number' ? raw : Number(raw) || null
}
