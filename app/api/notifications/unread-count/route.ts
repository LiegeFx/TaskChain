export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { enforceRateLimit, buildRateLimitKey } from "@/lib/security/rateLimit";
import { getUserIdByWallet } from "@/lib/reputation";
import { getUnreadCount } from "@/lib/notifications";

// ─── GET /api/notifications/unread-count ────────────────────────────────────

/**
 * GET /api/notifications/unread-count
 *
 * Returns the count of unread notifications for the authenticated user.
 * This is useful for updating the badge count on the notification bell icon.
 */
export const GET = withAuth(async (request: NextRequest, auth) => {
  const limited = await enforceRateLimit(request, {
    key: buildRateLimitKey(
      request,
      "notifications:unread-count",
      auth.walletAddress,
    ),
    limit: 120, // Higher limit since this is called frequently
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
    const unreadCount = await getUnreadCount(userId);
    return NextResponse.json(
      { unreadCount },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    console.error("[GET /api/notifications/unread-count]", err);
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 },
    );
  }
});
