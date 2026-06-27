import { NextRequest, NextResponse } from 'next/server'

import {
  NotificationError,
  listNotificationsForUser,
  parseNotificationQuery,
} from '@/lib/notifications'
import { sql } from '@/lib/db'
import {
  withAuth,
  AuthContext,
  resolveUserIdByWallet,
} from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications
 *
 * List notifications for the authenticated user. Query parameters:
 *   page        1-based page number (default 1)
 *   limit       Page size, 1..100 (default 20)
 *   type        Optional filter on event_type (one of the canonical
 *               NOTIFICATION_EVENT_TYPES values)
 *   unreadOnly  true|false|1|0 (default false)
 *
 * Response shape:
 *   {
 *     data: Notification[],
 *     meta: {
 *       totalCount: number,
 *       page: number,
 *       limit: number,
 *       totalPages: number,
 *       unreadCount: number          // bonus: total unread for badge UI
 *     }
 *   }
 *
 * Status codes:
 *   200 ok
 *   400 NotificationError mapped to {error, code}
 *   401 missing/invalid auth token
 *   503 unexpected DB failure
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress)
    if (userId === null) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    const params = parseNotificationQuery(request.nextUrl.searchParams)
    const result = await listNotificationsForUser(userId, params)

    // Bonus metadata: total unread count for the badge UI. Cheap because
    // idx_notifications_user_unread already covers (user_id, is_read,
    // created_at DESC).
    const unreadRows = (await sql`
      SELECT COUNT(*)::int AS unread
      FROM notifications
      WHERE user_id = ${userId} AND is_read = FALSE
    `) as Array<{ unread: number }>
    const unreadCount = Number(unreadRows[0]?.unread ?? 0)

    return NextResponse.json({
      data: result.notifications,
      meta: {
        totalCount: result.totalItems,
        page: params.page,
        limit: params.limit,
        totalPages:
          result.totalItems === 0
            ? 0
            : Math.max(1, Math.ceil(result.totalItems / params.limit)),
        unreadCount,
      },
    })
  } catch (error) {
    if (error instanceof NotificationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      )
    }
    console.error('Failed to list notifications:', error)
    return NextResponse.json(
      { error: 'Unable to load notifications', code: 'NOTIFICATIONS_LIST_FAILED' },
      { status: 503 },
    )
  }
})
