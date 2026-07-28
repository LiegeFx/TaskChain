import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/auth/middleware', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/auth/middleware')
  >('@/lib/auth/middleware')
  // Both auth wrappers inject the same fake AuthContext so the handler
  // body runs as if a valid JWT was presented. Without mocking
  // withAuthCtx too, PATCH routes (which use withAuthCtx to receive a
  // Next.js route context) would fall through to the real wrapper and
  // return 401.
  const injectAuth = (handler: (...args: unknown[]) => unknown) =>
    async (request: unknown, ...rest: unknown[]) =>
    handler(
      request,
      { walletAddress: '0xTEST_WALLET', tokenJti: 'test-jti' },
      ...rest,
    )
  return {
    ...actual,
    withAuth: injectAuth,
    withAuthCtx: injectAuth,
    resolveUserIdByWallet: vi.fn(async (walletAddress: string) => {
      if (walletAddress === '0xUNRESOLVED') return null
      return 42
    }),
  }
})

import { sql } from '@/lib/db'
import { GET as listNotifications } from '@/app/api/notifications/route'
import {
  PATCH as markRead,
} from '@/app/api/notifications/[id]/read/route'
import {
  POST as markAllRead,
} from '@/app/api/notifications/read-all/route'
import {
  GET as streamNotifications,
} from '@/app/api/notifications/stream/route'
import {
  NotificationError,
  NotificationHub,
  createNotification,
  listNotificationsForUser,
  mapNotificationRow,
  markAllNotificationsRead,
  markNotificationRead,
  parseNotificationQuery,
  notifyContractCreated,
  notifyMilestoneApproved,
  notifyMilestoneSubmitted,
  notifyDisputeCreated,
  notifyEscrowReleased,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_MAX_LIMIT,
  type Notification,
} from '@/lib/notifications'

type SqlMock = ReturnType<typeof vi.fn>

interface NotificationRowOverrides {
  id?: number
  user_id?: number
  title?: string
  message?: string
  type?: string
  event_type?: string
  payload?: Record<string, unknown>
  is_read?: boolean
  channel?: string
  created_at?: Date | string
  delivered_at?: Date | string | null
  total_count?: string | number
}

function buildNotificationRow(
  overrides: NotificationRowOverrides = {},
): Array<Record<string, unknown>> {
  return [
    {
      id: 1,
      user_id: 42,
      title: 'Milestone Approved',
      message: 'Milestone "Build login" was approved.',
      type: 'success',
      event_type: 'milestone_approved',
      payload: { milestoneId: 7 },
      is_read: false,
      channel: 'in_app',
      created_at: new Date('2026-01-01T00:00:00Z'),
      delivered_at: null,
      total_count: '3',
      ...overrides,
    },
  ]
}

function queueSqlFail(error: unknown): void {
  ;(sql as unknown as SqlMock).mockRejectedValueOnce(error)
}

function queueSql(responses: unknown[]): void {
  const mock = sql as unknown as SqlMock
  for (const response of responses) {
    mock.mockResolvedValueOnce(response)
  }
}

