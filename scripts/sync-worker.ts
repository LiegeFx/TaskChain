import { ContractSyncService } from '@/lib/contract-sync'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Sync worker cannot connect to the database.')
  process.exit(1)
}

const contractAddresses = (process.env.SOROBAN_CONTRACT_ADDRESSES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (contractAddresses.length === 0) {
  console.warn('WARNING: No SOROBAN_CONTRACT_ADDRESSES set. Sync worker will start but not listen to any contracts.')
  console.warn('Set SOROBAN_CONTRACT_ADDRESSES in .env (comma-separated Soroban contract IDs)')
}

async function startSyncWorker() {
  console.log('[SyncWorker] Starting Contract Sync Service...')
  console.log(`[SyncWorker] Monitoring ${contractAddresses.length} contract(s)`)

  const syncService = new ContractSyncService({
    rpcUrl: process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    contractAddresses,
    pollIntervalMs: 10_000,
    queueConcurrency: 3,
    maxRetries: 5,
  })

  await syncService.start()

  setInterval(() => {
    const queue = syncService.getQueue()
    console.log(`[SyncWorker HEARTBEAT] ${new Date().toISOString()} - Pending: ${queue.pendingCount}, Dead letters: ${queue.deadLetterCount}`)
  }, 60_000)
}

process.on('SIGINT', () => {
  console.log('[SyncWorker] Gracefully shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[SyncWorker] Gracefully shutting down...')
  process.exit(0)
})

startSyncWorker().catch((err) => {
  console.error('[FATAL SyncWorker ERROR]', err)
  process.exit(1)
})
