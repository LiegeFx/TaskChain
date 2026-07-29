import { NextRequest, NextResponse } from 'next/server'

import {
  NotificationError,
  markAllNotificationsRead,
} from '@/lib/notifications'
import {
  withAuth,
  AuthContext,
  resolveUserIdByWallet as resolveUserId,
} from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/read-all
 *
 * Marks every unread notification for the authenticated user as read.
 * Returns the number of rows updated (returns 0 if there were none).
 *
 * Status codes:
 *   200 ok            {updatedCount}
 *   400 NotificationError
 *   401 auth required
 *   503 db failure
 */
export const POST = withAuth(async (request: NextRequest, auth: AuthContext) => {
  void request
  try {
    const userId = await resolveUserId(auth.walletAddress)
    if (userId === null) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    const result = await markAllNotificationsRead(userId)
    return NextResponse.json({ updatedCount: result.updatedCount })
  } catch (error) {
    if (error instanceof NotificationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      )
    }
    console.error('Failed to mark all notifications read:', error)
    return NextResponse.json(
      { error: 'Unable to mark all notifications read', code: 'NOTIFICATION_UPDATE_FAILED' },
      { status: 503 },
    )
  }
})
