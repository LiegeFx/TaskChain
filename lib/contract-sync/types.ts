export type SorobanContractEvent =
  | 'init'
  | 'fund'
  | 'submit'
  | 'approve'
  | 'confirm'
  | 'release'
  | 'refund'
  | 'dispute'
  | 'resolve'
  | 'expire'

export type SyncStatus = 'pending' | 'processing' | 'success' | 'failed' | 'dead_letter'

export interface SorobanEventPayload {
  event: SorobanContractEvent
  contractAddress: string
  ledgerSequence: number
  timestamp: number
  txHash: string
  data: unknown[]
  milestoneId?: number
  amount?: string
}

export interface ContractSyncLog {
  id: string
  contractId: string | null
  milestoneId: string | null
  eventType: SorobanContractEvent
  txHash: string | null
  ledgerSequence: number | null
  status: SyncStatus
  errorMessage: string | null
  retryCount: number
  rawPayload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SyncQueueItem {
  id: string
  payload: SorobanEventPayload
  retryCount: number
  maxRetries: number
  lastError: string | null
  nextRetryAt: number
  status: SyncStatus
}

export function getDefaultMaxRetries(): number {
  return 5
}

export function getBackoffDelay(retryCount: number): number {
  return Math.min(1000 * Math.pow(2, retryCount), 60_000)
}

/**
 * Stable identity for a single on-chain event, shared by the in-memory queue
 * and the `contract_sync_log` audit table. Used to guarantee at-most-once
 * processing even across process restarts (the queue alone only dedupes
 * while an item is in memory).
 */
export function buildSyncDedupeKey(
  payload: Pick<SorobanEventPayload, 'txHash' | 'event' | 'milestoneId'>
): string {
  return `${payload.txHash}:${payload.event}:${payload.milestoneId ?? 0}`
}

export const ESCROW_EVENT_TOPIC_PREFIX = 'escrow_event'
