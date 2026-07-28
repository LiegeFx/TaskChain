/**
 * Notification service.
 *
 * Encapsulates the persistence, retrieval, status-update, and in-process
 * fan-out used by:
 *   - GET   /api/notifications                (list w/ pagination + filter)
 *   - PATCH /api/notifications/[id]/read      (mark single read)
 *   - POST  /api/notifications/read-all      (mark all read)
 *   - GET   /api/notifications/stream        (SSE real-time delivery)
 *   - lib/notifications.dispatch* helpers    (event-creation entry points)
 *
 * The data source is the `notifications` table. The schema (with the payload,
 * channel, and event_type enrichments added by
 * scripts/011-notification-service.sql) supports the issue spec:
 *   id, userId, eventType, message, timestamp, read/unread status.
 *
 * Real-time delivery is implemented as a server-side pub/sub (`NotificationHub`)
 * plus downstream Server-Sent Events. In-process pub/sub is the lower-risk
 * default for a Next.js app (no custom server.ts), and matches the SSE/WS
 * requirement from issue #122. Multi-instance fan-out (cross-process) is
 * explicitly out of scope for this PR — it is documented in the "Out of
 * scope" section of the PR description.
 */

import { sql } from '@/lib/db'

/** Canonical event types the helper emits. Mirrors the CHECK constraint added in
 *  scripts/011-notification-service.sql so application code and schema agree. */
export const NOTIFICATION_EVENT_TYPES = [
  'contract_created',
  'milestone_submitted',
  'milestone_approved',
  'escrow_released',
  'escrow_refunded',
  'dispute_created',
  'dispute_resolved',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

/** Legacy free-form types that pre-date the new CHECK constraint. We keep the
 *  worker (`scripts/worker.ts`) writing these for back-compat; the api surface
 *  treats them as opaque "info"/"success"/"warning" badges. */
export const LEGACY_NOTIFICATION_TYPES = [
  'info',
  'success',
  'warning',
] as const

export type LegacyNotificationType = (typeof LEGACY_NOTIFICATION_TYPES)[number]

export type NotificationKind = NotificationEventType | LegacyNotificationType

export const NOTIFICATION_DEFAULT_LIMIT = 20
export const NOTIFICATION_MAX_LIMIT = 100

/**
 * Upper bound on (page * limit). Caps the `OFFSET` clause Postgres has to
 * scan inside `listNotificationsForUser`. The cap is generous — at the
 * default limit of 20 it allows 5 k pages, which is 100 k rows (already a
 * huge list). Posting past it throws NotificationError → 400 instead of
 * silently letting a malicious query issue a big offset scan.
 */
export const NOTIFICATION_MAX_OFFSET = NOTIFICATION_MAX_LIMIT * 500

export interface NotificationRow {
  id: number
  user_id: number
  title: string
  message: string
  /** Free-form badge: kept for back-compat with worker writes. */
  type: string
  /** Domain event discriminator with CHECK constraint. */
  event_type: string
  payload: Record<string, unknown>
  is_read: boolean
  channel: string
  created_at: Date | string
  delivered_at: Date | string | null
}

export interface Notification {
  id: number
  userId: number
  title: string
  message: string
  type: string
  eventType: string
  payload: Record<string, unknown>
  isRead: boolean
  channel: string
  createdAt: string
  deliveredAt: string | null
}

export interface CreateNotificationInput {
  userId: number
  title: string
  message: string
  type: LegacyNotificationType
  eventType: NotificationEventType
  payload?: Record<string, unknown>
  channel?: string
}

export interface ListNotificationsParams {
  page: number
  limit: number
  type?: NotificationEventType | null
  unreadOnly: boolean
}

export interface ListNotificationsResult {
  notifications: Notification[]
  totalItems: number
}

export class NotificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'NotificationError'
  }
}

// ---------- Row → API mapping ---------------------------------------------

export function mapNotificationRow(row: NotificationRow): Notification {
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at
  const deliveredAt =
    row.delivered_at instanceof Date
      ? row.delivered_at.toISOString()
      : row.delivered_at

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    eventType: row.event_type,
    payload: row.payload ?? {},
    isRead: row.is_read,
    channel: row.channel,
    createdAt,
    deliveredAt,
  }
}

