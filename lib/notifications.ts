// lib/notifications.ts
//
// Service layer for notification operations: listing, marking as read,
// real-time push via NotificationHub, and event-creation helpers.
// All DB access goes through this file so route handlers stay thin and
// logic is independently testable.
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
  | "contract_state_changed"
  | "dispute_raised"
  | "escrow_funded"
  | "escrow_refunded"
  | "payment_released"
  | "payment_received"
  | "milestone_deadline_approaching"
  | "milestone_overdue"
  | "wallet_activity";

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  eventType: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  channel: string;
  createdAt: string;
  deliveredAt: string | null;
}

export interface NotificationQuery {
  page: number;
  limit: number;
  type: string | null;
  unreadOnly: boolean;
}

export interface CreateNotificationInput {
  userId: number;
  title: string;
  message: string;
  type: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

// ─── NotificationError ─────────────────────────────────────────────────────

export class NotificationError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const NOTIFICATION_EVENT_TYPES = [
  "info",
  "success",
  "warning",
  "contract_created",
  "milestone_submitted",
  "milestone_approved",
  "escrow_released",
  "escrow_refunded",
  "dispute_created",
  "dispute_resolved",
] as const;

export type NotificationEventType =
  (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_MAX_LIMIT = 100;

/**
 * Maximum offset allowed for pagination scans. When (page - 1) * limit
 * exceeds this cap the query is rejected before touching Postgres so a
 * malicious client cannot force a huge OFFSET scan.
 *
 * 100 * 500 = 50 000 rows
 */
export const NOTIFICATION_MAX_OFFSET = NOTIFICATION_MAX_LIMIT * 500;

// ─── NotificationHub (singleton, in-process pub/sub) ───────────────────────

type SubscriberCallback = (notification: Notification) => void;

export class NotificationHub {
  private static instance: NotificationHub | null = null;

  private readonly subscribers = new Map<number, Set<SubscriberCallback>>();

  static getInstance(): NotificationHub {
    if (!NotificationHub.instance) {
      NotificationHub.instance = new NotificationHub();
    }
    return NotificationHub.instance;
  }

  static resetInstance(): void {
    NotificationHub.instance = null;
  }

  /**
   * Subscribe to notifications for a given user. Returns an unsubscribe
   * function. Safe to call unsubscribe multiple times — subsequent calls
   * are no-ops.
   */
  subscribe(
    userId: number,
    callback: SubscriberCallback,
  ): () => void {
    let set = this.subscribers.get(userId);
    if (!set) {
      set = new Set();
      this.subscribers.set(userId, set);
    }
    set.add(callback);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const s = this.subscribers.get(userId);
      if (s) {
        s.delete(callback);
        if (s.size === 0) {
          this.subscribers.delete(userId);
        }
      }
    };
  }

  /**
   * Publish a notification to all subscribers for the notification's
   * userId. Broken subscribers are isolated — a throw inside one
   * callback does not prevent other callbacks from running.
   */
  publish(notification: Notification): void {
    const set = this.subscribers.get(notification.userId);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(notification);
      } catch (err) {
        console.error(
          "[NotificationHub] subscriber error for user",
          notification.userId,
          ":",
          err,
        );
      }
    }
  }

  /**
   * Returns the number of active subscribers for a given user.
   */
  subscriberCount(userId: number): number {
    return this.subscribers.get(userId)?.size ?? 0;
  }
}

// ─── Query parsing ─────────────────────────────────────────────────────────

/**
 * Parses URL search params for the GET /api/notifications endpoint.
 * Throws NotificationError with documented codes on invalid input.
 */
export function parseNotificationQuery(
  params: URLSearchParams,
): NotificationQuery {
  const parsePage = (raw: string | null): number => {
    if (raw === null) {
      return 1;
    }
    // Empty string (e.g. `?page=`) must throw, not silently default.
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new NotificationError(
        "INVALID_PAGE",
        "page must be a positive integer",
      );
    }
    return n;
  };

  const parseLimit = (raw: string | null): number => {
    if (raw === null) {
      return 20;
    }
    // Empty string (e.g. `?limit=`) must throw, not silently default.
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new NotificationError(
        "INVALID_LIMIT",
        "limit must be a positive integer",
      );
    }
    return Math.min(n, NOTIFICATION_MAX_LIMIT);
  };

  const page = parsePage(params.get("page"));
  const limit = parseLimit(params.get("limit"));

  const typeRaw = params.get("type");
  const type: string | null = typeRaw ?? null;
  if (
    type !== null &&
    !(NOTIFICATION_EVENT_TYPES as readonly string[]).includes(type)
  ) {
    throw new NotificationError(
      "INVALID_TYPE",
      `Unknown notification type: ${type}`,
    );
  }

  const unreadRaw = params.get("unreadOnly");
  const unreadOnly =
    unreadRaw === "true" || unreadRaw === "1";

  return { page, limit, type, unreadOnly };
}

// ─── Row → domain mapper ───────────────────────────────────────────────────

