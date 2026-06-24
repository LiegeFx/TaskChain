/**
 * Milestone Progress Tracker Types
 * Types for the milestone progress tracking system
 */

export type MilestoneState = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'paid'

export interface MilestoneTrackerData {
  id: string
  projectId?: string
  title: string
  description?: string
  amount: number
  state: MilestoneState
  dueDate?: string
  completedDate?: string
  submittedDate?: string
  approvedDate?: string
  order: number
}

export interface MilestoneStateTransition {
  from: MilestoneState
  to: MilestoneState
  timestamp: Date
}

export interface MilestoneProgressMetrics {
  totalMilestones: number
  completedMilestones: number
  progressPercentage: number
  totalBudget: number
  releasedAmount: number
  pendingAmount: number
}

/**
 * Calculate progress metrics from milestones
 */
export function calculateMilestoneMetrics(
  milestones: MilestoneTrackerData[]
): MilestoneProgressMetrics {
  const totalMilestones = milestones.length
  const completedMilestones = milestones.filter(m => m.state === 'paid').length

  const stateWeights: Record<MilestoneState, number> = {
    pending: 0,
    in_progress: 25,
    submitted: 50,
    approved: 75,
    paid: 100,
  }

  const totalWeight = milestones.reduce((sum, m) => sum + stateWeights[m.state], 0)
  const progressPercentage = totalMilestones > 0 ? Math.round(totalWeight / totalMilestones) : 0

  const totalBudget = milestones.reduce((sum, m) => sum + m.amount, 0)
  const releasedAmount = milestones
    .filter(m => m.state === 'paid')
    .reduce((sum, m) => sum + m.amount, 0)
  const pendingAmount = totalBudget - releasedAmount

  return {
    totalMilestones,
    completedMilestones,
    progressPercentage,
    totalBudget,
    releasedAmount,
    pendingAmount,
  }
}

/**
 * Get allowed state transitions for a milestone
 */
export function getAllowedStateTransitions(currentState: MilestoneState): MilestoneState[] {
  const transitions: Record<MilestoneState, MilestoneState[]> = {
    pending: ['in_progress'],
    in_progress: ['submitted'],
    submitted: ['approved', 'pending'],
    approved: ['paid', 'pending'],
    paid: [],
  }
  return transitions[currentState] || []
}

/**
 * Check if a state transition is valid
 */
export function isValidStateTransition(
  from: MilestoneState,
  to: MilestoneState
): boolean {
  return getAllowedStateTransitions(from).includes(to)
}

/**
 * Format milestone state for display
 */
export function formatMilestoneState(state: MilestoneState): string {
  const labels: Record<MilestoneState, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    approved: 'Approved',
    paid: 'Paid',
  }
  return labels[state]
}
