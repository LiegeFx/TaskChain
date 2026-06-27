import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import {
  NotificationError,
  NotificationHub,
  type Notification,
} from '@/lib/notifications'
import {
  withAuth,
  AuthContext,
  resolveUserIdByWallet as resolveUserId,
} from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEEP_ALIVE_MS = 25_000

/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events stream that pushes notifications for the authenticated
 * user in real time. The connection also emits a keep-alive comment every
 * 25 s so reverse proxies don't close idle sockets.
 *
 * Event format:
 *   id: <notification-id>
 *   event: notification
 *   data: { "id": <number>, "userId": <number>, "title": "...", ... }
 *
 * Query parameters:
 *   lastEventId  Optional. Reserved for future replay support — when the
 *                 client reconnects with the last id it saw, we can replay
 *                 buffered events. The in-process hub currently has no
 *                 persistent buffer, so we deliberately do NOT parse it
 *                 yet (no replay is performed until the buffer ships).
 *
 * Status codes:
 *   200 stream open
 *   401 missing/invalid auth
 *   500 if the runtime cannot construct a TextEncoder/Stream
 */
export const GET = withAuth(async (request: NextRequest, auth: AuthContext) => {
  try {
    const userId = await resolveUserId(auth.walletAddress)
    if (userId === null) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 },
      )
    }

    void request // reserved for future lastEventId replay parameter

    const encoder = new TextEncoder()
    const hub = NotificationHub.getInstance()

    // Per-stream state shared by the `start` and `cancel` paths. Using an
    // interface + arrow-function assignment (rather than an object-literal
    // method) keeps `this` unambiguous and resilient against future
    // refactors that pass `state.release` around.
    interface StreamState {
      unsub: null | (() => void)
      keepAlive: null | ReturnType<typeof setInterval>
      closed: boolean
      release: () => void
    }
    const state: StreamState = {
      unsub: null,
      keepAlive: null,
      closed: false,
      release: () => undefined,
    }
    state.release = () => {
      if (state.closed) return
      state.closed = true
      if (state.unsub) state.unsub()
      if (state.keepAlive) clearInterval(state.keepAlive)
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (eventName: string, data: unknown, id?: number): void => {
          try {
            const lines: string[] = []
            if (id !== undefined) lines.push(`id: ${id}`)
            lines.push(`event: ${eventName}`)
            lines.push(`data: ${JSON.stringify(data)}`)
            lines.push('', '')
            controller.enqueue(encoder.encode(lines.join('\n')))
          } catch (error) {
            console.error('[notifications] SSE enqueue failed:', error)
          }
        }

        send('hello', { ts: new Date().toISOString(), tag: randomUUID() })

        state.unsub = hub.subscribe(userId, (notification: Notification) => {
          send('notification', notification, notification.id)
        })

        state.keepAlive = setInterval(() => {
          try {
            controller.enqueue(
              encoder.encode(`: keep-alive ${Date.now()}\n\n`),
            )
          } catch {
            // Controller is already closed; the release path will fire.
          }
        }, KEEP_ALIVE_MS)

        // Underlying socket closed.
        request.signal.addEventListener('abort', () => {
          state.release()
          try {
            controller.close()
          } catch {
            // already closed
          }
        })
      },
      cancel() {
        // Consumer cancelled the body of the response (e.g. EventSource
        // closed). Same release path: unsubscribe from the hub and clear
        // the keep-alive interval.
        state.release()
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    if (error instanceof NotificationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      )
    }
    console.error('Failed to open notification stream:', error)
    return NextResponse.json(
      { error: 'Unable to open stream', code: 'STREAM_FAILED' },
      { status: 500 },
    )
  }
})
