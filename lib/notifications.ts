// lib/notifications.ts
//
// Service layer for notification operations: listing, marking as read/unread,
// and deleting notifications. All DB access goes through this file so route
// handlers stay thin and logic is independently testable.
//
// Column mapping:
//   DB snake_case  ←→  JS camelCase (done manually — no ORM)

import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotificationType =
  | "milestone_approved"
  | "milestone_submitted"
  | "funds_released"
  | "contract_created"
  | "dispute_raised"
  | "escrow_funded"
  | "escrow_refunded"
  | "payment_released"
  | "payment_received"
  | "wallet_activity";

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

// --- Message formatting ----------------------------------------------------

export interface NotificationContent {
  title: string;
  body: string;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Every NotificationType must have an entry, so adding a new event type
// forces a template to be written for it.
const CONTENT_BUILDERS: Record<
  NotificationType,
  (payload: Record<string, unknown>) => NotificationContent
> = {
  milestone_submitted: (p) => ({
    title: "Milestone submitted",
    body: `Milestone "${str(p, "milestoneName") ?? "Unnamed"}" was submitted for your review.`,
  }),
  milestone_approved: (p) => ({
    title: "Milestone approved",
    body: `Milestone "${str(p, "milestoneName") ?? "Unnamed"}" has been approved.`,
  }),
  funds_released: (p) => ({
    title: "Funds released",
    body: `${str(p, "amount") ?? "Funds"} released for milestone "${str(p, "milestoneName") ?? "Unnamed"}".`,
  }),
  payment_received: (p) => ({
    title: "Payment received",
    body: `You received ${str(p, "amount") ?? "a payment"} for milestone "${str(p, "milestoneName") ?? "Unnamed"}".`,
  }),
  payment_released: (p) => ({
    title: "Payment released",
    body: `Payment of ${str(p, "amount") ?? "funds"} has been released.`,
  }),
  contract_created: (p) => ({
    title: "Contract created",
    body: `New contract "${str(p, "contractName") ?? "Untitled"}" created.`,
  }),
  dispute_raised: (p) => ({
    title: "Dispute opened",
    body: `A dispute has been opened on your contract: ${str(p, "reason") ?? "see the dispute page for details"}.`,
  }),
  escrow_funded: (p) => ({
    title: "Escrow funded",
    body: `Escrow has been funded with ${str(p, "amount") ?? "funds"}. Work can begin.`,
  }),
  escrow_refunded: (p) => ({
    title: "Escrow refunded",
    body: `Escrow funds of ${str(p, "amount") ?? "the contract"} were refunded to the client.`,
  }),
  wallet_activity: (p) => ({
    title: "Wallet activity",
    body: `${str(p, "description") ?? "There was activity on your wallet"}${str(p, "amount") ? ` (${str(p, "amount")})` : ""}.`,
  }),
};

export function buildNotificationContent(
  type: NotificationType,
  payload: Record<string, unknown> = {},
): NotificationContent {
  return CONTENT_BUILDERS[type](payload);
}

// --- Unified dispatch (in-app + email) -------------------------------------

export interface DispatchChannels {
  inApp?: boolean;
  email?: boolean;
}

export interface DispatchResult {
  inApp: boolean;
  email: boolean;
  notification: Notification | null;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const rows = (await sql`
    SELECT email FROM users WHERE id = ${userId} LIMIT 1
  `) as Record<string, unknown>[];

  const email = rows[0]?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
}

export function isEmailChannelEnabled(): boolean {
  return process.env.NOTIFICATIONS_EMAIL_DISABLED !== "true";
}

/**
 * Delivers a notification for an event through all enabled channels:
 * persists an in-app notification and emails the user. Each channel fails
 * independently and is only logged, so callers (route handlers) can invoke
 * this after their main side-effect without risking the request.
 */
export async function dispatchNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
  channels: DispatchChannels = {},
): Promise<DispatchResult> {
  const wantInApp = channels.inApp ?? true;
  const wantEmail = (channels.email ?? true) && isEmailChannelEnabled();

  const result: DispatchResult = { inApp: false, email: false, notification: null };

  if (wantInApp) {
    try {
      result.notification = await createNotification(userId, type, payload);
      result.inApp = true;
    } catch (err) {
      console.error(
        `[notifications] in-app dispatch failed (type=${type}, user=${userId}):`,
        err,
      );
    }
  }

  if (wantEmail) {
    try {
      const email = await getUserEmail(userId);
      if (email) {
        const content = buildNotificationContent(type, payload);
        result.email = await sendEmail({
          to: email,
          subject: content.title,
          text: content.body,
        });
      }
    } catch (err) {
      console.error(
        `[notifications] email dispatch failed (type=${type}, user=${userId}):`,
        err,
      );
    }
  }

  return result;
}
