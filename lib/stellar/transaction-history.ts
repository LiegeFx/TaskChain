import { Horizon } from '@stellar/stellar-sdk'
import { sql } from '@/lib/db'

export interface StellarTransaction {
  hash: string
  timestamp: string
  amount: string
  assetType: string
  status: 'successful' | 'failed' | 'pending'
  contractId: string
  transactionType?: string
  sourceAccount?: string
  destinationAccount?: string
  metadata?: Record<string, unknown>
}

export interface TransactionHistoryResult {
  transactions: StellarTransaction[]
  meta: {
    limit: number
    cursor?: string
    hasMore: boolean
  }
}

export class StellarTransactionHistoryService {
  private readonly horizonUrl: string

  constructor() {
    this.horizonUrl =
      process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
  }

  async fetchContractTransactions(
    contractId: string,
    limit = 20,
    cursor?: string
  ): Promise<TransactionHistoryResult> {
    const contractRows = (await sql`
      SELECT c.contract_address, c.contract_tx_hash, c.client_id, c.freelancer_id
        FROM contracts c
       WHERE c.id = ${contractId}::uuid
       LIMIT 1
    `) as Array<{
      contract_address: string | null
      contract_tx_hash: string | null
      client_id: string
      freelancer_id: string
    }>

    if (contractRows.length === 0) {
      throw new Error('Contract not found')
    }

    const contract = contractRows[0]

    const userRows = (await sql`
      SELECT wallet_address
        FROM users
       WHERE id IN (${contract.client_id}::uuid, ${contract.freelancer_id}::uuid)
    `) as Array<{ wallet_address: string }>

    const walletAddresses = userRows
      .map((r) => r.wallet_address)
      .filter((addr): addr is string => typeof addr === 'string' && addr.length > 0)

    const server = new Horizon.Server(this.horizonUrl)

    try {
      const allTransactions: StellarTransaction[] = []
      const seenHashes = new Set<string>()

      const addressesToQuery = [
        ...(contract.contract_address ? [contract.contract_address] : []),
        ...walletAddresses,
      ]

      for (const address of addressesToQuery) {
        let query = server
          .transactions()
          .forAccount(address)
          .limit(limit)

        if (cursor) {
          query = query.cursor(cursor)
        }

        const page = await query.call()

        for (const tx of page.records) {
          if (seenHashes.has(tx.hash)) continue
          seenHashes.add(tx.hash)

          const mapped = this.mapTransaction(tx, contractId, contract.contract_address)
          if (mapped) {
            allTransactions.push(mapped)
          }
        }

        if (allTransactions.length >= limit) break
      }

      const trimmed = allTransactions.slice(0, limit)

      return {
        transactions: trimmed,
        meta: {
          limit,
          cursor,
          hasMore: allTransactions.length >= limit,
        },
      }
    } catch (error) {
      console.error(
        `[StellarTransactionHistory] Horizon query failed for contract ${contractId}:`,
        error
      )
      throw new Error(
        `Failed to fetch transaction history from Horizon: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private mapTransaction(
    tx: Record<string, unknown>,
    contractId: string,
    contractAddress: string | null
  ): StellarTransaction | null {
    const hash = tx.hash as string
    const timestamp =
      (tx.created_at as string) || new Date().toISOString()
    const sourceAccount = tx.source_account as string | undefined

    let amount = '0'
    let assetType = 'native'
    let destinationAccount: string | undefined

    const ops = tx.operations as Array<Record<string, unknown>> | undefined
    if (ops && ops.length > 0) {
      const payment = ops.find(
        (op) => op.type === 'payment' || op.type_i === 1
      )
      if (payment) {
        amount = (payment.amount as string) || '0'
        assetType = (payment.asset_code as string) || (payment.asset_type as string) || 'native'
        destinationAccount = payment.to as string | undefined
      }
    }

    const isSuccessful = tx.successful === true
    const hasFailed = tx.failed_at != null && tx.failed_at !== ''
    const status: 'successful' | 'failed' | 'pending' = isSuccessful
      ? 'successful'
      : hasFailed
        ? 'failed'
        : 'pending'

    const transactionType = this.inferTransactionType(tx, contractAddress)

    return {
      hash,
      timestamp,
      amount,
      assetType,
      status,
      contractId,
      transactionType,
      sourceAccount,
      destinationAccount,
      metadata: {
        ledger: tx.ledger,
        fee: tx.fee_charged,
        memo: tx.memo,
        memoType: tx.memo_type,
        signatures: tx.signatures,
        envelopeXdr: tx.envelope_xdr,
      },
    }
  }

  private inferTransactionType(
    tx: Record<string, unknown>,
    contractAddress: string | null
  ): string {
    if (!contractAddress) return 'unknown'

    const ops = tx.operations as Array<Record<string, unknown>> | undefined
    if (!ops || ops.length === 0) return 'unknown'

    const opTypes = ops.map((op) => op.type)

    if (opTypes.includes('payment')) {
      const payment = ops.find((op) => op.type === 'payment')
      if (payment) {
        if (payment.to === contractAddress) return 'payment_received'
        if (payment.from === contractAddress) return 'payment_sent'
      }
      return 'payment'
    }

    if (opTypes.includes('manage_data')) return 'data_operation'
    if (opTypes.includes('set_options')) return 'account_settings'
    if (opTypes.includes('change_trust')) return 'trustline'
    if (opTypes.includes('allow_trust')) return 'allow_trust'
    if (opTypes.includes('bump_sequence')) return 'bump_sequence'

    return 'other'
  }
}

export const stellarTransactionHistoryService = new StellarTransactionHistoryService()
