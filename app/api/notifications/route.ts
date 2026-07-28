export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { enforceRateLimit, buildRateLimitKey } from "@/lib/security/rateLimit";
import { getUserIdByWallet } from "@/lib/reputation";
import {
  listNotifications as listNotificationsDb,
  countNotifications as countNotificationsDb,
  markAllAsRead as markAllAsReadDb,
} from "@/lib/notifications";

// ─── Validation schemas ────────────────────────────────────────────────────

const ListNotificationsSchema = z.object({
  isRead: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ─── GET /api/notifications ────────────────────────────────────────────────

/**
 * GET /api/notifications?limit=20&offset=0&isRead=false
 *
 * Returns a paginated list of notifications for the authenticated user.
 * Query parameters:
 *   - limit: max 100, default 20
 *   - offset: pagination offset, default 0
 *   - isRead: filter by read status (optional)
 */
export const GET = withAuth(async (request: NextRequest, auth) => {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, "notifications:list", auth.walletAddress),
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const userId = await getUserIdByWallet(auth.walletAddress);
  if (userId === null) {
    return NextResponse.json(
      {
        error: "Platform user not found for this wallet",
        code: "USER_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  const { searchParams } = request.nextUrl;
  const parsed = ListNotificationsSchema.safeParse({
    isRead: searchParams.get("isRead") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  try {
    const notifications = await listNotificationsDb({
      userId,
      isRead: parsed.data.isRead,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    const total = await countNotificationsDb(userId, parsed.data.isRead);

    return NextResponse.json(
      {
        notifications,
        pagination: {
          total,
          limit: parsed.data.limit ?? 20,
          offset: parsed.data.offset ?? 0,
          hasMore: (parsed.data.offset ?? 0) + notifications.length < total,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
});

// ─── PATCH /api/notifications (mark all as read) ────────────────────────────

/**
 * PATCH /api/notifications
 *
 * Marks all unread notifications for the authenticated user as read.
 */
export const PATCH = withAuth(async (request: NextRequest, auth) => {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(request, "notifications:update", auth.walletAddress),
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const userId = await getUserIdByWallet(auth.walletAddress);
  if (userId === null) {
    return NextResponse.json(
      {
        error: "Platform user not found for this wallet",
        code: "USER_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  try {
    const updatedCount = await markAllAsReadDb(userId);
    return NextResponse.json(
      {
        message: "All notifications marked as read",
        updatedCount,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[PATCH /api/notifications]", err);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
});