// ---------- Query parameter parsing & validation --------------------------

function parsePage(value: string | null): number {
  if (value === null) return 1
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new NotificationError(
      'INVALID_PAGE',
      'page must be a positive integer',
    )
  }
  return parsed
}

function parseLimit(value: string | null): number {
  if (value === null) return NOTIFICATION_DEFAULT_LIMIT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new NotificationError(
      'INVALID_LIMIT',
      'limit must be a positive integer',
    )
  }
  return Math.min(parsed, NOTIFICATION_MAX_LIMIT)
}

function parseEventType(value: string | null): NotificationEventType | null {
  if (value === null || value === '') return null
  if ((NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)) {
    return value as NotificationEventType
  }
  throw new NotificationError(
    'INVALID_TYPE',
    `type must be one of: ${NOTIFICATION_EVENT_TYPES.join(', ')}`,
  )
}

function parseUnreadOnly(value: string | null): boolean {
  if (value === null) return false
  const normalised = value.trim().toLowerCase()
  if (normalised === 'true' || normalised === '1') return true
  if (normalised === 'false' || normalised === '0' || normalised === '') return false
  throw new NotificationError(
    'INVALID_UNREAD_ONLY',
    'unreadOnly must be true, false, 1, or 0',
  )
}

/**
 * Parses and validates the search-parameters used by GET /api/notifications.
 * Returns a fully-populated `ListNotificationsParams` and never throws for
 * unrecognised-but-optional inputs (it defaults them). Throws
 * NotificationError → 400 for hard-invalid inputs.
 */
export function parseNotificationQuery(
  searchParams: URLSearchParams,
): ListNotificationsParams {
  return {
    page: parsePage(searchParams.get('page')),
    limit: parseLimit(searchParams.get('limit')),
    type: parseEventType(searchParams.get('type') ?? searchParams.get('eventType')),
    unreadOnly: parseUnreadOnly(searchParams.get('unreadOnly')),
  }
}

// ---------- Persistence helpers --------------------------------------------

