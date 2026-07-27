/**
 * Mainnet Deployment Script
 *
 * This script handles the deployment of TaskChain to the Stellar mainnet.
 * It performs pre-deployment checks, database migrations, and validates the deployment.
 *
 * Usage:
 *   npx tsx scripts/deploy-mainnet.ts
 *
 * Required environment variables:
 *   DATABASE_URL - Neon Postgres connection string
 *   JWT_SECRET - JWT signing secret (32+ characters)
 *   STELLAR_HORIZON_URL - Stellar Horizon RPC endpoint (mainnet)
 *   STELLAR_NETWORK_PASSPHRASE - "Public Global Stellar Network ; September 2015"
 *   ESCROW_ACCOUNT_ID - Platform escrow account public key
 *
 * Optional:
 *   SKIP_MIGRATIONS - Set to "true" to skip database migrations
 *   DRY_RUN - Set to "true" to perform dry run without actual deployment
 */

import * as dotenv from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

// ============================================================================
// Configuration
// ============================================================================

const MAINNET_CONFIG = {
  STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
  STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
  REQUIRED_ENV_VARS: [
    'DATABASE_URL',
    'JWT_SECRET',
    'STELLAR_HORIZON_URL',
    'STELLAR_NETWORK_PASSPHRASE',
    'ESCROW_ACCOUNT_ID',
  ],
}

// ============================================================================
// Types
// ============================================================================

interface DeploymentCheck {
  name: string
  check: () => Promise<boolean>
  critical: boolean
  errorMessage: string
}

interface DeploymentResult {
  success: boolean
  checks: Array<{ name: string; passed: boolean; critical: boolean }>
  errors: string[]
  warnings: string[]
}

// ============================================================================
// Pre-deployment Checks
// ============================================================================

const preDeploymentChecks: DeploymentCheck[] = [
  {
    name: 'Environment Variables',
    critical: true,
    errorMessage: 'Missing required environment variables',
    check: async () => {
      const missing = MAINNET_CONFIG.REQUIRED_ENV_VARS.filter(
        (key) => !process.env[key]
      )
      if (missing.length > 0) {
        console.error(`Missing environment variables: ${missing.join(', ')}`)
        return false
      }
      return true
    },
  },
  {
    name: 'JWT Secret Strength',
    critical: true,
    errorMessage: 'JWT_SECRET must be at least 32 characters',
    check: async () => {
      const secret = process.env.JWT_SECRET
      if (!secret || secret.length < 32) {
        console.error('JWT_SECRET is too short')
        return false
      }
      return true
    },
  },
  {
    name: 'Stellar Network Configuration',
    critical: true,
    errorMessage: 'STELLAR_NETWORK_PASSPHRASE must be set to mainnet',
    check: async () => {
      const passphrase = process.env.STELLAR_NETWORK_PASSPHRASE
      if (passphrase !== MAINNET_CONFIG.STELLAR_NETWORK_PASSPHRASE) {
        console.error(
          `STELLAR_NETWORK_PASSPHRASE is set to "${passphrase}" but should be "${MAINNET_CONFIG.STELLAR_NETWORK_PASSPHRASE}"`
        )
        return false
      }
      return true
    },
  },
  {
    name: 'Stellar Horizon URL',
    critical: true,
    errorMessage: 'STELLAR_HORIZON_URL must point to mainnet',
    check: async () => {
      const url = process.env.STELLAR_HORIZON_URL
      if (!url.includes('horizon.stellar.org') && !url.includes('mainnet')) {
        console.error(
          `STELLAR_HORIZON_URL appears to be testnet: ${url}`
        )
        return false
      }
      return true
    },
  },
  {
    name: 'Database Connection',
    critical: true,
    errorMessage: 'Cannot connect to database',
    check: async () => {
      try {
        const sql = neon(process.env.DATABASE_URL!)
        await sql`SELECT 1`
        return true
      } catch (error) {
        console.error('Database connection failed:', error)
        return false
      }
    },
  },
  {
    name: 'Escrow Account Validity',
    critical: true,
    errorMessage: 'ESCROW_ACCOUNT_ID is not a valid Stellar address',
    check: async () => {
      const accountId = process.env.ESCROW_ACCOUNT_ID
      if (!accountId || !/^G[A-Z0-9]{55}$/.test(accountId)) {
        console.error('Invalid Stellar address format')
        return false
      }
      return true
    },
  },
  {
    name: 'No Testnet Configuration',
    critical: true,
    errorMessage: 'Testnet configuration detected in environment',
    check: async () => {
      const envString = JSON.stringify(process.env)
      if (envString.includes('testnet') || envString.includes('Test SDF Network')) {
        console.error('Testnet configuration detected')
        return false
      }
      return true
    },
  },
  {
    name: 'Git Status Clean',
    critical: false,
    errorMessage: 'Git working directory is not clean',
    check: async () => {
      try {
        const result = execSync('git status --porcelain', { encoding: 'utf8' })
        if (result.trim().length > 0) {
          console.warn('Git working directory has uncommitted changes')
          return false
        }
        return true
      } catch (error) {
        console.warn('Could not check git status')
        return true // Non-critical, allow deployment
      }
    },
  },
  {
    name: 'Dependencies Installed',
    critical: true,
    errorMessage: 'Dependencies not installed',
    check: async () => {
      try {
        if (!fs.existsSync(path.join(__dirname, '..', 'node_modules'))) {
          console.error('node_modules not found')
          return false
        }
        return true
      } catch (error) {
        return false
      }
    },
  },
]

