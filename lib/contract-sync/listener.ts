import Server from '@stellar/stellar-sdk'
import type { SorobanContractEvent, SorobanEventPayload } from './types'

export type EventCallback = (payload: SorobanEventPayload) => void

export interface SorobanListenerOptions {
  rpcUrl: string
  networkPassphrase: string
  contractAddresses: string[]
  pollIntervalMs?: number
  maxLedgerOffset?: number
}

export class SorobanEventListener {
  private server: InstanceType<typeof Server>
  private readonly networkPassphrase: string
  private readonly contractAddresses: string[]
  private readonly pollIntervalMs: number
  private readonly maxLedgerOffset: number
  private callback: EventCallback | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private lastLedger: number = 0
  private running = false

  private readonly EVENT_NAMES: SorobanContractEvent[] = [
    'init', 'fund', 'submit', 'approve', 'confirm',
    'release', 'refund', 'dispute', 'resolve', 'expire',
  ]

  constructor(options: SorobanListenerOptions) {
    this.server = new Server(options.rpcUrl)
    this.networkPassphrase = options.networkPassphrase
    this.contractAddresses = options.contractAddresses
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000
    this.maxLedgerOffset = options.maxLedgerOffset ?? 100
  }

  setCallback(cb: EventCallback): void {
    this.callback = cb
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      const info = await this.server.getLatestLedger()
      this.lastLedger = info.sequence
    } catch (err) {
      console.warn('[SorobanListener] Could not get latest ledger, starting from 0')
    }

    this.timer = setInterval(() => this.poll(), this.pollIntervalMs)
    console.log(`[SorobanListener] Started polling ${this.contractAddresses.length} contract(s) every ${this.pollIntervalMs}ms`)
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get isRunning(): boolean {
    return this.running
  }

  private async poll(): Promise<void> {
    if (!this.callback) return

    try {
      const info = await this.server.getLatestLedger()
      const latestSeq = info.sequence

      if (this.lastLedger === 0) {
        this.lastLedger = latestSeq
        return
      }

      const startSeq = Math.max(this.lastLedger + 1, latestSeq - this.maxLedgerOffset)
      if (startSeq >= latestSeq) {
        this.lastLedger = latestSeq
        return
      }

      for (const contractAddress of this.contractAddresses) {
        await this.pollContractEvents(contractAddress, startSeq, latestSeq)
      }

      this.lastLedger = latestSeq
    } catch (err) {
      console.error('[SorobanListener] Poll error:', err)
    }
  }

  private async pollContractEvents(
    contractAddress: string,
    startSeq: number,
    endSeq: number
  ): Promise<void> {
    try {
      const events = await this.server.getEvents({
        startLedger: startSeq,
        filters: [
          {
            type: 'contract',
            contractIds: [contractAddress],
          },
        ],
        pagination: {
          limit: 100,
        },
      })

      for (const event of events.events) {
        const parsed = this.parseSorobanEvent(event, contractAddress)
        if (parsed) {
          this.callback!(parsed)
        }
      }

      if (events.events.length > 0) {
        console.log(`[SorobanListener] Processed ${events.events.length} event(s) from ${contractAddress} (ledgers ${startSeq}-${endSeq})`)
      }
    } catch (err) {
      console.error(`[SorobanListener] Error polling contract ${contractAddress}:`, err)
    }
  }

  private parseSorobanEvent(event: any, contractAddress: string): SorobanEventPayload | null {
    try {
      const topic = event.topic
      if (!topic || topic.length === 0) return null

      const eventName = this.decodeEventName(topic[0])
      if (!eventName || !this.EVENT_NAMES.includes(eventName as SorobanContractEvent)) {
        return null
      }

      const rawData = event.value ?? event.data ?? []
      const data = Array.isArray(rawData) ? rawData : [rawData]

      let milestoneId: number | undefined
      let amount: string | undefined

      if (eventName === 'fund') {
        amount = this.extractAmount(data)
      } else if (['submit', 'approve', 'confirm'].includes(eventName)) {
        milestoneId = this.extractMilestoneId(data)
      } else if (['release', 'refund', 'expire'].includes(eventName)) {
        milestoneId = this.extractMilestoneId(data)
        amount = this.extractAmount(data, 1)
      } else if (eventName === 'dispute' || eventName === 'resolve') {
        milestoneId = this.extractMilestoneId(data)
      } else if (eventName === 'init') {
        milestoneId = undefined
      }

      return {
        event: eventName as SorobanContractEvent,
        contractAddress,
        ledgerSequence: event.ledger ?? event.ledgerSequence ?? 0,
        timestamp: event.ledgerClosedAt
          ? new Date(event.ledgerClosedAt).getTime()
          : Date.now(),
        txHash: event.txHash ?? event.id ?? 'unknown',
        data,
        milestoneId,
        amount,
      }
    } catch (err) {
      console.error('[SorobanListener] Failed to parse event:', err)
      return null
    }
  }

  private decodeEventName(topicPart: any): string | null {
    if (typeof topicPart === 'string') return topicPart.toLowerCase()
    if (typeof topicPart === 'object' && topicPart !== null) {
      if (topicPart.symbol) return topicPart.symbol.toLowerCase()
      if (topicPart.toString) return topicPart.toString().toLowerCase()
    }
    return null
  }

  private extractMilestoneId(data: any[], index = 0): number | undefined {
    const val = data[index]
    if (typeof val === 'number') return val
    if (typeof val === 'string') return parseInt(val, 10)
    if (val?.toNumber) return val.toNumber()
    if (val?.toString) return parseInt(val.toString(), 10)
    return undefined
  }

  private extractAmount(data: any[], index = 0): string | undefined {
    const val = data[index]
    if (typeof val === 'string') return val
    if (typeof val === 'number') return String(val)
    if (val?.toString) return val.toString()
    return undefined
  }
}
