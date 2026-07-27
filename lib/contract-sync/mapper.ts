import type {
  SorobanContractEvent,
  SorobanEventPayload,
} from './types'

export interface ContractStatusUpdate {
  escrowStatus?: string
  contractStatus?: string
  fundedAt?: string
  fundingTxHash?: string
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelledReason?: string
  activeDisputeId?: string | null
}

export interface MilestoneStatusUpdate {
  status: string
  submittedAt?: string
  approvedAt?: string
  paidAt?: string
  releaseTxHash?: string
  rejectionReason?: string | null
}

export interface SyncAction {
  kind: 'update_contract' | 'update_milestone' | 'update_both' | 'create_dispute' | 'noop'
  contractUpdate: ContractStatusUpdate | null
  milestoneUpdate: MilestoneStatusUpdate | null
  milestoneId: number | null
  disputeInfo: {
    milestoneId?: number
    reason?: string
  } | null
}

function nowISO(): string {
  return new Date().toISOString()
}

export function mapEventToAction(event: SorobanContractEvent, data: SorobanEventPayload): SyncAction {
  switch (event) {
    case 'init':
      return {
        kind: 'noop',
        contractUpdate: null,
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }

    case 'fund':
      return {
        kind: 'update_contract',
        contractUpdate: {
          escrowStatus: 'funded',
          contractStatus: 'active',
          fundedAt: nowISO(),
          startedAt: nowISO(),
        },
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }

    case 'submit':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'submitted',
          submittedAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'approve':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'approved',
          approvedAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'confirm':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'approved',
          approvedAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'release':
      return {
        kind: 'update_both',
        contractUpdate: {
          escrowStatus: 'fully_released',
          contractStatus: 'completed',
          completedAt: nowISO(),
        },
        milestoneUpdate: {
          status: 'paid',
          paidAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'refund':
      return {
        kind: 'update_both',
        contractUpdate: {
          escrowStatus: 'refunded',
          contractStatus: 'cancelled',
          cancelledAt: nowISO(),
          cancelledReason: 'Refunded on-chain',
        },
        milestoneUpdate: {
          status: 'refunded',
          rejectionReason: 'Refunded on-chain',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'dispute':
      return {
        kind: 'update_both',
        contractUpdate: {
          contractStatus: 'disputed',
        },
        milestoneUpdate: {
          status: 'disputed',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: {
          milestoneId: data.milestoneId ?? undefined,
          reason: 'Dispute raised on-chain',
        },
      }

    case 'resolve':
      return {
        kind: 'update_both',
        contractUpdate: {
          contractStatus: 'completed',
          completedAt: nowISO(),
        },
        milestoneUpdate: {
          status: 'paid',
          paidAt: nowISO(),
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    case 'expire':
      return {
        kind: 'update_milestone',
        contractUpdate: null,
        milestoneUpdate: {
          status: 'auto_expired',
          rejectionReason: 'Milestone deadline exceeded',
        },
        milestoneId: data.milestoneId ?? null,
        disputeInfo: null,
      }

    default:
      return {
        kind: 'noop',
        contractUpdate: null,
        milestoneUpdate: null,
        milestoneId: null,
        disputeInfo: null,
      }
  }
}
