import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SyncQueue } from '@/lib/contract-sync/queue'
import { getBackoffDelay } from '@/lib/contract-sync/types'
import type { SorobanEventPayload } from '@/lib/contract-sync/types'

function makePayload(overrides: Partial<SorobanEventPayload> = {}): SorobanEventPayload {
  return {
    event: 'fund',
    contractAddress: 'CA1234',
    ledgerSequence: 1000,
    timestamp: Date.now(),
    txHash: 'abc123',
    data: [],
    ...overrides,
  }
}

describe('getBackoffDelay', () => {
  it('returns 1000ms for retry 0', () => {
    expect(getBackoffDelay(0)).toBe(1000)
  })

  it('returns 2000ms for retry 1', () => {
    expect(getBackoffDelay(1)).toBe(2000)
  })

  it('returns 4000ms for retry 2', () => {
    expect(getBackoffDelay(2)).toBe(4000)
  })

  it('caps at 60000ms', () => {
    expect(getBackoffDelay(6)).toBe(60000)
    expect(getBackoffDelay(10)).toBe(60000)
  })
})

describe('SyncQueue', () => {
  let queue: SyncQueue
  let handler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    handler = vi.fn()
    queue = new SyncQueue({ maxRetries: 3, concurrency: 2, pollIntervalMs: 100 })
    queue.setHandler(handler as any)
  })

  afterEach(() => {
    queue.stop()
    vi.useRealTimers()
  })

  it('enqueues an item and processes it on next poll', async () => {
    handler.mockResolvedValue(undefined)
    const payload = makePayload()

    const id = queue.enqueue(payload)
    expect(id).toBe('abc123:fund:0')

    queue.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(queue.pendingCount).toBe(0)
  })

  it('calls handler with queue item containing correct fields', async () => {
    let capturedItem: any = null
    handler.mockImplementation(async (item: any) => { capturedItem = item })

    queue.enqueue(makePayload())
    queue.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(capturedItem).not.toBeNull()
    expect(capturedItem.id).toBe('abc123:fund:0')
    expect(capturedItem.retryCount).toBe(0)
    expect(capturedItem.payload.event).toBe('fund')
  })

  it('deduplicates identical events', () => {
    const payload = makePayload()
    const id1 = queue.enqueue(payload)
    const id2 = queue.enqueue(payload)
    expect(id1).toBe(id2)
    expect(queue.getAll().length).toBe(1)
  })

  it('moves to dead letter after max retries', async () => {
    handler.mockRejectedValue(new Error('Permanent failure'))
    const payload = makePayload({ txHash: 'dead001' })

    queue.enqueue(payload)
    queue.start()

    // Cycle through all retries: first call + 3 retries
    // The queue polls every 100ms and retries after backoff:
    // retry 1 after 1000ms, retry 2 after 2000ms, retry 3 after 4000ms
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(1000)
    }

    expect(queue.deadLetterCount).toBe(1)
    const deadLetters = queue.getDeadLetters()
    expect(deadLetters[0].status).toBe('dead_letter')
    expect(deadLetters[0].lastError).toBe('Permanent failure')
    expect(deadLetters[0].retryCount).toBeGreaterThanOrEqual(3)
  })

  it('returns empty dead letters when all succeed', async () => {
    handler.mockResolvedValue(undefined)

    queue.enqueue(makePayload())
    queue.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(queue.deadLetterCount).toBe(0)
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    const inProgress = new Set<string>()

    handler.mockImplementation(async (item: any) => {
      inProgress.add(item.id)
      maxConcurrent = Math.max(maxConcurrent, inProgress.size)
      await new Promise((r) => setTimeout(r, 500))
      inProgress.delete(item.id)
    })

    queue.enqueue(makePayload({ txHash: 'a' }))
    queue.enqueue(makePayload({ txHash: 'b' }))
    queue.enqueue(makePayload({ txHash: 'c' }))

    queue.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('clears all items', () => {
    queue.enqueue(makePayload())
    queue.enqueue(makePayload({ txHash: 'xyz' }))
    expect(queue.getAll().length).toBe(2)

    queue.clear()
    expect(queue.getAll().length).toBe(0)
    expect(queue.deadLetterCount).toBe(0)
  })

  it('stops processing when stopped', async () => {
    handler.mockResolvedValue(undefined)

    queue.enqueue(makePayload())
    queue.start()
    await vi.advanceTimersByTimeAsync(100)
    expect(handler).toHaveBeenCalledTimes(1)

    queue.stop()

    queue.enqueue(makePayload({ txHash: 'after-stop' }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('tracks items in the items map after enqueue', async () => {
    handler.mockRejectedValue(new Error('fail'))
    const payload = makePayload()

    queue.enqueue(payload)
    expect(queue.getAll().length).toBe(1)

    queue.start()
    await vi.advanceTimersByTimeAsync(100)

    // Item remains in map after failure (will be retried)
    expect(queue.getAll().length).toBe(1)
  })
})