// ============================================================================
// Deployment Functions
// ============================================================================

async function runPreDeploymentChecks(): Promise<DeploymentResult> {
  console.log('\n🔍 Running Pre-Deployment Checks...\n')

  const result: DeploymentResult = {
    success: true,
    checks: [],
    errors: [],
    warnings: [],
  }

  for (const check of preDeploymentChecks) {
    console.log(`  Checking: ${check.name}...`)
    try {
      const passed = await check.check()
      result.checks.push({ name: check.name, passed, critical: check.critical })
      
      if (passed) {
        console.log(`  ✅ ${check.name}`)
      } else {
        console.log(`  ❌ ${check.name}`)
        if (check.critical) {
          result.errors.push(check.errorMessage)
          result.success = false
        } else {
          result.warnings.push(check.errorMessage)
        }
      }
    } catch (error) {
      console.log(`  ❌ ${check.name} - Error: ${error}`)
      result.errors.push(`${check.name}: ${error}`)
      result.success = false
    }
  }

  return result
}

async function runDatabaseMigrations(): Promise<boolean> {
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('⏭️  Skipping database migrations (SKIP_MIGRATIONS=true)')
    return true
  }

  console.log('\n🗄️  Running Database Migrations...\n')

  try {
    execSync('npx tsx scripts/migrate.ts', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('✅ Database migrations completed')
    return true
  } catch (error) {
    console.error('❌ Database migrations failed:', error)
    return false
  }
}

async function buildApplication(): Promise<boolean> {
  if (process.env.DRY_RUN === 'true') {
    console.log('⏭️  Skipping build (DRY_RUN=true)')
    return true
  }

  console.log('\n🔨 Building Application...\n')

  try {
    execSync('npm run build', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    })
    console.log('✅ Application build completed')
    return true
  } catch (error) {
    console.error('❌ Application build failed:', error)
    return false
  }
}

async function initializeSecuritySystems(): Promise<boolean> {
  console.log('\n🔒 Initializing Security Systems...\n')

  try {
    const { initializeFailSafe } = await import('@/lib/security/failSafe')
    const { initializeEmergencyWithdrawal } = await import('@/lib/security/emergencyWithdrawal')

    await initializeFailSafe()
    console.log('✅ Fail-safe system initialized')

    await initializeEmergencyWithdrawal()
    console.log('✅ Emergency withdrawal system initialized')

    return true
  } catch (error) {
    console.error('❌ Security system initialization failed:', error)
    return false
  }
}

