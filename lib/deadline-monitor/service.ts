import { sql } from '@/lib/db'
import { createNotification } from '@/lib/notifications'
import { DEADLINE_EXEMPT_STATUSES, getReminderWindowMs } from './types'
import type { DeadlineCheckResult } from './types'

/**
 * Detects milestones approaching or past their due date and keeps the
 * backend in sync: sends a one-time "deadline approaching" reminder, flags
 * milestones as overdue once their due date passes, and notifies both the
 * client and the freelancer on each transition. Designed to be safe to run
 * repeatedly on a schedule — every write path is guarded by a column
 * (`reminder_sent_at` / `is_overdue`) so the same milestone is never
 * notified twice for the same transition.
 */
export class DeadlineMonitorService {
  async runCheck(): Promise<DeadlineCheckResult> {
    const remindersSent = await this.sendUpcomingDeadlineReminders()
    const overdueFlagged = await this.flagOverdueMilestones()
    return { remindersSent, overdueFlagged }
  }

  private async sendUpcomingDeadlineReminders(): Promise<number> {
    const windowMs = getReminderWindowMs()

    const rows = (await sql`
      SELECT m.id, m.title, m.due_date, m.contract_id,
             c.client_id, c.freelancer_id
        FROM milestones m
        JOIN contracts c ON c.id = m.contract_id
       WHERE m.due_date IS NOT NULL
         AND m.due_date <= NOW() + (${windowMs} * INTERVAL '1 millisecond')
         AND m.due_date > NOW()
         AND m.reminder_sent_at IS NULL
         AND m.status != ALL(${[...DEADLINE_EXEMPT_STATUSES]}::milestone_status[])
    `) as RawMilestoneRow[]

    for (const row of rows) {
      await this.notifyBoth(row, 'milestone_deadline_approaching')
      await sql`
        UPDATE milestones SET reminder_sent_at = NOW() WHERE id = ${row.id}::uuid
      `
    }

    return rows.length
  }

  private async flagOverdueMilestones(): Promise<number> {
    const rows = (await sql`
      SELECT m.id, m.title, m.due_date, m.contract_id,
             c.client_id, c.freelancer_id
        FROM milestones m
        JOIN contracts c ON c.id = m.contract_id
       WHERE m.due_date IS NOT NULL
         AND m.due_date <= NOW()
         AND m.is_overdue = FALSE
         AND m.status != ALL(${[...DEADLINE_EXEMPT_STATUSES]}::milestone_status[])
    `) as RawMilestoneRow[]

    for (const row of rows) {
      await sql`
        UPDATE milestones
           SET is_overdue = TRUE,
               overdue_at = NOW(),
               updated_at = NOW()
         WHERE id = ${row.id}::uuid
      `
      await this.notifyBoth(row, 'milestone_overdue')
    }

    return rows.length
  }

  private async notifyBoth(
    row: RawMilestoneRow,
    type: 'milestone_deadline_approaching' | 'milestone_overdue'
  ): Promise<void> {
    const payload = {
      milestoneId: row.id,
      milestoneName: row.title,
      contractId: row.contract_id,
      dueDate: row.due_date,
    }

    await createNotification(row.client_id, type, payload)
    await createNotification(row.freelancer_id, type, payload)
  }
}

interface RawMilestoneRow {
  id: string
  title: string
  due_date: string
  contract_id: string
  client_id: string
  freelancer_id: string
}
