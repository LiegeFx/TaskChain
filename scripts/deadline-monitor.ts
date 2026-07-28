import { DeadlineMonitorService } from '@/lib/deadline-monitor'
import * as dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Deadline monitor cannot connect to the database.')
  process.exit(1)
}

const CHECK_INTERVAL_MS = Number(process.env.DEADLINE_CHECK_INTERVAL_MS) || 5 * 60_000 // 5 minutes

async function startDeadlineMonitor() {
  const service = new DeadlineMonitorService()
  console.log(`[DeadlineMonitor] Starting scheduled deadline monitor (interval: ${CHECK_INTERVAL_MS}ms)...`)

  const runCheck = async () => {
    try {
      const result = await service.runCheck()
      console.log(
        `[DeadlineMonitor] Check complete — reminders sent: ${result.remindersSent}, newly overdue: ${result.overdueFlagged}`
      )
    } catch (err) {
      console.error('[DeadlineMonitor] Check failed:', err)
    }
  }

  await runCheck()
  setInterval(runCheck, CHECK_INTERVAL_MS)
}

process.on('SIGINT', () => {
  console.log('[DeadlineMonitor] Gracefully shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[DeadlineMonitor] Gracefully shutting down...')
  process.exit(0)
})

startDeadlineMonitor().catch((err) => {
  console.error('[FATAL DeadlineMonitor ERROR]', err)
  process.exit(1)
})
