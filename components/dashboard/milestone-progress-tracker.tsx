'use client'

import React, { useMemo } from 'react'
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ThumbsUp,
  DollarSign,
  Calendar,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────

export type MilestoneState = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'paid'

export interface MilestoneTrackerData {
  id: string
  title: string
  description?: string
  amount: number
  state: MilestoneState
  dueDate?: string
  completionDate?: string
  order: number
  submittedDate?: string
  approvedDate?: string
}

export interface MilestoneProgressTrackerProps {
  milestones: MilestoneTrackerData[]
  projectId?: string
  variant?: 'stepper' | 'cards' | 'timeline'
  showProgress?: boolean
  compact?: boolean
  onMilestoneClick?: (milestone: MilestoneTrackerData) => void
}

// ─── State Configuration ────────────────────────────────────────────────────

const STATE_CONFIG: Record<MilestoneState, {
  label: string
  color: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  bgColor: string
  borderColor: string
  textColor: string
  progressColor: string
}> = {
  pending: {
    label: 'Pending',
    color: 'text-yellow-600 dark:text-yellow-400',
    icon: Clock,
    bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    progressColor: 'bg-yellow-500',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-blue-600 dark:text-blue-400',
    icon: TrendingUp,
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300',
    progressColor: 'bg-blue-500',
  },
  submitted: {
    label: 'Submitted',
    color: 'text-purple-600 dark:text-purple-400',
    icon: FileCheck,
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    textColor: 'text-purple-700 dark:text-purple-300',
    progressColor: 'bg-purple-500',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-600 dark:text-green-400',
    icon: ThumbsUp,
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-300',
    progressColor: 'bg-green-500',
  },
  paid: {
    label: 'Paid',
    color: 'text-emerald-600 dark:text-emerald-400',
    icon: DollarSign,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    progressColor: 'bg-emerald-500',
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Calculate the progress percentage based on milestone states
 * Weights: pending=0%, in_progress=25%, submitted=50%, approved=75%, paid=100%
 */
function calculateProgress(milestones: MilestoneTrackerData[]): number {
  if (milestones.length === 0) return 0

  const stateWeights: Record<MilestoneState, number> = {
    pending: 0,
    in_progress: 25,
    submitted: 50,
    approved: 75,
    paid: 100,
  }

  const totalWeight = milestones.reduce((sum, m) => sum + stateWeights[m.state], 0)
  return Math.round(totalWeight / milestones.length)
}

/**
 * Get the state order (0-4) for determining progress in timeline
 */
function getStateOrder(state: MilestoneState): number {
  const order: Record<MilestoneState, number> = {
    pending: 0,
    in_progress: 1,
    submitted: 2,
    approved: 3,
    paid: 4,
  }
  return order[state]
}

/**
 * Format currency
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/**
 * Format date
 */
function formatDate(date: string | undefined): string {
  if (!date) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

// ─── Card Variant ──────────────────────────────────────────────────────────

interface MilestoneCardProps {
  milestone: MilestoneTrackerData
  isLast: boolean
  compact?: boolean
  onClick?: () => void
}

function MilestoneCard({ milestone, compact, onClick }: MilestoneCardProps) {
  const config = STATE_CONFIG[milestone.state]
  const Icon = config.icon

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative p-4 rounded-lg border transition-all',
        config.bgColor,
        config.borderColor,
        onClick && 'cursor-pointer hover:shadow-md'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={cn('p-2 rounded-lg', config.bgColor, 'flex-shrink-0')}>
          <Icon className={cn('h-5 w-5', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm md:text-base truncate">
            {milestone.title}
          </h4>
          {!compact && milestone.description && (
            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
              {milestone.description}
            </p>
          )}
        </div>
        <Badge variant="outline" className={cn(config.textColor, 'flex-shrink-0')}>
          {config.label}
        </Badge>
      </div>

      {/* Details Grid */}
      <div className={cn(
        'grid gap-3',
        compact ? 'grid-cols-2' : 'grid-cols-3'
      )}>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Amount
          </p>
          <p className="font-semibold text-sm">{formatCurrency(milestone.amount)}</p>
        </div>

        {!compact && (
          <>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Due Date
              </p>
              <p className="font-semibold text-sm">
                {formatDate(milestone.dueDate)}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" />
                Order
              </p>
              <p className="font-semibold text-sm">#{milestone.order}</p>
            </div>
          </>
        )}

        {compact && milestone.dueDate && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Due
            </p>
            <p className="font-semibold text-sm">
              {formatDate(milestone.dueDate)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stepper Variant ───────────────────────────────────────────────────────

interface MilestoneStepperProps {
  milestones: MilestoneTrackerData[]
  compact?: boolean
  onClick?: (milestone: MilestoneTrackerData) => void
}

function MilestoneStepper({ milestones, compact, onClick }: MilestoneStepperProps) {
  return (
    <div className="space-y-4">
      {milestones.map((milestone, index) => {
        const config = STATE_CONFIG[milestone.state]
        const Icon = config.icon
        const isCompleted = getStateOrder(milestone.state) === 4
        const isInProgress = getStateOrder(milestone.state) > 0 && !isCompleted
        const isLast = index === milestones.length - 1

        return (
          <div
            key={milestone.id}
            onClick={() => onClick?.(milestone)}
            className={cn('flex gap-4 relative', onClick && 'cursor-pointer')}
          >
            {/* Connector Line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-6 top-12 w-0.5 h-12 -ml-0.5',
                  isCompleted ? config.progressColor : 'bg-muted'
                )}
              />
            )}

            {/* Step Indicator */}
            <div className="relative pt-1 flex-shrink-0">
              <div
                className={cn(
                  'h-12 w-12 rounded-full border-2 flex items-center justify-center transition-all',
                  isCompleted || isInProgress
                    ? `${config.borderColor} ${config.bgColor}`
                    : 'border-muted bg-muted/50'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className={cn('h-6 w-6', config.color)} />
                ) : (
                  <Icon className={cn(
                    'h-6 w-6',
                    isInProgress ? config.color : 'text-muted-foreground'
                  )} />
                )}
              </div>
            </div>

            {/* Step Content */}
            <div className="flex-1 pb-4 pt-1">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="font-semibold text-sm md:text-base">
                    {milestone.title}
                  </h4>
                  {!compact && milestone.description && (
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {milestone.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={config.textColor}>
                  {config.label}
                </Badge>
              </div>

              <div className={cn(
                'grid gap-2 text-xs',
                compact ? 'grid-cols-2' : 'grid-cols-3'
              )}>
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <p className="font-semibold">{formatCurrency(milestone.amount)}</p>
                </div>
                {!compact && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Due:</span>
                      <p className="font-semibold">{formatDate(milestone.dueDate)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Order:</span>
                      <p className="font-semibold">#{milestone.order}</p>
                    </div>
                  </>
                )}
                {compact && milestone.dueDate && (
                  <div>
                    <span className="text-muted-foreground">Due:</span>
                    <p className="font-semibold">{formatDate(milestone.dueDate)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Timeline Variant ──────────────────────────────────────────────────────

interface MilestoneTimelineProps {
  milestones: MilestoneTrackerData[]
  compact?: boolean
  onClick?: (milestone: MilestoneTrackerData) => void
}

function MilestoneTimeline({ milestones, compact, onClick }: MilestoneTimelineProps) {
  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-2 md:gap-1 overflow-x-auto pb-2">
        {sortedMilestones.map((milestone, index) => {
          const config = STATE_CONFIG[milestone.state]
          const Icon = config.icon
          const isLast = index === sortedMilestones.length - 1

          return (
            <div key={milestone.id} className="flex items-center gap-2 flex-shrink-0">
              <div
                onClick={() => onClick?.(milestone)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                  config.bgColor,
                  config.borderColor,
                  onClick && 'cursor-pointer hover:shadow-md'
                )}
              >
                <Icon className={cn('h-5 w-5', config.color)} />
                <div className="text-center">
                  <p className="text-xs font-semibold line-clamp-2 max-w-[100px]">
                    {milestone.title}
                  </p>
                  {!compact && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(milestone.amount)}
                    </p>
                  )}
                </div>
              </div>

              {!isLast && (
                <div className="hidden md:flex h-0.5 w-4 md:w-8 bg-muted" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function MilestoneProgressTracker({
  milestones,
  variant = 'stepper',
  showProgress = true,
  compact = false,
  onMilestoneClick,
}: MilestoneProgressTrackerProps) {
  const progress = useMemo(() => calculateProgress(milestones), [milestones])
  const paidCount = useMemo(
    () => milestones.filter(m => m.state === 'paid').length,
    [milestones]
  )
  const totalAmount = useMemo(
    () => milestones.reduce((sum, m) => sum + m.amount, 0),
    [milestones]
  )
  const paidAmount = useMemo(
    () => milestones
      .filter(m => m.state === 'paid')
      .reduce((sum, m) => sum + m.amount, 0),
    [milestones]
  )

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No milestones to track</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      {showProgress && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Project Progress
              </h3>
              <span className="text-2xl font-bold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Total Milestones</p>
              <p className="font-semibold text-lg">{milestones.length}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="font-semibold text-lg">{paidCount}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Total Budget</p>
              <p className="font-semibold text-lg">{formatCurrency(totalAmount)}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Released</p>
              <p className="font-semibold text-lg">{formatCurrency(paidAmount)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Milestones Container */}
      <div className="space-y-4">
        {variant === 'stepper' && (
          <MilestoneStepper
            milestones={milestones}
            compact={compact}
            onClick={onMilestoneClick}
          />
        )}

        {variant === 'cards' && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-1">
            {milestones.map((milestone, index) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                isLast={index === milestones.length - 1}
                compact={compact}
                onClick={() => onMilestoneClick?.(milestone)}
              />
            ))}
          </div>
        )}

        {variant === 'timeline' && (
          <MilestoneTimeline
            milestones={milestones}
            compact={compact}
            onClick={onMilestoneClick}
          />
        )}
      </div>
    </div>
  )
}

export default MilestoneProgressTracker
