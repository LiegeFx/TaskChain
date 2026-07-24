'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  FileText,
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ActivityLog {
  id: string
  actorId: string
  contractId: string | null
  projectId: string | null
  milestoneId: string | null
  disputeId: string | null
  actionType: string
  description: string
  metadata: Record<string, unknown>
  createdAt: string
  actorUsername: string | null
  actorWalletAddress: string | null
  projectTitle: string | null
}

interface ActivityLogPage {
  logs: ActivityLog[]
  pagination: {
    limit: number
    offset: number
    total: number
    nextOffset: number | null
    hasMore: boolean
  }
}

const actionTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  contract_created: { label: 'Contract Created', icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  milestone_created: { label: 'Milestone Created', icon: FileText, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
  milestone_updated: { label: 'Milestone Updated', icon: FileText, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  milestone_submitted: { label: 'Milestone Submitted', icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  milestone_approved: { label: 'Milestone Approved', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  milestone_rejected: { label: 'Milestone Rejected', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  escrow_funded: { label: 'Escrow Funded', icon: Banknote, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  payment_released: { label: 'Payment Released', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500/10' },
  escrow_refunded: { label: 'Escrow Refunded', icon: Banknote, color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  dispute_created: { label: 'Dispute Raised', icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
  dispute_resolved: { label: 'Dispute Resolved', icon: CheckCircle2, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
  contract_completed: { label: 'Contract Completed', icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-600/10' },
  contract_cancelled: { label: 'Contract Cancelled', icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tc_dev_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityLogPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all')
  const limit = 20

  const fetchActivity = useCallback(async (currentOffset: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(currentOffset))
      if (actionTypeFilter !== 'all') params.set('actionType', actionTypeFilter)

      const res = await fetch(`/api/activity?${params.toString()}`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      })
      if (!res.ok) return
      setData(await res.json() as ActivityLogPage)
    } finally {
      setLoading(false)
    }
  }, [actionTypeFilter])

  useEffect(() => {
    setOffset(0)
    fetchActivity(0)
  }, [fetchActivity])

  const goToPage = (newOffset: number) => {
    setOffset(newOffset)
    fetchActivity(newOffset)
  }

  const logs = data?.logs ?? []
  const pagination = data?.pagination

  return (
    <div className="p-8">
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Activity Log</h1>
            <p className="text-muted-foreground mt-2">
              Track all actions across your contracts and projects
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={actionTypeFilter}
              onValueChange={(val) => {
                setActionTypeFilter(val)
                setOffset(0)
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="contract_created">Contract Created</SelectItem>
                <SelectItem value="milestone_created">Milestone Created</SelectItem>
                <SelectItem value="milestone_updated">Milestone Updated</SelectItem>
                <SelectItem value="milestone_submitted">Milestone Submitted</SelectItem>
                <SelectItem value="milestone_approved">Milestone Approved</SelectItem>
                <SelectItem value="milestone_rejected">Milestone Rejected</SelectItem>
                <SelectItem value="escrow_funded">Escrow Funded</SelectItem>
                <SelectItem value="payment_released">Payment Released</SelectItem>
                <SelectItem value="escrow_refunded">Escrow Refunded</SelectItem>
                <SelectItem value="dispute_created">Dispute Raised</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchActivity(offset)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading activity logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground">No activity logs found.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {logs.map((log) => {
                const config = actionTypeConfig[log.actionType]
                const Icon = config?.icon ?? Clock
                const color = config?.color ?? 'text-muted-foreground'
                const bgColor = config?.bgColor ?? 'bg-muted/30'

                return (
                  <div
                    key={log.id}
                    className="p-5 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`h-10 w-10 rounded-full ${bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`h-5 w-5 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {config && (
                            <Badge variant="outline" className="text-xs font-medium">
                              {config.label}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm">{log.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{log.actorUsername ?? log.actorWalletAddress ?? 'Unknown'}</span>
                          {log.projectTitle && (
                            <>
                              <span>&bull;</span>
                              <span>{log.projectTitle}</span>
                            </>
                          )}
                          <span>&bull;</span>
                          <span>{formatTimeAgo(log.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {pagination && pagination.total > limit && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(offset - limit)}
                  disabled={offset === 0}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {Math.floor(offset / limit) + 1} of {Math.ceil(pagination.total / limit)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(offset + limit)}
                  disabled={!pagination.hasMore}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}