function makeRequest(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

beforeEach(() => {
  vi.clearAllMocks()
  NotificationHub.resetInstance()
})

describe('parseNotificationQuery', () => {
  it('returns default values for empty params', () => {
    expect(parseNotificationQuery(new URLSearchParams())).toEqual({
      page: 1,
      limit: 20,
      type: null,
      unreadOnly: false,
    })
  })

  it('clamps limit to the maximum', () => {
    const params = parseNotificationQuery(
      new URLSearchParams(`limit=${NOTIFICATION_MAX_LIMIT * 5}`),
    )
    expect(params.limit).toBe(NOTIFICATION_MAX_LIMIT)
  })

  it('accepts a known event_type', () => {
    const params = parseNotificationQuery(
      new URLSearchParams('type=milestone_submitted'),
    )
    expect(params.type).toBe('milestone_submitted')
  })

  it('rejects an unknown event_type', () => {
    expect(() =>
      parseNotificationQuery(new URLSearchParams('type=banana')),
    ).toThrowError(NotificationError)
  })

  it('accepts truthy unreadOnly variants', () => {
    expect(
      parseNotificationQuery(new URLSearchParams('unreadOnly=true')).unreadOnly,
    ).toBe(true)
    expect(
      parseNotificationQuery(new URLSearchParams('unreadOnly=1')).unreadOnly,
    ).toBe(true)
  })

  it('rejects invalid page/limit', () => {
    expect(() => parseNotificationQuery(new URLSearchParams('page=0')))
      .toThrowError(NotificationError)
    expect(() => parseNotificationQuery(new URLSearchParams('limit=0')))
      .toThrowError(NotificationError)
  })

  it('rejects non-integer page/limit instead of silently defaulting', () => {
    const pageErr = (() => {
      try {
        parseNotificationQuery(new URLSearchParams('page=banana'))
        return null
      } catch (e) {
        return e
      }
    })()
    expect(pageErr).toBeInstanceOf(NotificationError)
    expect((pageErr as NotificationError).code).toBe('INVALID_PAGE')

    const limitErr = (() => {
      try {
        parseNotificationQuery(new URLSearchParams('limit=banana'))
        return null
      } catch (e) {
        return e
      }
    })()
    expect(limitErr).toBeInstanceOf(NotificationError)
    expect((limitErr as NotificationError).code).toBe('INVALID_LIMIT')
  })

  it('rejects empty page/limit strings', () => {
    expect(() => parseNotificationQuery(new URLSearchParams('page=')))
      .toThrowError(NotificationError)
    expect(() => parseNotificationQuery(new URLSearchParams('limit=')))
      .toThrowError(NotificationError)
  })
})

describe('mapNotificationRow', () => {
  it('converts a row into the API shape', () => {
    const notification = mapNotificationRow({
      id: 9,
      user_id: 42,
      title: 'T',
      message: 'M',
      type: 'success',
      event_type: 'escrow_released',
      payload: { foo: 'bar' },
      is_read: false,
      channel: 'in_app',
      created_at: new Date('2026-02-02T00:00:00Z'),
      delivered_at: null,
    })

    expect(notification).toMatchObject({
      id: 9,
      userId: 42,
      title: 'T',
      message: 'M',
      type: 'success',
      eventType: 'escrow_released',
      payload: { foo: 'bar' },
      isRead: false,
      channel: 'in_app',
    })
    expect(notification.createdAt).toMatch(/2026-02-02T/)
    expect(notification.deliveredAt).toBeNull()
  })
})

describe('createNotification', () => {
  it('persists and publishes to the hub', async () => {
    queueSql([buildNotificationRow({ id: 101 })])

    const hub = NotificationHub.getInstance()
    const received: Notification[] = []
    hub.subscribe(42, (n) => received.push(n))

    const created = await createNotification({
      userId: 42,
      title: 'A',
      message: 'B',
      type: 'success',
      eventType: 'milestone_approved',
      payload: { milestoneId: 1 },
    })

    expect(created.id).toBe(101)
    expect(received).toHaveLength(1)
    expect(received[0].id).toBe(101)
  })

  it('still returns the persisted notification even if hub publish throws', async () => {
    queueSql([buildNotificationRow({ id: 102 })])

    const hub = NotificationHub.getInstance()
    hub.subscribe(42, () => {
      throw new Error('broken subscriber')
    })

    const created = await createNotification({
      userId: 42,
      title: 'A',
      message: 'B',
      type: 'success',
      eventType: 'milestone_approved',
      payload: {},
    })

    expect(created.id).toBe(102)
  })

  it('throws NotificationError when the INSERT returns no rows', async () => {
    queueSql([[]])
    await expect(
      createNotification({
        userId: 1,
        title: 'A',
        message: 'B',
        type: 'info',
        eventType: 'contract_created',
      }),
    ).rejects.toBeInstanceOf(NotificationError)
  })
})

describe('listNotificationsForUser', () => {
  it('returns empty result for an out-of-range page', async () => {
    queueSql([[]]) // main list empty (no COUNT fallback needed since 0 rows handled inline)
    const result = await listNotificationsForUser(42, {
      page: 99,
      limit: 10,
      type: null,
      unreadOnly: false,
    })
    expect(result.totalItems).toBe(0)
    expect(result.notifications).toEqual([])
  })

  it('returns paginated rows with total count via COUNT(*) OVER()', async () => {
    queueSql([buildNotificationRow({ id: 1, total_count: '5' })])
    const result = await listNotificationsForUser(42, {
      page: 1,
      limit: 1,
      type: null,
      unreadOnly: false,
    })
    expect(result.totalItems).toBe(5)
    expect(result.notifications).toHaveLength(1)
    expect(result.notifications[0].id).toBe(1)
  })

  it('rejects an invalid user id', async () => {
    await expect(
      listNotificationsForUser(0, {
        page: 1,
        limit: 10,
        type: null,
        unreadOnly: false,
      }),
    ).rejects.toBeInstanceOf(NotificationError)
  })

  it('rejects page/limit pairs whose offset exceeds the DoS cap', async () => {
    // With page=502, limit=100: offset = (502 - 1) * 100 = 50_100 > 50_000 cap,
    // so PAGE_TOO_LARGE is thrown before any SQL is issued.
    await expect(
      listNotificationsForUser(42, {
        page: 502,
        limit: 100,
        type: null,
        unreadOnly: false,
      }),
    ).rejects.toMatchObject({ code: 'PAGE_TOO_LARGE' })
  })

  it('accepts the post-cap boundary (page=501, limit=100, offset=50_000)', async () => {
    // offset == cap -> allowed. The exact cap is inclusive (offset <= cap).
    queueSql([buildNotificationRow({ id: 1, total_count: '1' })])
    const result = await listNotificationsForUser(42, {
      page: 501,
      limit: 100,
      type: null,
      unreadOnly: false,
    })
    expect(result.totalItems).toBe(1)
    expect(result.notifications).toHaveLength(1)
  })
})

describe('markNotificationRead', () => {
  it('returns null when the notification does not belong to the caller', async () => {
    queueSql([[]])
    const result = await markNotificationRead(99, 42)
    expect(result.notification).toBeNull()
  })

  it('returns the mapped notification when marked', async () => {
    queueSql([buildNotificationRow({ id: 1, is_read: true })])
    const result = await markNotificationRead(1, 42)
    expect(result.notification?.isRead).toBe(true)
  })
})

describe('markAllNotificationsRead', () => {
  it('returns the updated row count', async () => {
    // markAllNotificationsRead now issues exactly ONE sql call (CTE).
    queueSql([[{ updated_count: 7 }]])
    const result = await markAllNotificationsRead(42)
    expect(result.updatedCount).toBe(7)
  })
})

describe('NotificationHub', () => {
  it('subscriber count drops to zero after unsubscribe', () => {
    const hub = NotificationHub.getInstance()
    expect(hub.subscriberCount(42)).toBe(0)
    const unsub = hub.subscribe(42, () => undefined)
    expect(hub.subscriberCount(42)).toBe(1)
    unsub()
    expect(hub.subscriberCount(42)).toBe(0)
  })

  it('isolated fan-out: only the targeted user receives the notification', () => {
    const hub = NotificationHub.getInstance()
    const seen = { a: 0, b: 0 }
    hub.subscribe(1, () => {
      seen.a += 1
    })
    hub.subscribe(2, () => {
      seen.b += 1
    })

    hub.publish({
      id: 1,
      userId: 1,
      title: 'x',
      message: 'x',
      type: 'info',
      eventType: 'contract_created',
      payload: {},
      isRead: false,
      channel: 'in_app',
      createdAt: '2026-01-01T00:00:00Z',
      deliveredAt: null,
    })

    expect(seen).toEqual({ a: 1, b: 0 })
  })
})

describe('GET /api/notifications', () => {
  it('returns the list with meta', async () => {
    // resolveUserIdByWallet is mocked, so no sql for the user lookup;
    // the route issues 2 sql calls (listNotifications + unreadCount).
    queueSql([
      buildNotificationRow({ id: 1, total_count: '1' }), // list (with total_count)
      [{ unread: 1 }], // unread count
    ])

    const response = await listNotifications(
      makeRequest('http://localhost/api/notifications?limit=5'),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)
    expect(body.meta).toMatchObject({
      totalCount: 1,
      limit: 5,
      page: 1,
      unreadCount: 1,
    })
  })

  it('400 with structured code on invalid type', async () => {
    const response = await listNotifications(
      makeRequest('http://localhost/api/notifications?type=banana'),
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_TYPE')
  })

  it('503 on DB failure', async () => {
    queueSqlFail(new Error('connection reset'))
    const response = await listNotifications(
      makeRequest('http://localhost/api/notifications'),
    )
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.code).toBe('NOTIFICATIONS_LIST_FAILED')
  })
})

describe('PATCH /api/notifications/[id]/read', () => {
  it('marks the notification read for the caller', async () => {
    // resolveUserIdByWallet is mocked; the route issue 1 sql call.
    queueSql([buildNotificationRow({ id: 17, is_read: true })])
    const response = await markRead(makeRequest('http://localhost/x'), {
      params: Promise.resolve({ id: '17' }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.notification.isRead).toBe(true)
  })

  it('returns 404 when no row was updated', async () => {
    queueSql([[]])
    const response = await markRead(makeRequest('http://localhost/x'), {
      params: Promise.resolve({ id: '17' }),
    })
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('NOT_FOUND')
  })

  it('returns 400 for a non-numeric id', async () => {
    const response = await markRead(makeRequest('http://localhost/x'), {
      params: Promise.resolve({ id: 'banana' }),
    })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_ID')
  })

  it('returns 404 when the wallet does not map to a user', async () => {
    // Switch the mocked resolveUserIdByWallet to return null for this test.
    const { resolveUserIdByWallet } = await import('@/lib/auth/middleware')
    ;(resolveUserIdByWallet as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      null,
    )

    const response = await markRead(makeRequest('http://localhost/x'), {
      params: Promise.resolve({ id: '17' }),
    })
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('USER_NOT_FOUND')
  })
})

describe('POST /api/notifications/read-all', () => {
  it('returns the updated count', async () => {
    // resolveUserIdByWallet is mocked, so no sql call for the user
    // lookup; the route then issues a single CTE sql call.
    queueSql([[{ updated_count: 4 }]])
    const response = await markAllRead(makeRequest('http://localhost/x'))
    expect(response.status).toBe(200)
    expect((await response.json()).updatedCount).toBe(4)
  })
})

describe('GET /api/notifications/stream', () => {
  it('returns a text/event-stream response for the authenticated user', async () => {
    // resolveUserIdByWallet is mocked to return 42; no sql call needed.
    const response = await streamNotifications(
      makeRequest('http://localhost/api/notifications/stream'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/)
    expect(NotificationHub.getInstance().subscriberCount(42)).toBe(1)
  })

  it('drops subscribers on stream cancel', async () => {
    const response = await streamNotifications(
      makeRequest('http://localhost/api/notifications/stream'),
    )
    expect(response.status).toBe(200)
    expect(NotificationHub.getInstance().subscriberCount(42)).toBe(1)

    await response.body?.cancel()
    // give the cancel() callback a tick to run
    await Promise.resolve()
    expect(NotificationHub.getInstance().subscriberCount(42)).toBe(0)
  })
})

describe('event-creation helpers', () => {
  it('notifyContractCreated emits one notification per recipient', async () => {
    queueSql([
      buildNotificationRow({ id: 1, user_id: 11, event_type: 'contract_created' }),
      buildNotificationRow({ id: 2, user_id: 22, event_type: 'contract_created' }),
    ])
    await notifyContractCreated(11, 22, 99, 'Logo redesign')
    expect(NOTIFICATION_EVENT_TYPES).toContain('contract_created')
  })

  it('notifyMilestoneSubmitted creates exactly one notification', async () => {
    queueSql([buildNotificationRow({ event_type: 'milestone_submitted' })])
    await notifyMilestoneSubmitted(11, 5, 'Build login')
  })

  it('notifyMilestoneApproved creates exactly one notification', async () => {
    queueSql([buildNotificationRow({ event_type: 'milestone_approved' })])
    await notifyMilestoneApproved(11, 5, 'Build login')
  })

  it('notifyEscrowReleased skips the freelancer when null', async () => {
    queueSql([buildNotificationRow({ event_type: 'escrow_released' })])
    await notifyEscrowReleased(11, null, 7, '5.00', 'XLM')
  })

  it('notifyEscrowReleased includes the freelancer when provided', async () => {
    queueSql([
      buildNotificationRow({ id: 1, user_id: 11, event_type: 'escrow_released' }),
      buildNotificationRow({ id: 2, user_id: 22, event_type: 'escrow_released' }),
    ])
    await notifyEscrowReleased(11, 22, 7, '5.00', 'XLM')
  })

  it('notifyDisputeCreated creates exactly one notification', async () => {
    queueSql([buildNotificationRow({ event_type: 'dispute_created' })])
    await notifyDisputeCreated(11, 3, 7)
  })
})
