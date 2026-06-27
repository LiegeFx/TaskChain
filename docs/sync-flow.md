# Contract Synchronization Flow

## Overview

The contract sync system ensures that the backend database stays consistent with on-chain Soroban smart contract state. It listens to events emitted by deployed escrow contracts, maps them to backend status transitions, and updates the database with retry logic for resilience.

## Architecture

```
Soroban Contracts          Sync Worker               Database
───────────────         ──────────────────         ──────────
  emit events  ─────>   SorobanEventListener
                             │
                        parse & enqueue
                             │
                         SyncQueue
                             │  (retry with
                             │   exponential
                             │   backoff)
                             │
                      ContractSyncService
                             │
                        mapEventToAction()
                             │
                     ┌───────┴────────┐
                     │                │
              update_contract   update_milestone
                     │                │
                     └────┬───────────┘
                          │
                    PostgreSQL tables
                  (contracts, milestones,
                   contract_sync_log)
```

## Key Components

### 1. Event Types (`lib/contract-sync/types.ts`)

Defines all Soroban contract events that the system listens for:

| Event     | Emitted When                       | Data                           |
|-----------|------------------------------------|--------------------------------|
| `init`    | Contract initialized               | client, freelancer, arbiter    |
| `fund`    | Client funds the escrow            | total_amount                   |
| `submit`  | Freelancer submits milestone       | milestone_id                   |
| `approve` | Client approves milestone          | milestone_id                   |
| `confirm` | Freelancer confirms approval       | milestone_id                   |
| `release` | Funds released to freelancer       | milestone_id, transfer_amount  |
| `refund`  | Funds refunded to client           | milestone_id, transfer_amount  |
| `dispute` | Milestone disputed                 | milestone_id                   |
| `resolve` | Dispute resolved by arbiter        | milestone_id, release_to_freelancer |
| `expire`  | Milestone auto-expired             | milestone_id, transfer_amount  |

### 2. Event Mapper (`lib/contract-sync/mapper.ts`)

Maps each on-chain event to the corresponding database status change:

| Event     | Contract Update                              | Milestone Update            |
|-----------|----------------------------------------------|-----------------------------|
| `init`    | none (noop)                                  | -                           |
| `fund`    | escrow_status=funded, status=active          | -                           |
| `submit`  | -                                            | status=submitted            |
| `approve` | -                                            | status=approved             |
| `confirm` | -                                            | status=approved             |
| `release` | escrow_status=fully_released, completed      | status=paid                 |
| `refund`  | escrow_status=refunded, cancelled            | status=refunded             |
| `dispute` | status=disputed                              | status=disputed             |
| `resolve` | status=completed                             | status=paid                 |
| `expire`  | -                                            | status=auto_expired         |

### 3. Sync Queue (`lib/contract-sync/queue.ts`)

In-memory queue that processes events with:
- **Configurable concurrency** (default: 3)
- **Exponential backoff**: `min(1000 * 2^retry, 60000)` ms
- **Dead letter** after 5 failed retries
- Thread-safe item tracking by `txHash:event:milestoneId`

### 4. Soroban Event Listener (`lib/contract-sync/listener.ts`)

Polls the Soroban RPC endpoint for contract events:
- Uses `@stellar/stellar-sdk` `SorobanRpc.Server.getEvents()`
- Tracks the latest processed ledger to avoid re-processing
- Configurable poll interval (default: 10s)
- Parses Soroban event topics and data into typed payloads

### 5. Sync Service (`lib/contract-sync/service.ts`)

Orchestrates the full sync pipeline:
1. Receives parsed events from the listener
2. Enqueues them into the SyncQueue
3. Processes each item by mapping to DB updates
4. Logs every attempt to `contract_sync_log`
5. Automatically detects contract completion when all milestones paid

### 6. Audit Log Table (`contract_sync_log`)

Each sync operation is recorded in a dedicated table:

```sql
contract_sync_log (
  id                UUID PRIMARY KEY,
  contract_id       UUID REFERENCES contracts,
  milestone_id      UUID REFERENCES milestones,
  event_type        contract_sync_event_type,  -- enum of all 10 events
  tx_hash           TEXT,
  ledger_sequence   BIGINT,
  status            sync_status,               -- pending/processing/success/failed/dead_letter
  error_message     TEXT,
  retry_count       INTEGER DEFAULT 0,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
)
```

## Running the Sync Worker

### Prerequisites

1. Environment variables in `.env`:
   ```env
   DATABASE_URL=postgres://...
   STELLAR_RPC_URL=https://soroban-testnet.stellar.org
   STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   SOROBAN_CONTRACT_ADDRESSES=CA...ID1,CA...ID2
   ```

2. Database migration applied:
   ```bash
   # Run the SQL migration in your Neon console
   lib/db/migrations/005_contract_sync_log.sql
   ```

### Start the Worker

```bash
npm run sync-worker
# or directly:
tsx scripts/sync-worker.ts
```

### npm Script

Add to `package.json`:
```json
"sync-worker": "tsx scripts/sync-worker.ts"
```

## Monitoring

### Heartbeat Logs

The worker logs a heartbeat every 60 seconds:
```
[SyncWorker HEARTBEAT] 2026-06-27T08:00:00.000Z - Pending: 0, Dead letters: 0
```

### View Sync Logs

Via the API:
```http
GET /api/contracts/sync-logs?status=failed
GET /api/contracts/sync-logs?contractId=<uuid>&limit=20
```

Or directly in SQL:
```sql
SELECT * FROM contract_sync_log ORDER BY created_at DESC LIMIT 10;
```

### Dead Letters

When a sync fails after max retries, the item is moved to the dead letter queue. Retrieve them programmatically:

```typescript
const deadLetters = syncService.getQueue().getDeadLetters()
```

## Error Handling

- **Transient errors** (network issues, RPC timeouts): Retried with exponential backoff
- **Permanent errors** (contract not found, invalid event data): Move to dead letter after max retries
- **DB constraint violations**: Logged and moved to dead letter (require manual intervention)
- **All failures** are recorded in `contract_sync_log` with the error message and retry count

## Testing

```bash
npm test -- --reporter=verbose
```

Unit tests cover:
- Event mapping correctness for all 10 event types
- Queue enqueue/dequeue/retry/dead letter logic
- Backoff delay calculation
- Soroban event parsing
- DB update generation

## Adding New Contract Events

1. Add the new event name to the `SorobanContractEvent` type in `types.ts`
2. Add the event name to the `EVENT_NAMES` array in `listener.ts`
3. Add a mapping case in `mapEventToAction()` in `mapper.ts`
4. Add the event to the `contract_sync_event_type` enum in the SQL migration
5. Write tests for the new event mapping
