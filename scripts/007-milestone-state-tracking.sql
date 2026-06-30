-- Migration: Add milestone state tracking columns
-- This migration extends the milestones table to support the new state model:
-- pending -> in_progress -> submitted -> approved -> paid

-- Step 1: Add new columns to track state transitions
ALTER TABLE milestones 
ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'pending' 
  CHECK (state IN ('pending', 'in_progress', 'submitted', 'approved', 'paid'));

ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS milestone_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS submitted_date TIMESTAMP;

ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS approved_date TIMESTAMP;

ALTER TABLE milestones
ADD COLUMN IF NOT EXISTS completed_date TIMESTAMP;

-- Step 2: Create index for the new state column
CREATE INDEX IF NOT EXISTS idx_milestones_state ON milestones(state);
CREATE INDEX IF NOT EXISTS idx_milestones_order ON milestones(milestone_order);

-- Step 3: Add comment
COMMENT ON COLUMN milestones.state IS 'Milestone state: pending, in_progress, submitted, approved, paid';
COMMENT ON COLUMN milestones.milestone_order IS 'Order of the milestone in the project sequence (1-based)';
