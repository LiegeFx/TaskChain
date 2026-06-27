export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { enforceRateLimit, buildRateLimitKey } from "@/lib/security/rateLimit";
import { getUserIdByWallet } from "@/lib/reputation";
import {
  markAsRead,
  markAsUnread,
  deleteNotification,
  listNotifications,
} from "@/lib/notifications";

// ─── Validation schemas ────────────────────────────────────────────────────

const ParamsSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

const PatchSchema = z.object({
  action: z.enum(["read", "unread"]),
});

// ─── PATCH /api/notifications/[id] ─────────────────────────────────────────

/**
 * PATCH /api/notifications/[id]
 * Body: { action: "read" | "unread" }
 *
 * Marks a single notification as read or unread.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
) {
  return withAuth(async (request: NextRequest, auth) => {
    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(
        request,
        "notifications:update",
        auth.walletAddress,
      ),
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

    const resolvedParams = await params;
    const paramsParsed = ParamsSchema.safeParse(resolvedParams);
    if (!paramsParsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: paramsParsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    const bodyParsed = PatchSchema.safeParse(body);
    if (!bodyParsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: bodyParsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    try {
      // Verify the notification belongs to this user
      const notifications = await listNotifications({
        userId,
        limit: 1,
        offset: 0,
      });

      const isOwned = notifications.some((n) => n.id === paramsParsed.data.id);
      if (!isOwned) {
        // Double-check by fetching all notifications more broadly
        // In production, you might want to do a direct DB check
        const allNotifs = await listNotifications({
          userId,
          limit: 1000,
          offset: 0,
        });

        if (!allNotifs.some((n) => n.id === paramsParsed.data.id)) {
          return NextResponse.json(
            { error: "Notification not found or access denied" },
            { status: 404 },
          );
        }
      }

      if (bodyParsed.data.action === "read") {
        const success = await markAsRead(paramsParsed.data.id);
        if (!success) {
          return NextResponse.json(
            { error: "Notification not found" },
            { status: 404 },
          );
        }
      } else {
        const success = await markAsUnread(paramsParsed.data.id);
        if (!success) {
          return NextResponse.json(
            { error: "Notification not found" },
            { status: 404 },
          );
        }
      }

      return NextResponse.json(
        { message: `Notification marked as ${bodyParsed.data.action}` },
        { status: 200 },
      );
    } catch (err) {
      console.error("[PATCH /api/notifications/[id]]", err);
      return NextResponse.json(
        { error: "Failed to update notification" },
        { status: 500 },
      );
    }
  })(request, { params });
}

// ─── DELETE /api/notifications/[id] ────────────────────────────────────────

/**
 * DELETE /api/notifications/[id]
 *
 * Deletes a single notification.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
) {
  return withAuth(async (request: NextRequest, auth) => {
    const limited = await enforceRateLimit(request, {
      key: buildRateLimitKey(
        request,
        "notifications:delete",
        auth.walletAddress,
      ),
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

    const resolvedParams = await params;
    const paramsParsed = ParamsSchema.safeParse(resolvedParams);
    if (!paramsParsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: paramsParsed.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    try {
      // Verify the notification belongs to this user
      const allNotifs = await listNotifications({
        userId,
        limit: 1000,
        offset: 0,
      });

      if (!allNotifs.some((n) => n.id === paramsParsed.data.id)) {
        return NextResponse.json(
          { error: "Notification not found or access denied" },
          { status: 404 },
        );
      }

      const success = await deleteNotification(paramsParsed.data.id);
      if (!success) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { message: "Notification deleted" },
        { status: 200 },
      );
    } catch (err) {
      console.error("[DELETE /api/notifications/[id]]", err);
      return NextResponse.json(
        { error: "Failed to delete notification" },
        { status: 500 },
      );
    }
  })(request, { params });
}
