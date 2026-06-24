// lib/notifications.ts
//
// Service layer for notification operations: listing, marking as read/unread,
// and deleting notifications. All DB access goes through this file so route
// handlers stay thin and logic is independently testable.
//
// Column mapping:
//   DB snake_case  ←→  JS camelCase (done manually — no ORM)

import { sql } from "@/lib/db";

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotificationType =
  | "milestone_approved"
  | "funds_released"
  | "contract_created"
  | "dispute_raised"
  | "escrow_funded"
  | "escrow_refunded"
  | "payment_released"
  | "payment_received";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface ListNotificationsFilter {
  userId: string;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Row → domain mapper ───────────────────────────────────────────────────

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as NotificationType,
    payload: (row.payload as Record<string, unknown>) ?? {},
    isRead: row.is_read as boolean,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Returns a paginated list of notifications for a user, optionally filtered
 * by read status. Ordered by created_at descending (newest first).
 */
export async function listNotifications(
  filter: ListNotificationsFilter,
): Promise<Notification[]> {
  const limit = Math.min(filter.limit ?? 20, 100); // hard cap at 100
  const offset = filter.offset ?? 0;

  // Build WHERE clauses dynamically
  let rows: Record<string, unknown>[];

  if (filter.isRead !== undefined) {
    rows = (await sql`
      SELECT * FROM notifications
      WHERE  user_id = ${filter.userId}
        AND  is_read = ${filter.isRead}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT * FROM notifications
      WHERE  user_id = ${filter.userId}
      ORDER BY created_at DESC
      LIMIT  ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  }

  return rows.map(rowToNotification);
}

/**
 * Returns the total count of notifications for a user, optionally filtered
 * by read status. Useful for pagination info and unread badge counts.
 */
export async function countNotifications(
  userId: string,
  isRead?: boolean,
): Promise<number> {
  let rows: Record<string, unknown>[];

  if (isRead !== undefined) {
    rows = (await sql`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ${userId}
        AND is_read = ${isRead}
    `) as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ${userId}
    `) as Record<string, unknown>[];
  }

  return Number(rows[0]?.count ?? 0);
}

/**
 * Returns the count of unread notifications for a user. Commonly used
 * for the badge count on the notification bell icon.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return countNotifications(userId, false);
}

/**
 * Marks a single notification as read by ID. Returns true if the notification
 * existed, false otherwise.
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ${notificationId}
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length > 0;
}

/**
 * Marks a single notification as unread by ID. Returns true if the notification
 * existed, false otherwise.
 */
export async function markAsUnread(notificationId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = FALSE
    WHERE id = ${notificationId}
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length > 0;
}

/**
 * Marks all notifications for a user as read. Returns the count of
 * notifications updated.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = TRUE
    WHERE user_id = ${userId} AND is_read = FALSE
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length;
}

/**
 * Deletes a notification by ID. Returns true if the notification existed,
 * false otherwise.
 */
export async function deleteNotification(
  notificationId: string,
): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM notifications
    WHERE id = ${notificationId}
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length > 0;
}

/**
 * Creates a notification for a user. Used internally by the system.
 * (This function is already implemented in scripts/worker.ts but included
 * here for completeness and to have a single source of truth for the service.)
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
): Promise<Notification> {
  const rows = (await sql`
    INSERT INTO notifications (user_id, type, payload)
    VALUES (${userId}, ${type}, ${JSON.stringify(payload)})
    RETURNING *
  `) as Record<string, unknown>[];

  return rowToNotification(rows[0] as Record<string, unknown>);
}
