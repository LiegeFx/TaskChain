export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface Job<T = unknown> {
  id: string
  type: string
  payload: T
  status: JobStatus
  attempts: number
  maxAttempts: number
  lastError: string | null
  lastErrorAt: string | null
  nextAttemptAt: string
  createdAt: string
  updatedAt: string
}

export type JobHandler = (job: Job) => Promise<void>

export type JobHandlers = Record<string, JobHandler>

export interface EnqueueOptions {
  dedupeKey?: string
  maxAttempts?: number
  runAt?: Date
}

export interface WorkerOptions {
  concurrency?: number
  pollIntervalMs?: number
  maxAttempts?: number
}

export interface JobStats {
  queued: number
  processing: number
  completed: number
  failed: number
}
