/**
 * Fail-Safe Design for Critical Flows
 *
 * This module implements fail-safe mechanisms for critical operations in the TaskChain platform.
 * It includes circuit breakers, transaction verification, rollback mechanisms, and time-locked operations.
 *
 * Design Principles:
 * - Never commit state changes without verification
 * - Always provide rollback capability for critical operations
 * - Implement time delays for irreversible actions
 * - Log all critical operations for audit trail
 * - Provide circuit breakers to prevent cascading failures
 */

import { sql } from '@/lib/db'

// ============================================================================
// Types
// ============================================================================

export type CriticalOperationType =
  | 'escrow_fund'
  | 'escrow_release'
  | 'escrow_refund'
  | 'dispute_resolve'
  | 'admin_action'
  | 'emergency_withdrawal'

export interface CriticalOperation {
  id: string
  type: CriticalOperationType
  userId: number
  walletAddress: string
  resourceId: string // contract_id, dispute_id, etc.
  data: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed' | 'rolled_back'
  requiresApproval: boolean
  requiresConfirmation: boolean
  timeDelaySeconds: number
  createdAt: Date
  approvedAt?: Date
  expiresAt?: Date
  executedAt?: Date
  rollbackUntil?: Date
}

export interface CircuitBreakerState {
  isOpen: boolean
  failureCount: number
  lastFailureTime: Date | null
  nextAttemptTime: Date | null
}

export interface FailSafeConfig {
  enabled: boolean
  requireApprovalForAmountsAbove: number
  requireConfirmationForAmountsAbove: number
  timeDelayForAmountsAbove: number
  maxApprovalDelaySeconds: number
  circuitBreakerThreshold: number
  circuitBreakerCooldownSeconds: number
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: FailSafeConfig = {
  enabled: process.env.NODE_ENV === 'production',
  requireApprovalForAmountsAbove: 1000, // $1000 USD equivalent
  requireConfirmationForAmountsAbove: 100, // $100 USD equivalent
  timeDelayForAmountsAbove: 500, // $500 USD equivalent
  maxApprovalDelaySeconds: 86400, // 24 hours
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownSeconds: 300, // 5 minutes
}

function getConfig(): FailSafeConfig {
  return DEFAULT_CONFIG
}

// ============================================================================
// Circuit Breaker
// ============================================================================

const circuitBreakers = new Map<string, CircuitBreakerState>()

export function getCircuitBreakerState(operation: string): CircuitBreakerState {
  const state = circuitBreakers.get(operation)
  if (!state) {
    return {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    }
  }
  return state
}

export function recordCircuitBreakerFailure(operation: string): void {
  const config = getConfig()
  const state = getCircuitBreakerState(operation)
  
  state.failureCount += 1
  state.lastFailureTime = new Date()
  
  if (state.failureCount >= config.circuitBreakerThreshold) {
    state.isOpen = true
    state.nextAttemptTime = new Date(Date.now() + config.circuitBreakerCooldownSeconds * 1000)
  }
  
  circuitBreakers.set(operation, state)
}

export function recordCircuitBreakerSuccess(operation: string): void {
  const state = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: null,
    nextAttemptTime: null,
  }
  circuitBreakers.set(operation, state)
}

export async function withCircuitBreaker<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const state = getCircuitBreakerState(operation)
  const config = getConfig()
  
  // Check if circuit breaker is open
  if (state.isOpen) {
    if (state.nextAttemptTime && new Date() < state.nextAttemptTime) {
      throw new Error(
        `Circuit breaker is open for ${operation}. Next attempt allowed at ${state.nextAttemptTime.toISOString()}`
      )
    }
    // Reset if cooldown period has passed
    recordCircuitBreakerSuccess(operation)
  }
  
  try {
    const result = await fn()
    recordCircuitBreakerSuccess(operation)
    return result
  } catch (error) {
    recordCircuitBreakerFailure(operation)
    throw error
  }
}

// ============================================================================
// Critical Operation Management
// ============================================================================

/**
 * Create a pending critical operation that may require approval/confirmation
 */
