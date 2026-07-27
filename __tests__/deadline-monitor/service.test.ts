import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))

import { sql } from '@/lib/db'
import { createNotification } from '@/lib/notifications'
import { DeadlineMonitorService } from '@/lib/deadline-monitor/service'

type SqlMock = ReturnType<typeof vi.fn>

function milestoneRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'milestone-1',
    title: 'Design mockups',
    due_date: '2026-07-26T00:00:00.000Z',
    contract_id: 'contract-1',
    client_id: 'client-1',
    freelancer_id: 'freelancer-1',
    ...overrides,
  }
}

describe('DeadlineMonitorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends no reminders and flags nothing overdue when nothing is due', async () => {
    ;(sql as unknown as SqlMock)
      .mockResolvedValueOnce([]) // reminder sweep
      .mockResolvedValueOnce([]) // overdue sweep

    const service = new DeadlineMonitorService()
    const result = await service.runCheck()

    expect(result).toEqual({ remindersSent: 0, overdueFlagged: 0 })
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('notifies both client and freelancer and marks the reminder as sent', async () => {
    const row = milestoneRow()
    ;(sql as unknown as SqlMock)
      .mockResolvedValueOnce([row]) // reminder sweep finds one milestone
      .mockResolvedValueOnce([]) // UPDATE reminder_sent_at
      .mockResolvedValueOnce([]) // overdue sweep finds nothing

    const service = new DeadlineMonitorService()
    const result = await service.runCheck()

    expect(result.remindersSent).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification).toHaveBeenCalledWith(
      'client-1',
      'milestone_deadline_approaching',
      expect.objectContaining({ milestoneId: 'milestone-1', milestoneName: 'Design mockups' })
    )
    expect(createNotification).toHaveBeenCalledWith(
      'freelancer-1',
      'milestone_deadline_approaching',
      expect.objectContaining({ milestoneId: 'milestone-1' })
    )

    // The UPDATE call for reminder_sent_at must have run.
    expect(sql).toHaveBeenCalledTimes(3)
  })

  it('flags overdue milestones, notifies both parties, and returns the count', async () => {
    const row = milestoneRow({ id: 'milestone-2' })
    ;(sql as unknown as SqlMock)
      .mockResolvedValueOnce([]) // reminder sweep finds nothing
      .mockResolvedValueOnce([row]) // overdue sweep finds one milestone
      .mockResolvedValueOnce([]) // UPDATE is_overdue

    const service = new DeadlineMonitorService()
    const result = await service.runCheck()

    expect(result.overdueFlagged).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification).toHaveBeenCalledWith(
      'client-1',
      'milestone_overdue',
      expect.objectContaining({ milestoneId: 'milestone-2' })
    )
    expect(createNotification).toHaveBeenCalledWith(
      'freelancer-1',
      'milestone_overdue',
      expect.objectContaining({ milestoneId: 'milestone-2' })
    )
  })

  it('handles reminders and overdue milestones in the same run independently', async () => {
    const reminderRow = milestoneRow({ id: 'reminder-milestone' })
    const overdueRow = milestoneRow({ id: 'overdue-milestone' })

    ;(sql as unknown as SqlMock)
      .mockResolvedValueOnce([reminderRow])
      .mockResolvedValueOnce([]) // UPDATE reminder_sent_at
      .mockResolvedValueOnce([overdueRow])
      .mockResolvedValueOnce([]) // UPDATE is_overdue

    const service = new DeadlineMonitorService()
    const result = await service.runCheck()

    expect(result).toEqual({ remindersSent: 1, overdueFlagged: 1 })
    expect(createNotification).toHaveBeenCalledTimes(4)
  })
})
