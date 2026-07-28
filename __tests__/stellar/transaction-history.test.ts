import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

const callMock = vi.fn()

const mockServer = {
  transactions: () => ({
    forAccount: () => ({
      limit: () => ({
        call: callMock,
      }),
    }),
  }),
}

vi.mock('@stellar/stellar-sdk', () => {
  const MockServer = vi.fn().mockImplementation(function () {
    return mockServer
  })

  return {
    Horizon: {
      Server: MockServer,
    },
  }
})

import { sql } from '@/lib/db'
import { Horizon } from '@stellar/stellar-sdk'
import {
  stellarTransactionHistoryService,
  StellarTransactionHistoryService,
} from '@/lib/stellar/transaction-history'

const mockSql = sql as ReturnType<typeof vi.fn>

describe('StellarTransactionHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callMock.mockReset()
  })

  describe('fetchContractTransactions', () => {
    const contractId = '550e8400-e29b-41d4-a716-446655440000'

    it('throws when contract is not found', async () => {
      mockSql.mockResolvedValueOnce([])

      await expect(
        stellarTransactionHistoryService.fetchContractTransactions(contractId)
      ).rejects.toThrow('Contract not found')
    })

    it('returns empty result when contract has no address', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: null,
          contract_tx_hash: null,
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([])

      const result = await stellarTransactionHistoryService.fetchContractTransactions(
        contractId
      )

      expect(result.transactions).toHaveLength(0)
      expect(result.meta.hasMore).toBe(false)
    })

    it('fetches transactions from Horizon for contract address', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
          contract_tx_hash: 'abc123',
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([
        { wallet_address: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR' },
      ])

      callMock.mockResolvedValue({
        records: [
          {
            hash: 'tx_hash_1',
            created_at: '2024-01-01T00:00:00Z',
            source_account: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR',
            successful: true,
            failed_at: null,
            ledger: 12345,
            fee_charged: '100',
            memo: '',
            memo_type: 'none',
            signatures: [],
            envelope_xdr: '',
            operations: [
              {
                type: 'payment',
                amount: '100.5',
                asset_code: 'USDC',
                to: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
                from: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR',
              },
            ],
          },
        ],
      })

      const service = new StellarTransactionHistoryService()
      const result = await service.fetchContractTransactions(contractId, 20)

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0]).toMatchObject({
        hash: 'tx_hash_1',
        timestamp: '2024-01-01T00:00:00Z',
        amount: '100.5',
        assetType: 'USDC',
        status: 'successful',
        contractId,
        transactionType: 'payment_received',
        sourceAccount: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR',
        destinationAccount: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
      })
    })

    it('deduplicates transactions across addresses', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
          contract_tx_hash: 'abc123',
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([
        { wallet_address: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR' },
        { wallet_address: 'GDUVRMYC4PEOOZISVYL57WDFHZAX6LB4DBYQMWYUXDBLJ5QKB2QPG4OG' },
      ])

      callMock.mockResolvedValue({
        records: [
          {
            hash: 'duplicate_tx',
            created_at: '2024-01-01T00:00:00Z',
            source_account: 'ANY_ADDRESS',
            successful: true,
            failed_at: null,
            ledger: 1,
            fee_charged: '100',
            memo: '',
            memo_type: 'none',
            signatures: [],
            envelope_xdr: '',
            operations: [],
          },
        ],
      })

      const service = new StellarTransactionHistoryService()
      const result = await service.fetchContractTransactions(
        contractId,
        20
      )

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].hash).toBe('duplicate_tx')
    })

    it('maps failed transactions correctly', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
          contract_tx_hash: 'abc123',
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([])

      callMock.mockResolvedValue({
        records: [
          {
            hash: 'failed_tx',
            created_at: '2024-01-01T00:00:00Z',
            source_account: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR',
            successful: false,
            failed_at: '2024-01-01T00:00:01Z',
            ledger: 12346,
            fee_charged: '100',
            memo: '',
            memo_type: 'none',
            signatures: [],
            envelope_xdr: '',
            operations: [],
          },
        ],
      })

      const service = new StellarTransactionHistoryService()
      const result = await service.fetchContractTransactions(
        contractId,
        20
      )

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].status).toBe('failed')
    })

    it('respects limit parameter', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
          contract_tx_hash: 'abc123',
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([])

      const baseTx = {
        created_at: '2024-01-01T00:00:00Z',
        source_account: 'GCLJQ5JKMX57VYNLSLEQ5QN465XG4XJYOUCE3T3OTQEBZRQCQF5G4PVR',
        successful: true,
        failed_at: null,
        ledger: 1,
        fee_charged: '100',
        memo: '',
        memo_type: 'none',
        signatures: [],
        envelope_xdr: '',
        operations: [],
      }

      callMock.mockResolvedValue({
        records: Array.from({ length: 5 }, (_, i) => ({
          ...baseTx,
          hash: `tx_${i}`,
        })),
      })

      const service = new StellarTransactionHistoryService()
      const result = await service.fetchContractTransactions(
        contractId,
        5
      )

      expect(result.transactions).toHaveLength(5)
      expect(result.meta.limit).toBe(5)
    })

    it('handles Horizon API errors gracefully', async () => {
      mockSql.mockResolvedValueOnce([
        {
          contract_address: 'GCDNJUBQSX7AJWLJ4QTEPX32VOPJATM5XSEB5KJ3ESSPXYWQYNOEVUOX',
          contract_tx_hash: 'abc123',
          client_id: '111e8400-e29b-41d4-a716-446655440001',
          freelancer_id: '222e8400-e29b-41d4-a716-446655440002',
        },
      ])
      mockSql.mockResolvedValueOnce([])

      callMock.mockRejectedValue(new Error('Horizon unavailable'))

      const service = new StellarTransactionHistoryService()

      await expect(
        service.fetchContractTransactions(contractId)
      ).rejects.toThrow('Failed to fetch transaction history from Horizon')
    })
  })
})