/**
 * Persists a new notification and publishes it on the in-process hub so
 * connected SSE clients get it in real-time. Returns the mapped Notification.
 * Errors from the DB layer are surfaced as-is so callers can translate them
 * to 5xx responses; an unreachable hub is non-fatal (notifications are still
 * persisted).
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification> {
  const payload = input.payload ?? {}

  const rows = (await sql`
    INSERT INTO notifications (
      user_id, title, message, type, event_type,
      payload, channel, is_read, created_at
    )
    VALUES (
      ${input.userId},
      ${input.title},
      ${input.message},
      ${input.type},
      ${input.eventType},
      ${JSON.stringify(payload)}::jsonb,
      ${input.channel ?? 'in_app'},
      FALSE,
      NOW()
    )
    RETURNING
      id, user_id, title, message, type, event_type,
      payload, is_read, channel, created_at, delivered_at
  `) as NotificationRow[]

  const row = rows[0]
  if (!row) {
    throw new NotificationError(
      'NOTIFICATION_INSERT_FAILED',
      'Notification insert returned no rows',
    )
  }

  const mapped = mapNotificationRow(row)

  // Best-effort fan-out — if no SSE controllers are subscribed for this
  // user, this is a no-op. We swallow publish errors so persistence
  // failure can't cascade into delivery failure (and vice versa).
  try {
    NotificationHub.getInstance().publish(mapped)
  } catch (error) {
    console.error(
      `[notifications] publish failed for user ${input.userId}:`,
      error,
    )
  }

  return mapped
}

export async function listNotificationsForUser(
  userId: number,
  params: ListNotificationsParams,
): Promise<ListNotificationsResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new NotificationError(
      'INVALID_USER_ID',
      'userId must be a positive integer',
    )
  }

  const offset = (params.page - 1) * params.limit
  if (offset > NOTIFICATION_MAX_OFFSET) {
    throw new NotificationError(
      'PAGE_TOO_LARGE',
      `page * limit must not exceed ${NOTIFICATION_MAX_OFFSET}`,
    )
  }
  const typeFilter = params.type ?? null
  const unreadOnly = params.unreadOnly

  const rows = (await sql`
    SELECT
      id, user_id, title, message, type, event_type,
      payload, is_read, channel, created_at, delivered_at,
      COUNT(*) OVER() AS total_count
    FROM notifications
    WHERE user_id = ${userId}
      AND (${typeFilter}::text IS NULL OR event_type = ${typeFilter})
      AND (${unreadOnly}::boolean = FALSE OR is_read = FALSE)
    ORDER BY created_at DESC, id DESC
    LIMIT ${params.limit}
    OFFSET ${offset}
  `) as Array<NotificationRow & { total_count: string | number | null }>

  let totalItems: number
  if (rows.length === 0) {
    totalItems = 0
  } else {
    const raw = rows[0]?.total_count
    if (raw === null || raw === undefined) {
      totalItems = 0
    } else if (typeof raw === 'number') {
      totalItems = raw
    } else {
      const parsed = parseInt(String(raw), 10)
      totalItems = Number.isFinite(parsed) ? parsed : 0
    }
  }

  // Clone away the total_count helper column. Destructure-rest drops the
  // extra column without enumerating fields; `_ignored` is exempt from
  // noUnusedLocals under the leading-underscore convention.
  const notifications: Notification[] = rows.map((row) => {
    const { total_count: _ignored, ...rest } = row
    void _ignored
    return mapNotificationRow(rest as NotificationRow)
  })

  return { notifications, totalItems }
}

export interface MarkReadResult {
  notification: Notification | null
}

export async function markNotificationRead(
  notificationId: number,
  userId: number,
): Promise<MarkReadResult> {
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throw new NotificationError(
      'INVALID_NOTIFICATION_ID',
      'notificationId must be a positive integer',
    )
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new NotificationError(
      'INVALID_USER_ID',
      'userId must be a positive integer',
    )
  }

  const rows = (await sql`
    UPDATE notifications
       SET is_read = TRUE
     WHERE id = ${notificationId}
       AND user_id = ${userId}
    RETURNING
      id, user_id, title, message, type, event_type,
      payload, is_read, channel, created_at, delivered_at
  `) as NotificationRow[]

  const row = rows[0]
  return { notification: row ? mapNotificationRow(row) : null }
}

export interface MarkAllReadResult {
  updatedCount: number
}

export async function markAllNotificationsRead(
  userId: number,
): Promise<MarkAllReadResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new NotificationError(
      'INVALID_USER_ID',
      'userId must be a positive integer',
    )
  }

  // Single round-trip via a CTE: the WITH clause produces the set of rows
  // that *this call* flipped, and the outer SELECT returns *that exact
  // count* (not the user's lifetime read total, which a separate
  // `WHERE is_read = TRUE` query would have produced).
  const rows = (await sql`
    WITH updated AS (
      UPDATE notifications
         SET is_read = TRUE
       WHERE user_id = ${userId} AND is_read = FALSE
      RETURNING id
    )
    SELECT COUNT(*)::int AS updated_count FROM updated
  `) as Array<{ updated_count: number }>

  const raw = rows[0]?.updated_count ?? 0
  return { updatedCount: typeof raw === 'number' ? raw : Number(raw) || 0 }
}

// ---------- In-process pub/sub (server-side fan-out) ----------------------

/**
 * Lightweight singleton hub that mirrors SSE subscribers by userId. New
 * notifications `publish`ed via `NotificationHub.publish` are pushed to
 * every subscriber for the matching userId (and silently drop on errors so
 * one broken controller doesn't stall others).
 *
 * In-process scope: subscribers connect to the same Node.js process. The
 * intended deployment topology is a single Next.js server, which is the
 * case for Railway/Fly deployments listed in the README. For
 * horizontally-scaled multi-instance deployments a Redis pub/sub backplane
 * would be needed — see the "Out of scope" section in the PR description.
 */
export type Subscriber = (notification: Notification) => void

export class NotificationHub {
  private static _instance: NotificationHub | null = null
  private readonly subscribers: Map<number, Set<Subscriber>> = new Map()

  private constructor() {}

  public static getInstance(): NotificationHub {
    if (!NotificationHub._instance) {
      NotificationHub._instance = new NotificationHub()
    }
    return NotificationHub._instance
  }

  /** Only used by tests to give each test an isolated hub. */
  public static resetInstance(): void {
    NotificationHub._instance = null
  }