export async function createCriticalOperation(params: {
  type: CriticalOperationType
  userId: number
  walletAddress: string
  resourceId: string
  data: Record<string, unknown>
  amount?: number
}): Promise<CriticalOperation> {
  const config = getConfig()
  
  if (!config.enabled) {
    // Fail-safe disabled, return operation that can proceed immediately
    const operation: CriticalOperation = {
      id: generateOperationId(),
      type: params.type,
      userId: params.userId,
      walletAddress: params.walletAddress,
      resourceId: params.resourceId,
      data: params.data,
      status: 'approved',
      requiresApproval: false,
      requiresConfirmation: false,
      timeDelaySeconds: 0,
      createdAt: new Date(),
      approvedAt: new Date(),
    }
    return operation
  }
  
  const amount = params.amount || 0
  const requiresApproval = amount >= config.requireApprovalForAmountsAbove
  const requiresConfirmation = amount >= config.requireConfirmationForAmountsAbove
  const timeDelaySeconds = amount >= config.timeDelayForAmountsAbove ? 3600 : 0 // 1 hour delay for large amounts
  
  const operation: CriticalOperation = {
    id: generateOperationId(),
    type: params.type,
    userId: params.userId,
    walletAddress: params.walletAddress,
    resourceId: params.resourceId,
    data: params.data,
    status: 'pending',
    requiresApproval,
    requiresConfirmation,
    timeDelaySeconds,
    createdAt: new Date(),
    expiresAt: requiresApproval ? new Date(Date.now() + config.maxApprovalDelaySeconds * 1000) : undefined,
    rollbackUntil: new Date(Date.now() + 86400000), // 24 hour rollback window
  }
  
  // Persist to database
  await sql`
    INSERT INTO critical_operations (
      id, type, user_id, wallet_address, resource_id, data, status,
      requires_approval, requires_confirmation, time_delay_seconds,
      created_at, expires_at, rollback_until
    ) VALUES (
      ${operation.id}, ${operation.type}, ${operation.userId}, ${operation.walletAddress},
      ${operation.resourceId}, ${JSON.stringify(operation.data)}, ${operation.status},
      ${operation.requiresApproval}, ${operation.requiresConfirmation}, ${operation.timeDelaySeconds},
      ${operation.createdAt.toISOString()}, ${operation.expiresAt?.toISOString()}, ${operation.rollbackUntil?.toISOString()}
    )
  `
  
  return operation
}

/**
 * Approve a pending critical operation
 */
export async function approveCriticalOperation(
  operationId: string,
  approverId: number,
  approverWalletAddress: string
): Promise<CriticalOperation> {
  const operation = await getCriticalOperation(operationId)
  if (!operation) {
    throw new Error('Operation not found')
  }
  
  if (operation.status !== 'pending') {
    throw new Error(`Cannot approve operation in status: ${operation.status}`)
  }
  
  if (operation.expiresAt && new Date() > operation.expiresAt) {
    throw new Error('Operation has expired')
  }
  
  const now = new Date()
  const updated: CriticalOperation = {
    ...operation,
    status: 'approved',
    approvedAt: now,
  }
  
  await sql`
    UPDATE critical_operations
    SET status = ${updated.status},
        approved_at = ${updated.approvedAt?.toISOString()},
        approver_id = ${approverId},
        approver_wallet_address = ${approverWalletAddress}
    WHERE id = ${operationId}
  `
  
  return updated
}

/**
 * Mark a critical operation as completed
 */
export async function completeCriticalOperation(
  operationId: string,
  result?: Record<string, unknown>
): Promise<CriticalOperation> {
  const operation = await getCriticalOperation(operationId)
  if (!operation) {
    throw new Error('Operation not found')
  }
  
  if (operation.status !== 'approved') {
    throw new Error(`Cannot complete operation in status: ${operation.status}`)
  }
  
  const now = new Date()
  const updated: CriticalOperation = {
    ...operation,
    status: 'completed',
    executedAt: now,
    data: result ? { ...operation.data, result } : operation.data,
  }
  
  await sql`
    UPDATE critical_operations
    SET status = ${updated.status},
        executed_at = ${updated.executedAt?.toISOString()},
        data = ${JSON.stringify(updated.data)}
    WHERE id = ${operationId}
  `
  
  return updated
}

/**
 * Mark a critical operation as failed
 */
export async function failCriticalOperation(
  operationId: string,
  error: string
): Promise<CriticalOperation> {
  const operation = await getCriticalOperation(operationId)
  if (!operation) {
    throw new Error('Operation not found')
  }
  
  const updated: CriticalOperation = {
    ...operation,
    status: 'failed',
    data: { ...operation.data, error },
  }
  
  await sql`
    UPDATE critical_operations
    SET status = ${updated.status},
        data = ${JSON.stringify(updated.data)}
    WHERE id = ${operationId}
  `
  
  return updated
}

/**
 * Rollback a completed critical operation
 */
