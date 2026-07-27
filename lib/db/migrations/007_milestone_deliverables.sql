CREATE TABLE IF NOT EXISTS milestone_deliverables (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id     UUID        NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  uploader_id      UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  original_filename TEXT       NOT NULL,
  stored_filename   TEXT       NOT NULL,
  mime_type         TEXT       NOT NULL,
  file_size         BIGINT     NOT NULL CHECK (file_size > 0),
  file_hash         TEXT       NOT NULL,

  encryption_iv     TEXT       NOT NULL,
  encryption_key_id TEXT       NOT NULL DEFAULT 'primary',

  file_path         TEXT       NOT NULL,
  is_removed        BOOLEAN    NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestone_deliverables_milestone ON milestone_deliverables (milestone_id)
  WHERE is_removed = FALSE;

CREATE INDEX idx_milestone_deliverables_uploader ON milestone_deliverables (uploader_id);