export function mapNotificationRow(
  row: Record<string, unknown>,
): Notification {
  return {
    id: row.id as number,
    userId: row.user_id as number,
    title: row.title as string,
    message: row.message as string,
    type: row.type as string,
    eventType: row.event_type as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    isRead: row.is_read as boolean,
    channel: (row.channel as string) ?? "in_app",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
    deliveredAt:
      row.delivered_at instanceof Date
        ? row.delivered_at.toISOString()
        : (row.delivered_at as string | null),
  };
}

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Persists a notification row and best-effort publishes to the hub.
 * Throws NotificationError if the INSERT returns zero rows.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification> {
  const rows = (await sql`
    INSERT INTO notifications
      (user_id, title, message, type, event_type, payload)
    VALUES
      (${input.userId}, ${input.title}, ${input.message}, ${input.type},
       ${input.eventType}, ${JSON.stringify(input.payload ?? {})})
    RETURNING *
  `) as Record<string, unknown>[];

  if (rows.length === 0) {
    throw new NotificationError(
      "NOTIFICATION_CREATE_FAILED",
      "No row returned after INSERT",
    );
  }

  const notification = mapNotificationRow(rows[0]);

  // Best-effort hub publish — failure here must not throw.
  try {
    NotificationHub.getInstance().publish(notification);
  } catch (err) {
    console.error(
      "[notifications] hub publish failed (id=",
      notification.id,
      "):",
      err,
    );
  }

  return notification;
}

// ─── List ──────────────────────────────────────────────────────────────────

export interface ListResult {
  notifications: Notification[];
  totalItems: number;
}

/**
 * Returns a paginated list of notifications for a user with total count
 * obtained via COUNT(*) OVER() in a single round-trip.
 */
export async function listNotificationsForUser(
  userId: number,
  query: NotificationQuery,
): Promise<ListResult> {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new NotificationError(
      "INVALID_USER",
      "User id must be a positive integer",
    );
  }

  const { page, limit, type, unreadOnly } = query;
  const offset = (page - 1) * limit;

  if (offset > NOTIFICATION_MAX_OFFSET) {
    throw new NotificationError(
      "PAGE_TOO_LARGE",
      `Offset ${offset} exceeds maximum allowed ${NOTIFICATION_MAX_OFFSET}`,
    );
  }

  // Build query with plain interpolations (no nested sql`` fragments) so
  // the vitest mock (plain vi.fn()) correctly returns queued responses.
  let rows: Record<string, unknown>[];

  if (type !== null && unreadOnly) {
    rows = (await sql`
      SELECT *, COUNT(*) OVER() AS total_count
      FROM notifications
      WHERE user_id = ${userId}
        AND event_type = ${type}
        AND is_read = FALSE
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  } else if (type !== null) {
    rows = (await sql`
      SELECT *, COUNT(*) OVER() AS total_count
      FROM notifications
      WHERE user_id = ${userId}
        AND event_type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  } else if (unreadOnly) {
    rows = (await sql`
      SELECT *, COUNT(*) OVER() AS total_count
      FROM notifications
      WHERE user_id = ${userId}
        AND is_read = FALSE
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT *, COUNT(*) OVER() AS total_count
      FROM notifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `) as Record<string, unknown>[];
  }

  if (!rows || rows.length === 0) {
    return { notifications: [], totalItems: 0 };
  }

  const totalItems = Number(rows[0].total_count ?? 0);
  const notifications = rows.map(mapNotificationRow);

  return { notifications, totalItems };
}

// ─── Mark single read ──────────────────────────────────────────────────────

export interface MarkReadResult {
  notification: Notification | null;
}

/**
 * Marks a single notification as read. The update is scoped to the
 * owner so the caller cannot mark another user's notification.
 * Returns { notification: null } when the notification doesn't exist
 * or belongs to someone else.
 */
export async function markNotificationRead(
  notificationId: number,
  userId: number,
): Promise<MarkReadResult> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ${notificationId}
      AND user_id = ${userId}
    RETURNING *
  `) as Record<string, unknown>[];

  if (rows.length === 0) {
    return { notification: null };
  }

  return { notification: mapNotificationRow(rows[0]) };
}

// ─── Mark all read ─────────────────────────────────────────────────────────

export interface MarkAllReadResult {
  updatedCount: number;
}

/**
 * Marks every unread notification for the given user as read in a
 * single CTE so updatedCount reflects only the rows flipped by this
 * particular call.
 */
export async function markAllNotificationsRead(
  userId: number,
): Promise<MarkAllReadResult> {
  const rows = (await sql`
    WITH updated AS (
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = ${userId}
        AND is_read = FALSE
      RETURNING id
    )
    SELECT COUNT(*)::int AS updated_count FROM updated
  `) as Array<{ updated_count: number }>;

  return { updatedCount: rows[0]?.updated_count ?? 0 };
}

// ─── Count ─────────────────────────────────────────────────────────────────

/**
 * Returns the total count of notifications for a user, optionally filtered
 * by read status. Useful for pagination info and unread badge counts.
 */
export async function countNotifications(
  userId: string | number,
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

// ─── Legacy-compatible exports (used by existing main route.ts) ─────────────

export interface ListNotificationsFilter {
  userId: string;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

function rowToNotification(row: Record<string, unknown>): Notification {
  return mapNotificationRow(row);
}

export async function listNotifications(
  filter: ListNotificationsFilter,
): Promise<Notification[]> {
  const limit = Math.min(filter.limit ?? 20, 100);
  const offset = filter.offset ?? 0;

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

export async function getUnreadCount(userId: string | number): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*) as unread FROM notifications
    WHERE user_id = ${userId} AND is_read = FALSE
  `) as Array<{ unread: number }>;
  return Number(rows[0]?.unread ?? 0);
}