export async function rollbackCriticalOperation(
  operationId: string,
  reason: string
): Promise<CriticalOperation> {
  const operation = await getCriticalOperation(operationId)
  if (!operation) {
    throw new Error('Operation not found')
  }
  
  if (operation.status !== 'completed') {
    throw new Error(`Cannot rollback operation in status: ${operation.status}`)
  }
  
  if (operation.rollbackUntil && new Date() > operation.rollbackUntil) {
    throw new Error('Rollback window has expired')
  }
  
  const updated: CriticalOperation = {
    ...operation,
    status: 'rolled_back',
    data: { ...operation.data, rollbackReason: reason },
  }
  
  await sql`
    UPDATE critical_operations
    SET status = ${updated.status},
        data = ${JSON.stringify(updated.data)}
    WHERE id = ${operationId}
  `
  
  return updated
}

/**
 * Get a critical operation by ID
 */
export async function getCriticalOperation(
  operationId: string
): Promise<CriticalOperation | null> {
  const rows = await sql`
    SELECT * FROM critical_operations WHERE id = ${operationId}
  `
  
  if (rows.length === 0) {
    return null
  }
  
  const row = rows[0]
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    resourceId: row.resource_id,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    status: row.status,
    requiresApproval: row.requires_approval,
    requiresConfirmation: row.requires_confirmation,
    timeDelaySeconds: row.time_delay_seconds,
    createdAt: new Date(row.created_at),
    approvedAt: row.approved_at ? new Date(row.approved_at) : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
    rollbackUntil: row.rollback_until ? new Date(row.rollback_until) : undefined,
  }
}

/**
 * Check if an operation can be executed (approval + time delay satisfied)
 */
export function canExecuteOperation(operation: CriticalOperation): boolean {
  if (operation.status !== 'approved') {
    return false
  }
  
  if (operation.requiresApproval && !operation.approvedAt) {
    return false
  }
  
  if (operation.timeDelaySeconds > 0 && operation.approvedAt) {
    const delayElapsed = Date.now() - operation.approvedAt.getTime()
    if (delayElapsed < operation.timeDelaySeconds * 1000) {
      return false
    }
  }
  
  return true
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateOperationId(): string {
  return `ops_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Execute a critical operation with fail-safe guarantees
 */
export async function executeCriticalOperation<T>(
  params: {
    type: CriticalOperationType
    userId: number
    walletAddress: string
    resourceId: string
    data: Record<string, unknown>
    amount?: number
  },
  executeFn: (operation: CriticalOperation) => Promise<T>,
  rollbackFn?: (result: T) => Promise<void>
): Promise<{ operation: CriticalOperation; result: T }> {
  const config = getConfig()
  
  // Create the critical operation
  const operation = await createCriticalOperation(params)
  
  try {
    // Check if operation requires approval
    if (operation.requiresApproval) {
      return {
        operation,
        result: null as unknown as T, // Caller must wait for approval
      }
    }
    
    // Check time delay
    if (operation.timeDelaySeconds > 0) {
      const delayMs = operation.timeDelaySeconds * 1000
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    
    // Execute with circuit breaker
    const result = await withCircuitBreaker(params.type, async () => {
      return await executeFn(operation)
    })
    
    // Mark as completed
    const completed = await completeCriticalOperation(operation.id, { result })
    
    return { operation: completed, result }
  } catch (error) {
    // Mark as failed
    await failCriticalOperation(operation.id, error instanceof Error ? error.message : 'Unknown error')
    
    // Attempt rollback if rollback function provided
    if (rollbackFn && operation.status === 'completed') {
      try {
        await rollbackFn(operation.data.result as T)
        await rollbackCriticalOperation(operation.id, 'Automatic rollback after failure')
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError)
      }
    }
    
    throw error
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the fail-safe system (create database table if needed)
 */
export async function initializeFailSafe(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS critical_operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      wallet_address TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      data JSONB NOT NULL,
      status TEXT NOT NULL,
      requires_approval BOOLEAN NOT NULL DEFAULT false,
      requires_confirmation BOOLEAN NOT NULL DEFAULT false,
      time_delay_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      executed_at TIMESTAMPTZ,
      rollback_until TIMESTAMPTZ,
      approver_id INTEGER,
      approver_wallet_address TEXT
    )
  `
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_critical_operations_user ON critical_operations(user_id)
  `
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_critical_operations_resource ON critical_operations(resource_id)
  `
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_critical_operations_status ON critical_operations(status)
  `
  
  console.log('[FAIL-SAFE] Critical operations table initialized')
}
