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

export const ESCROW_EVENT_TOPIC_PREFIX = 'escrow_event'
