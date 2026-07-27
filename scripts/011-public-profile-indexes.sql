-- 011-public-profile-indexes.sql
--
-- Performance indexes for the public freelancer profile API
-- (TaskChain issue #154), served from /api/public/freelancers/[id]:
--   * profile      — review count + AVG(rating), active-job count, completed-contract count
--   * /contracts   — completed contracts, ordered by completion date
--   * /reviews     — reviews page + AVG(rating) window, optional `verified` filter
--   * /reputation  — completed-contract and review aggregates
--
-- Every one of those reads is keyed on `freelancer_id`, so the goal here is to
-- keep each aggregate an index-only scan over a narrow slice instead of a
-- sequential scan that grows with the whole table.

-- The /contracts listing filters on (freelancer_id, status = 'completed') and
-- the profile/reputation endpoints count the same slice. A partial index keeps
-- it small: only completed contracts are ever publicly listable.
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_completed
  ON contracts (freelancer_id, updated_at DESC)
  WHERE status = 'completed';

-- Reviews are always read newest-first for one freelancer. The composite index
-- serves both the ORDER BY and the COUNT/AVG window in a single scan.
-- (`idx_reviews_freelancer` from 009 covers only the equality predicate.)
CREATE INDEX IF NOT EXISTS idx_reviews_freelancer_created
  ON reviews (freelancer_id, created_at DESC);

-- Supports `?verified=true`, the filter external consumers are most likely to
-- apply, without scanning the freelancer's full review history.
CREATE INDEX IF NOT EXISTS idx_reviews_freelancer_verified
  ON reviews (freelancer_id, created_at DESC)
  WHERE verified;

-- `availability` is derived from in-flight work, so the profile endpoint counts
-- jobs in the three active states. Partial index = only the active slice, which
-- stays small even as completed history accumulates.
CREATE INDEX IF NOT EXISTS idx_jobs_freelancer_active
  ON jobs (freelancer_id)
  WHERE status IN ('assigned', 'in_progress', 'in_review');

-- The /contracts ORDER BY reads jobs.completed_at for each contract row.
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at
  ON jobs (completed_at DESC NULLS LAST)
  WHERE completed_at IS NOT NULL;