  public subscribe(userId: number, subscriber: Subscriber): () => void {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new NotificationError(
        'INVALID_USER_ID',
        'userId must be a positive integer',
      )
    }
    let bucket = this.subscribers.get(userId)
    if (!bucket) {
      bucket = new Set<Subscriber>()
      this.subscribers.set(userId, bucket)
    }
    bucket.add(subscriber)
    return () => this.unsubscribe(userId, subscriber)
  }

  public unsubscribe(userId: number, subscriber: Subscriber): void {
    const bucket = this.subscribers.get(userId)
    if (!bucket) return
    bucket.delete(subscriber)
    if (bucket.size === 0) this.subscribers.delete(userId)
  }

  public publish(notification: Notification): void {
    const bucket = this.subscribers.get(notification.userId)
    if (!bucket || bucket.size === 0) return
    for (const subscriber of bucket) {
      try {
        subscriber(notification)
      } catch (error) {
        console.error(
          `[notifications] subscriber for user ${notification.userId} threw:`,
          error,
        )
      }
    }
  }

  /** Number of currently subscribed controllers (test-only diagnostic). */
  public subscriberCount(userId: number): number {
    return this.subscribers.get(userId)?.size ?? 0
  }
}

// ---------- Event-creation helpers ----------------------------------------
/**
 * Convenience functions for triggering notifications from server code
 * (routes/workers). Each helper accepts the IDs the route already has, so
 * call sites don't have to construct title/message boilerplate.
 *
 * The wiring into escrow.create / milestones.submit / escrow.release /
 * dispute.resolve routes is explicitly out of scope for this PR — a follow-up
 * PR will thread these calls into the relevant route handlers. The helpers
 * keep that follow-up small (one line of code per site).
 */

export async function notifyContractCreated(
  clientId: number,
  freelancerId: number,
  contractId: number,
  title: string,
): Promise<void> {
  await Promise.all([
    createNotification({
      userId: clientId,
      title,
      message: `${title} contract #${contractId} is created.`,
      type: 'info',
      eventType: 'contract_created',
      payload: { contractId },
    }),
    createNotification({
      userId: freelancerId,
      title,
      message: `${title} contract #${contractId} is created.`,
      type: 'info',
      eventType: 'contract_created',
      payload: { contractId },
    }),
  ])
}

export async function notifyMilestoneSubmitted(
  clientId: number,
  milestoneId: number,
  title: string,
): Promise<void> {
  await createNotification({
    userId: clientId,
    title,
    message: `Milestone "${title}" (#${milestoneId}) is waiting for your review.`,
    type: 'info',
    eventType: 'milestone_submitted',
    payload: { milestoneId },
  })
}

export async function notifyMilestoneApproved(
  freelancerId: number,
  milestoneId: number,
  title: string,
): Promise<void> {
  await createNotification({
    userId: freelancerId,
    title: 'Milestone Approved',
    message: `Milestone "${title}" (#${milestoneId}) was approved.`,
    type: 'success',
    eventType: 'milestone_approved',
    payload: { milestoneId },
  })
}

export async function notifyEscrowReleased(
  clientId: number,
  freelancerId: number | null,
  contractId: number,
  amount: string,
  currency: string,
): Promise<void> {
  const updates: Array<Promise<Notification>> = [
    createNotification({
      userId: clientId,
      title: 'Escrow Released',
      message: `${amount} ${currency} released for contract #${contractId}.`,
      type: 'success',
      eventType: 'escrow_released',
      payload: { contractId, amount, currency },
    }),
  ]
  if (typeof freelancerId === 'number' && freelancerId > 0) {
    updates.push(
      createNotification({
        userId: freelancerId,
        title: 'Payment Received',
        message: `You received ${amount} ${currency} for contract #${contractId}.`,
        type: 'success',
        eventType: 'escrow_released',
        payload: { contractId, amount, currency },
      }),
    )
  }
  await Promise.all(updates)
}

export async function notifyDisputeCreated(
  counterpartyId: number,
  disputeId: number,
  contractId: number,
): Promise<void> {
  await createNotification({
    userId: counterpartyId,
    title: 'Dispute Opened',
    message: `A dispute (#${disputeId}) was opened on contract #${contractId}.`,
    type: 'warning',
    eventType: 'dispute_created',
    payload: { disputeId, contractId },
  })
}