export async function markAsRead(notificationId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = ${notificationId}
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length > 0;
}

export async function markAsUnread(notificationId: string): Promise<boolean> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = FALSE
    WHERE id = ${notificationId}
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length > 0;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const rows = (await sql`
    UPDATE notifications
    SET is_read = TRUE
    WHERE user_id = ${userId} AND is_read = FALSE
    RETURNING id
  `) as Record<string, unknown>[];

  return rows.length;
}

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

// ─── Notification content builders ─────────────────────────────────────────

export interface NotificationContent {
  title: string;
  body: string;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

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
  contract_state_changed: (p) => ({
    title: "Contract status updated",
    body: `Contract "${str(p, "contractName") ?? "Untitled"}" is now ${str(p, "newStatus") ?? "updated"}.`,
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
  milestone_deadline_approaching: (p) => ({
    title: "Deadline approaching",
    body: `Milestone "${str(p, "milestoneName") ?? "Unnamed"}" is due soon.`,
  }),
  milestone_overdue: (p) => ({
    title: "Milestone overdue",
    body: `Milestone "${str(p, "milestoneName") ?? "Unnamed"}" has passed its due date.`,
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

// ─── Unified dispatch (in-app + email) ─────────────────────────────────────

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
      const content = buildNotificationContent(type, payload);
      result.notification = await createNotification({
        userId: Number(userId),
        title: content.title,
        message: content.body,
        type: "info",
        eventType: type,
        payload,
      });
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

// ─── Event-creation helpers ────────────────────────────────────────────────

function toPayload(obj: Record<string, unknown>): Record<string, unknown> {
  return obj;
}

/**
 * Notify both parties when a contract is created.
 */
export async function notifyContractCreated(
  clientId: number,
  freelancerId: number,
  contractId: number,
  contractName: string,
): Promise<void> {
  const payload = toPayload({ contractId, contractName });
  await createNotification({
    userId: clientId,
    title: "Contract created",
    message: `Contract "${contractName}" has been created.`,
    type: "success",
    eventType: "contract_created",
    payload,
  });
  await createNotification({
    userId: freelancerId,
    title: "New contract",
    message: `You have been assigned to "${contractName}".`,
    type: "success",
    eventType: "contract_created",
    payload,
  });
}

/**
 * Notify the client when a freelancer submits a milestone.
 */
export async function notifyMilestoneSubmitted(
  clientId: number,
  milestoneId: number,
  milestoneName: string,
): Promise<void> {
  await createNotification({
    userId: clientId,
    title: "Milestone submitted",
    message: `Milestone "${milestoneName}" (#${milestoneId}) was submitted for your review.`,
    type: "success",
    eventType: "milestone_submitted",
    payload: toPayload({ milestoneId, milestoneName }),
  });
}

/**
 * Notify the freelancer when a milestone is approved.
 */
export async function notifyMilestoneApproved(
  freelancerId: number,
  milestoneId: number,
  milestoneName: string,
): Promise<void> {
  await createNotification({
    userId: freelancerId,
    title: "Milestone approved",
    message: `Milestone "${milestoneName}" (#${milestoneId}) was approved.`,
    type: "success",
    eventType: "milestone_approved",
    payload: toPayload({ milestoneId, milestoneName }),
  });
}

/**
 * Notify the client (always) and optionally the freelancer when escrow
 * funds are released.
 */
export async function notifyEscrowReleased(
  clientId: number,
  freelancerId: number | null,
  milestoneId: number,
  amount: string,
  currency: string,
): Promise<void> {
  const payload = toPayload({ milestoneId, amount, currency });
  // Always notify client
  await createNotification({
    userId: clientId,
    title: "Escrow released",
    message: `${amount} ${currency} was released for milestone #${milestoneId}.`,
    type: "success",
    eventType: "escrow_released",
    payload,
  });
  if (freelancerId !== null) {
    await createNotification({
      userId: freelancerId,
      title: "Funds received",
      message: `You received ${amount} ${currency} for milestone #${milestoneId}.`,
      type: "success",
      eventType: "escrow_released",
      payload,
    });
  }
}

/**
 * Notify when a dispute is opened on a contract.
 */
export async function notifyDisputeCreated(
  recipientId: number,
  disputeId: number,
  contractId: number,
): Promise<void> {
  await createNotification({
    userId: recipientId,
    title: "Dispute opened",
    message: `A dispute (#${disputeId}) has been opened on your contract #${contractId}.`,
    type: "warning",
    eventType: "dispute_created",
    payload: toPayload({ disputeId, contractId }),
  });
}
