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

  it('calls onRetry with the item and error message when a retry is scheduled', async () => {
    const onRetry = vi.fn()
    const retryQueue = new SyncQueue({ maxRetries: 3, concurrency: 2, pollIntervalMs: 100, onRetry })
    retryQueue.setHandler(async () => {
      throw new Error('transient failure')
    })

    retryQueue.enqueue(makePayload({ txHash: 'retry001' }))
    retryQueue.start()
    await vi.advanceTimersByTimeAsync(100)
    retryQueue.stop()

    expect(onRetry).toHaveBeenCalledTimes(1)
    const [item, error] = onRetry.mock.calls[0]
    expect(item.id).toBe('retry001:fund:0')
    expect(item.retryCount).toBe(1)
    expect(error).toBe('transient failure')
  })

  it('calls onDeadLetter once retries are exhausted, and does not call onRetry for that attempt', async () => {
    const onRetry = vi.fn()
    const onDeadLetter = vi.fn()
    const dlQueue = new SyncQueue({ maxRetries: 1, concurrency: 2, pollIntervalMs: 100, onRetry, onDeadLetter })
    dlQueue.setHandler(async () => {
      throw new Error('fatal')
    })

    dlQueue.enqueue(makePayload({ txHash: 'dead002' }))
    dlQueue.start()
    await vi.advanceTimersByTimeAsync(100)
    dlQueue.stop()

    expect(onRetry).not.toHaveBeenCalled()
    expect(onDeadLetter).toHaveBeenCalledTimes(1)
    expect(onDeadLetter.mock.calls[0][0].id).toBe('dead002:fund:0')
    expect(onDeadLetter.mock.calls[0][0].status).toBe('dead_letter')
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
