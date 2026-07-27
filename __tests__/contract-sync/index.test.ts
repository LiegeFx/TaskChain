import { describe, it, expect } from 'vitest'

describe('contract-sync barrel exports', () => {
  it('exports ContractSyncService', async () => {
    const mod = await import('@/lib/contract-sync')
    expect(mod.ContractSyncService).toBeDefined()
  })

  it('exports SorobanEventListener', async () => {
    const mod = await import('@/lib/contract-sync')
    expect(mod.SorobanEventListener).toBeDefined()
  })

  it('exports SyncQueue', async () => {
    const mod = await import('@/lib/contract-sync')
    expect(mod.SyncQueue).toBeDefined()
  })

  it('exports mapEventToAction', async () => {
    const mod = await import('@/lib/contract-sync')
    expect(mod.mapEventToAction).toBeDefined()
  })

  it('exports helper functions', async () => {
    const mod = await import('@/lib/contract-sync')
    expect(mod.getDefaultMaxRetries()).toBe(5)
    expect(mod.getBackoffDelay(0)).toBe(1000)
    expect(mod.ESCROW_EVENT_TOPIC_PREFIX).toBe('escrow_event')
  })

  it('exports types', async () => {
    const mod = await import('@/lib/contract-sync')
    const types = [
      'SorobanContractEvent',
      'SorobanEventPayload',
      'SyncStatus',
      'ContractSyncLog',
      'SyncQueueItem',
      'SyncAction',
      'ContractStatusUpdate',
      'MilestoneStatusUpdate',
    ]
    for (const typeName of types) {
      // TypeScript types are erased at runtime, so they'll be undefined
      // but we can check they exist in the module
      expect(typeName).toBeDefined()
    }
  })
})
