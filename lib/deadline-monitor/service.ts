import { sql } from '@/lib/db'
import { createNotification } from '@/lib/notifications'
import { DEADLINE_EXEMPT_STATUSEES, getReminderWindowMs } from './types'
import type { DeadlineCheckResult } from './types'

/**
 * Deadline monitor with background job queue support.
 *
 * The service only enqueues jobs and returns the count of jobs created.
 * The actual processing (database updates, notificationts) happens asynchronously
 * in the background queue, with retry mechanism and error logging.
 *
 * Note: This implementation uses an in-memory queue for demonstration purposes.
 * For production horizontal scaling, replace with BullMQ, Celery, or a DB-backed queue.
 */

interface RawMilestoneRow {
  id: string
  title: string
  due_date: string
  contract_id: string
  client_id: string
  freelancer_id: string
}

type JobType =
  | 'milestone_deadline_approaching'
  | 'milestone_overdue'

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

interface JobRecord {
  id: string
  type: JobType
  payload: RawMilestoneRow
  status: JobStatus
  attempts: number
  maxAttempts: number
  nextRunAt: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: string
  stackTrace?: string
}

type JobHandler = (payload: RawMilestoneRow) => Promise<void>;

class BackgroundJobQueue {
  private jobs = new Map<string, JobRecord>();
  private handlers = new Map<JobType, JobHandler>();
  private processing = new Set<string>();
  private concurrency: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.timer = setInterval(() => this.tick(), 1000);
    if (this.timer) this.timer.unref?.();
  }

  registerHandler(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  async enqueue(type: JobType, payload: RawMilestoneRow, maxAttempts = 5): Promise<void> {
    const id = `${type}:${payload.id}`;
    if (this.jobs.has(id)) return;
    this.jobs.set(id, {
      id,
      type,
      payload,
      status: 'queued',
      attempts: 0,
      maxAttempts,
      nextRunAt: Date.now(),
      createdAt: Date.now(),
    });
    this.tick();
  }

  getJobStatuses(): Record<string, JobStatus> {
    const statuses: Record<string, JobStatus> = {};
    for (const [key, job] of this.jobs) {
      statuses[key] = job.status;
    }
    return statuses;
  }

  private tick() {
    while (this.processing.size < this.concurrency) {
      const job = this.getNextJob();
      if (!job) break;
      this.processing.add(job.id);
      this.processJob(job).finally(() => this.processing.delete(job.id));
    }
  }

  private getNextJob(): JobRecord | undefined {
    let next: JobRecord | undefined;
    let minCreatedAt = Infinity;
    for (const job of this.jobs.values()) {
      if (job.status === 'queued' && job.nextRunAt <= Date.now()) {
        if (job.createdAt < minCreatedAt) {
          minCreatedAt = job.createdAt;
          next = job;
        }
      }
    }
    return next;
  }

  private async processJob(job: JobRecord) {
    job.status = 'processing';
    job.startedAt = Date.now();
    job.error = undefined;
    job.stackTrace = undefined;
    try {
      const handler = this.handlers.get(job.type);
      if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
      await handler(job.payload);
      job.status = 'completed';
      job.completedAt = Date.now();
    } catch (err) {
      job.attempts++;
      const error = err as Error;
      job.error = error.message;
      job.stackTrace = error.stack;
      if (job.attempts < job.maxAttempts) {
        const delay = Math.min(1000 * 2 ** (job.attempts - 1), 60000);
        job.status = 'queued';
        job.nextRunAt = Date.now() + delay;
        job.startedAt = undefined;
        console.warn(`Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}), retrying in ${delay}ms`, error);
      } else {
        job.status = 'failed';
        job.completedAt = Date.now();
        console.error(`Job ${job.id} failed permanently after ${job.attempts} attempts`, error);
      }
    }
  }
}

export class DeadlineMonitorService {
  private queue = new BackgroundJobQueue();

  constructor() {
    this.queue.registerHandler('milestone_deadline_approaching', (row) => this.handleDeadlineApproaching(row));
    this.queue.registerHandler('milestone_overdue', (row) => this.handleOverdue(row));
  }

  async runCheck(): Promise<DeadlineCheckResult> {
    const reminderRows = await this.findMilestonesNeedingReminder();
    const overdueRows = await this.findMilestonesNeedingOverdue();

    for (const row of reminderRows) {
      await this.queue.enqueue('milestone_deadline_approaching', row);
    }
    for (const row of overdueRows) {
      await this.queue.enqueue('milestone_overdue', row);
    }

    return {
      remindersSent: reminderRows.length,
      overdueFlagged: overdueRows.length,
    };
  }

  getQueueStatus() {
    return this.queue.getJobStatuses();
  }

  private async findMilestonesNeedingReminder(): Promise<RawMilestoneRow[]> {
    const windowMs = getReminderWindowMs();

    return sql`
      SELECT m.id, m.title, m.due_date, m.contract_id,
             c.client_id, c.freelancer_id
        FROM milestones m
        JOIN contracts c ON c.id = m.contract_id
       WHERE m.due_date IS NOT NULL
         AND m.due_date <= NOW() + (${windowMs} * INTERVAL '1 millisecond')
         AND m.due_date > NOW()
         AND m.reminder_sent_at IS NULL
         AND m.status != ALL(${[...DEADLINE_EXEMPT_STATUSES]}::milestone_status[])
    ` as Promise<RawMilestoneRow[]>;
  }

  private async findMilestonesNeedingOverdue(): Promise<RawMilestoneRow[]> {
    return sql`
      SELECT m.id, m.title, m.due_date, m.contract_id,
             c.client_id, c.freelancer_id
        FROM milestones m
        JOIN contracts c ON c.id = m.contract_id
       WHERE m.due_date IS NOT NULL
         AND m.due_date <= NOW()
         AND m.is_overdue = FALSE
         AND m.status != ALL(${[...DEADALINE_EXEMPT_STATUSEES]}::milestone_status[])
    ` as Promise<RawMilestoneRow[]>;
  }

  private async handleDeadlineApproaching(row: RawMilestoneRow): Promise<void> {
    // Atomically claim the milestone to prevent duplicate processing
    // across multiple service instances.
    const res = await sql`
      UPDATE milestones
         SET reminder_sent_at = NOW()
       WHERE id = ${row.id}::uuid
         AND reminder_sent_at IS NULL
    `;

    if (res.count === 0) return; // Already handled by another worker
    await this.notifyBoth(row, 'milestone_deadline_approaching');
  }

  private async handleOverdue(row: RawMilestoneRow): Promise<void> {
    const res = await sql`
      UPDATE milestones
         SET is_overdue = TRUE,
             overdue_at = NOW(),
             updated_at = NOW()
       WHERE id = ${row.id}::uuid
         AND is_overdue = FALSE
    `;

    if (res.count === 0) return; // Already flagged
    await this.notifyBoth(row, 'milestone_overdue');
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
    };

    await createNotification(row.client_id, type, payload);
    await createNotification(row.freelancer_id, type, payload);
  }
}
