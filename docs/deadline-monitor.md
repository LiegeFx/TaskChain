# Scheduled Contract Deadline Monitor

## Overview

A scheduled service that sweeps milestones for approaching and missed due dates, keeping both clients and freelancers informed without anyone having to check manually. It runs independently of the Soroban contract-sync worker (see `docs/sync-flow.md`) — this monitor only cares about `due_date`, not on-chain events.

## Architecture

```
                 ┌─────────────────────────┐
  every N min ─> │  DeadlineMonitorService  │
                 │      .runCheck()        │
                 └───────────┬─────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
     sendUpcomingDeadlineReminders   flagOverdueMilestones
                │                            │
        milestones due within         milestones past due_date,
        24h, not yet reminded         not yet flagged overdue
                │                            │
                ▼                            ▼
        reminder_sent_at = NOW()     is_overdue = TRUE, overdue_at = NOW()
                │                            │
                └─────────────┬──────────────┘
                              ▼
                 createNotification(client, ...)
                 createNotification(freelancer, ...)
                              │
                              ▼
                    `notifications` table
                 (surfaced in the dashboard
                    notification panel)
```

## Key Components

### 1. Service (`lib/deadline-monitor/service.ts`)

`DeadlineMonitorService.runCheck()` performs two independent sweeps and returns `{ remindersSent, overdueFlagged }`:

1. **Upcoming deadline reminders** — milestones with `due_date` in the next 24 hours, not already reminded, and not in a terminal status (`approved`, `paid`, `rejected`). Sends one notification to the client and one to the freelancer, then sets `reminder_sent_at` so it is never sent twice.
2. **Overdue flagging** — milestones whose `due_date` has passed, not already flagged, and not in a terminal status. Sets `is_overdue = TRUE` and `overdue_at = NOW()`, then notifies both parties.

Both sweeps are idempotent by design: re-running `runCheck()` on a schedule only acts on milestones that haven't crossed that particular threshold yet, so it's safe to run as often as needed without spamming users.

### 2. Types (`lib/deadline-monitor/types.ts`)

- `DEADLINE_EXEMPT_STATUSES` — milestone statuses (`approved`, `paid`, `rejected`) that no longer need deadline tracking.
- `getReminderWindowMs()` — how far ahead of the due date to send the "approaching" reminder (24 hours).

### 3. Notifications (`lib/notifications.ts`)

Reminder and overdue events reuse the existing `notifications` table and API rather than introducing a parallel event log — `milestone_deadline_approaching` and `milestone_overdue` were added to `NotificationType`. This means they automatically get pagination, read/unread state, and UI rendering (`components/dashboard/notification-item.tsx`) for free.

### 4. Database changes (`lib/db/migrations/008_deadline_monitor.sql`)

```sql
ALTER TABLE milestones
  ADD COLUMN is_overdue        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN overdue_at        TIMESTAMPTZ,
  ADD COLUMN reminder_sent_at  TIMESTAMPTZ;
```

Plus a partial index (`idx_milestones_overdue_sweep`) on `due_date` for milestones not yet flagged overdue, so the sweep query stays fast as the table grows.

## Running the Monitor

### Prerequisites

1. `DATABASE_URL` set in `.env`.
2. Migrations applied: `npm run migrate`.

### Start

```bash
npm run deadline-monitor
# or directly:
tsx scripts/deadline-monitor.ts
```

### Configuration

- `DEADLINE_CHECK_INTERVAL_MS` — how often to sweep (default: `300000` = 5 minutes).

The worker runs one check immediately on startup, then on the configured interval, logging a summary after each pass:

```
[DeadlineMonitor] Check complete — reminders sent: 2, newly overdue: 1
```

## Testing

```bash
npx vitest run __tests__/deadline-monitor
```

Unit tests cover:
- No-op behavior when nothing is due
- Reminder notifications + `reminder_sent_at` bookkeeping
- Overdue flagging + notifications
- Both sweeps running independently within the same `runCheck()` call
