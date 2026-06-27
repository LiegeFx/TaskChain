import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SorobanEventListener } from '@/lib/contract-sync/listener'

const { mockGetLatestLedger, mockGetEvents, MockSorobanServer } = vi.hoisted(() => {
  const mGetLatestLedger = vi.fn()
  const mGetEvents = vi.fn()

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

describe('SorobanEventListener', () => {
  let listener: SorobanEventListener
  let callback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    callback = vi.fn()
    mockGetLatestLedger.mockReset()
    mockGetEvents.mockReset()

    listener = new SorobanEventListener({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: ['CA1234'],
      pollIntervalMs: 1000,
      maxLedgerOffset: 100,
    })

    listener.setCallback(callback as any)
  })

  afterEach(() => {
    listener.stop()
    vi.useRealTimers()
  })

  it('initializes with correct options', () => {
    expect(listener.isRunning).toBe(false)
  })

  it('starts and sets running flag', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    expect(listener.isRunning).toBe(true)
  })

  it('stops and clears running flag', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    listener.stop()
    expect(listener.isRunning).toBe(false)
  })

  it('does not start twice', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    await listener.start()
    expect(mockGetLatestLedger).toHaveBeenCalledTimes(1)
  })

  it('fetches latest ledger on start', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    expect(mockGetLatestLedger).toHaveBeenCalledTimes(1)
  })
})
