# TaskChain Scripts

This directory contains utility scripts for database migrations, deployment, and background workers.

## Scripts

### Database Migrations

#### `migrate.ts`
Applies pending SQL migration files from `lib/db/migrations/` to the Neon Postgres database.

**Usage:**
```bash
npx tsx scripts/migrate.ts
```

**Required Environment Variables:**
- `DATABASE_URL` - Neon Postgres connection string

**Features:**
- Applies migrations in filename order (001_, 002_, etc.)
- Tracks applied migrations in `schema_migrations` table
- Supports rollback by re-running migrations
- Safe to re-run (skips already-applied migrations)

### Background Workers

#### `worker.ts`
Stellar blockchain event listener that monitors the platform escrow account for payment transactions.

**Usage:**
```bash
npm run worker
# or
npx tsx scripts/worker.ts
```

**Required Environment Variables:**
- `DATABASE_URL` - Neon Postgres connection string
- `STELLAR_HORIZON_URL` - Stellar Horizon RPC endpoint
- `ESCROW_ACCOUNT_ID` - Platform escrow account public key

**Features:**
- Streams payment events from Stellar Horizon
- Processes job and milestone payments
- Updates database based on blockchain events
- Idempotent transaction processing
- Sends notifications to users
- Heartbeat logging every 60 seconds

### Deployment Scripts

#### `deploy-mainnet.ts`
Mainnet deployment script with pre-deployment checks and validation.

**Usage:**
```bash
# Dry run (checks only)
DRY_RUN=true npx tsx scripts/deploy-mainnet.ts

# Full deployment
CONFIRM=true npx tsx scripts/deploy-mainnet.ts
```

**Required Environment Variables:**
- `DATABASE_URL` - Neon Postgres connection string
- `JWT_SECRET` - JWT signing secret (32+ characters)
- `STELLAR_HORIZON_URL` - Stellar Horizon RPC endpoint (mainnet)
- `STELLAR_NETWORK_PASSPHRASE` - "Public Global Stellar Network ; September 2015"
- `ESCROW_ACCOUNT_ID` - Platform escrow account public key

**Optional Environment Variables:**
- `SKIP_MIGRATIONS` - Set to "true" to skip database migrations
- `DRY_RUN` - Set to "true" to perform dry run without actual deployment
- `CONFIRM` - Set to "true" to proceed with deployment

**Pre-Deployment Checks:**
- Environment variables validation
- JWT secret strength check
- Stellar network configuration validation
- Database connection check
- Escrow account validity check
- Testnet configuration detection
- Git status check (optional)
- Dependencies check

**Deployment Steps:**
1. Run pre-deployment checks
2. Execute database migrations
3. Build application
4. Initialize security systems (fail-safe, emergency withdrawal)
5. Validate deployment
6. Generate deployment report

## SQL Migration Files

### Core Tables
- `001-create-tables.sql` - Core tables (users, jobs, proposals, escrow_transactions, reviews, disputes)
- `002-auth-tables.sql` - Authentication tables (sessions, refresh_tokens)
- `002-create-projects-table.sql` - Projects table
- `003-freelancer-reputation.sql` - Reputation system tables
- `004-milestones.sql` - Milestones table
- `005-notifications.sql` - Notifications table
- `006-contracts.sql` - Escrow contracts table
- `006-dispute-enhancements.sql` - Dispute enhancements
- `006-rate-limits.sql` - Rate limiting table
- `009-reviews-schema.sql` - Reviews table for client/freelancer ratings
- `010-freelancer-discovery-indexes.sql` - GIN/B-tree indexes that power GET /api/freelancers (task #121)

### Security Tables
- `007-fail-safe.sql` - Critical operations table for fail-safe system
- `008-emergency-withdrawal.sql` - Emergency withdrawal tables (requests, signers, approvals, logs)

## Running Scripts in Development

```bash
# Install dependencies
npm install

# Run database migrations
npx tsx scripts/migrate.ts

# Start the worker (in a separate terminal)
npm run worker

# Start the development server
npm run dev
```

## Running Scripts in Production

```bash
# Build the application
npm run build

# Run migrations before deployment
npx tsx scripts/migrate.ts

# Deploy to mainnet
CONFIRM=true npx tsx scripts/deploy-mainnet.ts

# Start the worker (use process manager like PM2)
pm2 start npm --name "taskchain-worker" -- run worker

# Start the production server
npm run start:production
```

## Troubleshooting

### Migration Fails
- Check DATABASE_URL is correct
- Verify database is accessible
- Check SSL mode is set to require
- Review migration file for syntax errors

### Worker Fails to Start
- Check DATABASE_URL is set
- Check STELLAR_HORIZON_URL is correct
- Verify ESCROW_ACCOUNT_ID is valid
- Check Stellar network is accessible

### Deployment Fails
- Run with DRY_RUN=true first
- Check all required environment variables
- Verify network is set to mainnet
- Review database connection
- Check git status (optional)

## Security Notes

- Never commit `.env` files
- Use strong, randomly generated secrets
- Rotate secrets regularly
- Use different secrets for different environments
- Monitor script execution logs
- Use process managers for production workers
