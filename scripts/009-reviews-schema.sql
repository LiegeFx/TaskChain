-- TaskChain Database Schema Update: Reviews API
-- This migration drops the preliminary reviews table and creates a structured one based on Issue #123.

DROP TABLE IF EXISTS reviews CASCADE;

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  freelancer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Enforce uniqueness: Only one review allowed per contract
  CONSTRAINT uq_reviews_contract UNIQUE (contract_id)
);

CREATE INDEX idx_reviews_freelancer ON reviews(freelancer_id);
