import type { SorobanEventPayload, SyncQueueItem, SyncStatus } from './types'
import { getDefaultMaxRetries, getBackoffDelay } from './types'

export type QueueHandler = (item: SyncQueueItem) => Promise<void>

export interface SyncQueueOptions {
  maxRetries?: number
  concurrency?: number
  pollIntervalMs?: number
}

export class SyncQueue {
  private items: Map<string, SyncQueueItem> = new Map()
  private processing = new Set<string>()
  private handler: QueueHandler | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly maxRetries: number
  private readonly concurrency: number
  private readonly pollIntervalMs: number
  private deadLetters: SyncQueueItem[] = []

  constructor(options: SyncQueueOptions = {}) {
    this.maxRetries = options.maxRetries ?? getDefaultMaxRetries()
    this.concurrency = options.concurrency ?? 3
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000
  }

  enqueue(payload: SorobanEventPayload): string {
    const id = `${payload.txHash}:${payload.event}:${payload.milestoneId ?? 0}`
    if (this.items.has(id)) return id

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
  }

  private async processBatch(): Promise<void> {
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
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    this.processing.add(item.id)
    item.status = 'processing'

    try {
      await this.handler!(item)
      item.status = 'success'
      this.items.delete(item.id)
    } catch (err) {
      item.retryCount++
      const message = err instanceof Error ? err.message : String(err)
      item.lastError = message

      if (item.retryCount >= this.maxRetries) {
        item.status = 'dead_letter'
        this.deadLetters.push({ ...item })
        this.items.delete(item.id)
      } else {
        item.status = 'pending'
        item.nextRetryAt = Date.now() + getBackoffDelay(item.retryCount)
      }
    } finally {
      this.processing.delete(item.id)
    }
  }
}
