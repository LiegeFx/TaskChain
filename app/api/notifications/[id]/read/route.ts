import { NextRequest, NextResponse } from 'next/server'

import {
  NotificationError,
  markNotificationRead,
} from '@/lib/notifications'
import { sql } from '@/lib/db'
import { withAuthCtx, AuthContext, resolveUserIdByWallet as resolveUserId } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/notifications/[id]/read
 *
 * Marks a single notification as read for the authenticated user. The
 * notification must belong to the caller — otherwise we return 404 to avoid
 * leaking whether the id exists for someone else.
 *
 * Status codes:
 *   200 ok        {notification}
 *   400 invalid id or NotificationError → 400
 *   401 auth required
 *   404 not found / not the caller's notification
 *   503 db failure
 */
export const PATCH = withAuthCtx<RouteContext>(
  async (request: NextRequest, auth: AuthContext, context: RouteContext) => {
    void request
    const { id: rawId } = await context.params
    const notificationId = Number.parseInt(rawId, 10)

    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return NextResponse.json(
        { error: 'Invalid notification id', code: 'INVALID_ID' },
        { status: 400 },
      )
    }

    try {
      const userId = await resolveUserId(auth.walletAddress)
      if (userId === null) {
        return NextResponse.json(
          { error: 'User not found', code: 'USER_NOT_FOUND' },
          { status: 404 },
        )
      }

      const result = await markNotificationRead(notificationId, userId)
      if (result.notification === null) {
        return NextResponse.json(
          { error: 'Notification not found', code: 'NOT_FOUND' },
          { status: 404 },
        )
      }

      return NextResponse.json(
        { notification: result.notification },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      )
    } catch (error) {
      if (error instanceof NotificationError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 400 },
        )
      }
      console.error(
        `Failed to mark notification ${notificationId} read:`,
        error,
      )
      return NextResponse.json(
        { error: 'Unable to mark notification read', code: 'NOTIFICATION_UPDATE_FAILED' },
        { status: 503 },
      )
    }
  },
)


