import { sql } from "@/lib/db";
import { dispatchNotification } from "@/lib/notifications";

export type ContractStatus = 
  | 'draft'
  | 'pending'
  | 'pending_funding'
  | 'active'
  | 'submitted'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'paused';

export interface TransitionStateInput {
  contractId: string;
  newStatus: ContractStatus;
  userId: string;
  reason?: string;
  contractName?: string;
}

export class ContractStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractStateError';
  }
}

// Define valid state transitions
const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['pending_funding', 'cancelled'],
  pending: ['active', 'cancelled', 'pending_funding'], // Legacy support
  pending_funding: ['active', 'cancelled'],
  active: ['submitted', 'disputed', 'cancelled', 'completed', 'paused'],
  paused: ['active', 'cancelled', 'disputed'],
  submitted: ['completed', 'active', 'disputed', 'cancelled'],
  disputed: ['completed', 'cancelled', 'active'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
};

export class ContractStateService {
  /**
   * Transitions a contract from its current state to a new state.
   * Enforces rules, logs the transition, and broadcasts events.
   *
   * @throws ContractStateError if the transition is invalid or contract not found
   */
  async transitionState(input: TransitionStateInput): Promise<void> {
    const { contractId, newStatus, userId, reason } = input;

    // Fetch the current status and users
    const rows = await sql`
      SELECT status, client_id, freelancer_id 
      FROM contracts 
      WHERE id = ${contractId}
    `;

    if (rows.length === 0) {
      throw new ContractStateError(`Contract with id ${contractId} not found.`);
    }

    const contract = rows[0];
    const currentStatus = contract.status as ContractStatus;
    const clientId = contract.client_id as string;
    const freelancerId = contract.freelancer_id as string;

    // Validate transition
    if (currentStatus === newStatus) {
      return; // No-op
    }

    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ContractStateError(
        `Invalid state transition from '${currentStatus}' to '${newStatus}'.`
      );
    }

    // Execute updates within a transaction using our SQL template
    await sql.begin(async (sqlTransaction) => {
      // 1. Update the contract status
      await sqlTransaction`
        UPDATE contracts
        SET status = ${newStatus}::contract_status, updated_at = NOW()
        WHERE id = ${contractId}
      `;

      // 2. Insert the audit log
      await sqlTransaction`
        INSERT INTO contract_state_logs (
          contract_id, previous_status, new_status, changed_by_user_id, reason
        ) VALUES (
          ${contractId}, 
          ${currentStatus}::contract_status, 
          ${newStatus}::contract_status, 
          ${userId}, 
          ${reason || null}
        )
      `;
    });

    // 3. Broadcast notifications outside the transaction to avoid rollback issues
    const contractName = input.contractName || 'Contract';
    const notificationPayload = {
      contractId,
      contractName,
      previousStatus: currentStatus,
      newStatus,
      reason,
    };

    // Notify client
    if (userId !== clientId) {
      await dispatchNotification(clientId, 'contract_state_changed', notificationPayload)
        .catch(err => console.error(`Failed to notify client ${clientId}:`, err));
    }

    // Notify freelancer
    if (userId !== freelancerId) {
      await dispatchNotification(freelancerId, 'contract_state_changed', notificationPayload)
        .catch(err => console.error(`Failed to notify freelancer ${freelancerId}:`, err));
    }
  }

  /**
   * Fetches the audit trail for a specific contract.
   */
  async getContractStateLogs(contractId: string) {
    const rows = await sql`
      SELECT 
        l.id, 
        l.previous_status, 
        l.new_status, 
        l.reason, 
        l.created_at,
        u.display_name as changed_by
      FROM contract_state_logs l
      LEFT JOIN users u ON l.changed_by_user_id = u.id
      WHERE l.contract_id = ${contractId}
      ORDER BY l.created_at DESC
    `;
    return rows;
  }
}

export const contractStateService = new ContractStateService();
