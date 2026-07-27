import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  sql: Object.assign(vi.fn(), { unsafe: vi.fn() }),
}))

const { mockGetLatestLedger, mockGetEvents, MockSorobanServer } = vi.hoisted(() => {
  const mGetLatestLedger = vi.fn().mockResolvedValue({ sequence: 100 })
  const mGetEvents = vi.fn().mockResolvedValue({ events: [] })

  const MServer = class {
    getLatestLedger = mGetLatestLedger
    getEvents = mGetEvents
  }

  return {
    mockGetLatestLedger: mGetLatestLedger,
    mockGetEvents: mGetEvents,
    MockSorobanServer: MServer,
  }
})

vi.mock('@stellar/stellar-sdk', () => ({
  default: MockSorobanServer,
}))

import { sql } from '@/lib/db'
import { ContractSyncService } from '@/lib/contract-sync/service'
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

describe('ContractSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('onEvent (duplicate protection)', () => {
    it('skips enqueueing an event that was already synced successfully', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      const enqueueSpy = vi.spyOn(service.getQueue(), 'enqueue')

      ;(sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ '?column?': 1 }])

      await (service as any).onEvent(makePayload())

      expect(enqueueSpy).not.toHaveBeenCalled()
      expect(sql).toHaveBeenCalledTimes(1)
    })

    it('enqueues and logs an event that has not been synced before', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      const enqueueSpy = vi.spyOn(service.getQueue(), 'enqueue')

      ;(sql as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // isAlreadySynced -> not found
        .mockResolvedValueOnce([]) // createSyncLog insert

      await (service as any).onEvent(makePayload({ txHash: 'new-tx' }))

      expect(enqueueSpy).toHaveBeenCalledWith(expect.objectContaining({ txHash: 'new-tx' }))
      expect(sql).toHaveBeenCalledTimes(2)
    })
  })

  describe('checkpoint persistence', () => {
    it('loadCheckpoint returns null when no row exists', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      ;(sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await (service as any).loadCheckpoint()
      expect(result).toBeNull()
    })

    it('loadCheckpoint returns the persisted ledger as a number', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      ;(sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ last_ledger: '4242' }])

      const result = await (service as any).loadCheckpoint()
      expect(result).toBe(4242)
    })

    it('persistCheckpoint issues an upsert', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      ;(sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      await (service as any).persistCheckpoint(555)
      expect(sql).toHaveBeenCalledTimes(1)
    })

    it('start() seeds the listener from a persisted checkpoint instead of the chain tip', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'] })
      ;(sql as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ last_ledger: '777' }])

      await service.start()
      service.stop()

      expect(mockGetLatestLedger).not.toHaveBeenCalled()
    })
  })

  describe('failure / dead-letter audit logging', () => {
    it('records a failed sync attempt with the error message on retry', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'], maxRetries: 5 })
      const updateSpy = vi.spyOn(service as any, 'updateSyncLog').mockResolvedValue(undefined)

      const queue = service.getQueue()
      queue.setHandler(async () => {
        throw new Error('boom')
      })

      vi.useFakeTimers()
      queue.enqueue(makePayload({ txHash: 'fail-tx' }))
      queue.start()
      await vi.advanceTimersByTimeAsync(1000)
      queue.stop()
      vi.useRealTimers()

      expect(updateSpy).toHaveBeenCalledWith(
        'fail-tx:fund:0',
        expect.objectContaining({ status: 'failed', errorMessage: 'boom' })
      )
    })

    it('records dead_letter status once retries are exhausted', async () => {
      const service = new ContractSyncService({ contractAddresses: ['CA1'], maxRetries: 1 })
      const updateSpy = vi.spyOn(service as any, 'updateSyncLog').mockResolvedValue(undefined)

      const queue = service.getQueue()
      queue.setHandler(async () => {
        throw new Error('permanent failure')
      })

      vi.useFakeTimers()
      queue.enqueue(makePayload({ txHash: 'dead-tx' }))
      queue.start()
      await vi.advanceTimersByTimeAsync(1000)
      queue.stop()
      vi.useRealTimers()

      expect(updateSpy).toHaveBeenCalledWith(
        'dead-tx:fund:0',
        expect.objectContaining({ status: 'dead_letter', errorMessage: 'permanent failure' })
      )
    })
  })
})