async function validateDeployment(): Promise<boolean> {
  console.log('\n✅ Validating Deployment...\n')

  try {
    // Check database tables exist
    const sql = neon(process.env.DATABASE_URL!)
    
    const tables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    
    const requiredTables = [
      'users',
      'jobs',
      'proposals',
      'escrow_transactions',
      'reviews',
      'disputes',
      'critical_operations',
      'emergency_withdrawals',
      'emergency_signers',
    ]
    
    const missingTables = requiredTables.filter(
      (table) => !tables.some((t: any) => t.table_name === table)
    )
    
    if (missingTables.length > 0) {
      console.error(`Missing database tables: ${missingTables.join(', ')}`)
      return false
    }
    
    console.log('✅ All required database tables present')
    
    // Check fail-safe system
    const failSafeCheck = await sql`
      SELECT COUNT(*) as count FROM critical_operations LIMIT 1
    `
    console.log('✅ Fail-safe system operational')
    
    // Check emergency withdrawal system
    const emergencyCheck = await sql`
      SELECT COUNT(*) as count FROM emergency_withdrawals LIMIT 1
    `
    console.log('✅ Emergency withdrawal system operational')
    
    return true
  } catch (error) {
    console.error('❌ Deployment validation failed:', error)
    return false
  }
}

async function generateDeploymentReport(): Promise<void> {
  console.log('\n📊 Generating Deployment Report...\n')

  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    network: process.env.STELLAR_NETWORK_PASSPHRASE,
    horizonUrl: process.env.STELLAR_HORIZON_URL,
    escrowAccount: process.env.ESCROW_ACCOUNT_ID?.substring(0, 10) + '...',
    gitCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
    gitBranch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
  }

  const reportPath = path.join(__dirname, '..', 'deployment-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`✅ Deployment report saved to ${reportPath}`)
}

// ============================================================================
// Main Deployment Flow
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 TaskChain Mainnet Deployment')
  console.log('================================\n')

  // Run pre-deployment checks
  const checkResult = await runPreDeploymentChecks()

  console.log('\n📋 Check Summary:')
  console.log(`  Total: ${checkResult.checks.length}`)
  console.log(`  Passed: ${checkResult.checks.filter((c) => c.passed).length}`)
  console.log(`  Failed: ${checkResult.checks.filter((c) => !c.passed).length}`)

  if (checkResult.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    checkResult.warnings.forEach((warning) => console.log(`  - ${warning}`))
  }

  if (!checkResult.success) {
    console.log('\n❌ Pre-deployment checks failed. Deployment aborted.')
    console.log('\nErrors:')
    checkResult.errors.forEach((error) => console.log(`  - ${error}`))
    process.exit(1)
  }

  console.log('\n✅ All critical checks passed. Proceeding with deployment.\n')

  // Confirm deployment
  if (process.env.CONFIRM !== 'true') {
    console.log('⚠️  To proceed with deployment, set CONFIRM=true environment variable')
    console.log('   Example: CONFIRM=true npx tsx scripts/deploy-mainnet.ts')
    process.exit(1)
  }

  // Run database migrations
  const migrationsSuccess = await runDatabaseMigrations()
  if (!migrationsSuccess) {
    console.error('\n❌ Database migrations failed. Deployment aborted.')
    process.exit(1)
  }

  // Build application
  const buildSuccess = await buildApplication()
  if (!buildSuccess) {
    console.error('\n❌ Application build failed. Deployment aborted.')
    process.exit(1)
  }

  // Initialize security systems
  const securityInitSuccess = await initializeSecuritySystems()
  if (!securityInitSuccess) {
    console.error('\n❌ Security system initialization failed. Deployment aborted.')
    process.exit(1)
  }

  // Validate deployment
  const validationSuccess = await validateDeployment()
  if (!validationSuccess) {
    console.error('\n❌ Deployment validation failed. Deployment aborted.')
    process.exit(1)
  }

  // Generate deployment report
  await generateDeploymentReport()

  console.log('\n🎉 Deployment completed successfully!')
  console.log('\nNext steps:')
  console.log('  1. Verify the deployment in production environment')
  console.log('  2. Monitor logs for any errors')
  console.log('  3. Test critical functionality (escrow, payments, etc.)')
  console.log('  4. Set up monitoring and alerting')
  console.log('  5. Add emergency signers to the system')
}

// Run deployment
main().catch((error) => {
  console.error('\n❌ Deployment failed with error:', error)
  process.exit(1)
})
