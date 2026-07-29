export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext, resolveUserIdByWallet } from "@/lib/auth/middleware";
import {
  parseNotificationQuery,
  listNotificationsForUser,
  markAllNotificationsRead,
  getUnreadCount,
  NotificationError,
} from "@/lib/notifications";

// ─── GET /api/notifications ────────────────────────────────────────────────

/**
 * GET /api/notifications?page=1&limit=20&type=milestone_approved&unreadOnly=true
 *
 * Returns a paginated list of notifications for the authenticated user.
 * Query parameters:
 *   - page: ≥1, default 1
 *   - limit: 1..100, default 20
 *   - type: one of NOTIFICATION_EVENT_TYPES, optional
 *   - unreadOnly: true/1, optional
 *
 * Response:
 *   { data: Notification[], meta: { totalCount, page, limit, totalPages, unreadCount } }
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  void request;
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress);
    if (userId === null) {
      return NextResponse.json(
        { error: "Platform user not found for this wallet", code: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    const query = parseNotificationQuery(request.nextUrl.searchParams);

    const [result, unreadCount] = await Promise.all([
      listNotificationsForUser(userId, query),
      getUnreadCount(userId),
    ]);

    return NextResponse.json(
      {
        data: result.notifications,
        meta: {
          totalCount: result.totalItems,
          page: query.page,
          limit: query.limit,
          totalPages: Math.max(1, Math.ceil(result.totalItems / query.limit)),
          unreadCount,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    if (err instanceof NotificationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[GET /api/notifications]", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications", code: "NOTIFICATIONS_LIST_FAILED" },
      { status: 503 },
    );
  }
});

// ─── PATCH /api/notifications (mark all as read) ────────────────────────────

/**
 * PATCH /api/notifications
 *
 * Marks all unread notifications for the authenticated user as read.
 * Returns { updatedCount }.
 */
export const PATCH = withAuth(async (request: NextRequest, auth: AuthContext) => {
  void request;
  try {
    const userId = await resolveUserIdByWallet(auth.walletAddress);
    if (userId === null) {
      return NextResponse.json(
        { error: "Platform user not found for this wallet", code: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    const result = await markAllNotificationsRead(userId);
    return NextResponse.json(
      { message: "All notifications marked as read", updatedCount: result.updatedCount },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof NotificationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    console.error("[PATCH /api/notifications]", err);
    return NextResponse.json(
      { error: "Failed to update notifications", code: "NOTIFICATION_UPDATE_FAILED" },
      { status: 503 },
    );
  }
});
