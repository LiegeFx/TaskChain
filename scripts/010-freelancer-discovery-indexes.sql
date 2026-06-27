-- 010-freelancer-discovery-indexes.sql
--
-- Performance indexes for the GET /api/freelancers discovery endpoint
-- (TaskChain issue #121). The endpoint filters `users` by:
--   * skill membership (skills @> text[])
--   * minimum rating (rating >= N)
--   * user_type IN ('freelancer', 'both')
-- and sorts by rating / created_at / total_jobs_completed / username.
--
-- Adding these indexes keeps the discovery query bounded to the small
-- `freelancer-or-both` slice of `users`, and lets the planner use a GIN
-- index for the skills overlap check (`@>`) instead of a sequential scan.

-- GIN index supports the skills array containment operator (`@>`) used in the
-- skill-filter WHERE clause. It also accelerates `ILIKE` on unnested skills in
-- the free-text search path.
CREATE INDEX IF NOT EXISTS idx_users_skills_gin
  ON users USING GIN (skills);

-- B-tree index for ordered scans and the `rating >= ?` predicate.
CREATE INDEX IF NOT EXISTS idx_users_rating_desc
  ON users (rating DESC NULLS LAST);

-- Partial index keeps the working set small: only freelancers (or folks who
-- can act as freelancers) are candidates for the discovery endpoint.
CREATE INDEX IF NOT EXISTS idx_users_freelancer_discovery
  ON users (id, rating DESC NULLS LAST, total_jobs_completed DESC)
  WHERE user_type IN ('freelancer', 'both');
