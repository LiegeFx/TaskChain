import type { SorobanEventPayload, SyncQueueItem, SyncStatus } from './types'
import { getDefaultMaxRetries, getBackoffDelay, buildSyncDedubeKey } from './types'

export type QueueHandler = (item: SyncQueueItem) => Promise<void>
export type QueueRetryHandler = (item: SyncQueueItem, error: string) => void
export type QueueDeadLetterHandler = (item: SyncQueueItem) => void

export interface SyncQueueOptions {
  maxRetries?: number
  concurrency?: number
  pollIntervalMs?: number
  /** Called every time an item fails but will still be retried. */
  onRetry?: QueueRetryHandler
  /** Called once an item exhausts all retries and is moved to the dead letter queue. */
  onDeadLetter?: QueueDeadLetterHandler
}

export class SyncQueue {
  private items: Map<string, SyncQueueItem> = new Map()
  private processing = new Set<string>()
  private completed = new Set<string>()
  private processingBatch = false
  private handler: QueueHandler | null = null
  private timer: ReturnType<of setInterval> | null = null
  private readonly maxRetries: number
  private readonly concurrency: number
  private readonly pollIntervalMs: number
  private readonly onRetry: QueueRetryHandler | null
  private readonly onDeadLetter: QueueDeadLetterHandler | null
  private deadLetters: SyncQueueItem[] = []

  constructor(options: SyncQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? getDefaultMaxRetries()
    this.concurrency = options.concurrency ?? 3
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
    this.onRetry = options.onRetry ?? null
    this.onDeadLetter = options.onDeadLetter ?? null
  }

  enqueue(payload: SorobanEventPayload): string {
    const id = buildSyncDedupeKey(payload)
    if (this.items.has(id) || this.completed.has(id)) return id

    const item: SyncQueueItem = {
      id,
      payload,
      retryCount: 0,
      maxRetries: this.maxRetries,
      lastError: null,
      nextRetryAt: Date.now(),
      status: 'pending',
    }

    this.items.set(id, item)
    return id
  }

  setHandler(handler: QueueHandler): void {
    this.handler = handler
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.processBatch(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get pendingCount(): number {
    let count = 0
    for (const item of this.items.values()) {
      if (item.status === 'pending' && item.nextRetryAt <= Date.now()) {
        if (!this.processing.has(item.id)) {
          count++
        }
      }
    }
    return count
  }

  get deadLetterCount(): number {
    return this.deadLetters.length
  }

  getDeadLetters(): SyncQueueItem[] {
    return [...this.deadLetters]
  }

  getAll(): SyncQueueItem[] {
    return Array.from(this.items.values())
  }

  clear(): void {
    this.items.clear()
    this.processing.clear()
    this.deadLetters = []
    this.completed.clear()
  }

  private async processBatch(): Promise<void> {
    if (this.processingBatch) return
    this.processingBatch = true
    try {
      if (!this.handler) return

      const available: SyncQueueItem[] = []
      for (const item of this.items.values()) {
        if (available.length >= this.concurrency) break
        if (item.status === 'pending' && item.nextRetryAt <= Date.now()) {
          if (!this.processing.has(item.id)) {
            available.push(item)
          }
        }
      }

      await Promise.allSettled(
        available.map((item) => this.processItem(item))
      )
    } finally {
      this.processingBatch = false
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    this.processing.add(item.id)
    item.status = 'processing'

    try {
      await this.handler!(item)
      item.status = 'success'
      this.completed.add(item.id)
      this.items.delete(item.id)
    } catch (err) {
      item.retryCount++
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : ''
      item.lastError = stack ? `${message}\n${stack}` : message

      if (item.retryCount >= this.maxRetries) {
        item.status = 'dead_letter'
        this.deadLetters.push({ ...item })
        this.items.delete(item.id)
        this.onDeadLetter?.({ ...item })
      } else {
        item.status = 'pending'
        item.nextRetryAt = Date.now() + getBackoffDelay(item.retryCount)
        this.onRetry?.({ ...item }, message)
      }
    } finally {
      this.processing.delete(item.id)
    }
  }
}
