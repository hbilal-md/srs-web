-- Migration: Add prev_* columns to reviews table for undo support
-- These columns store the full card state before each review, enabling rollback

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prev_review_count INT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prev_lapses INT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prev_due_date TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prev_last_review TIMESTAMPTZ;
