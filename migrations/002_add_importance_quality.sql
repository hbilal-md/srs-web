-- Migration: Add importance and quality fields for card optimization
-- Run this in Supabase SQL Editor

-- Add importance field (core vs supporting)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'core' CHECK (importance IN ('core', 'supporting'));

-- Add quality grade field (A/B/C)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS quality TEXT DEFAULT 'A' CHECK (quality IN ('A', 'B', 'C'));

-- Create index for filtering by importance
CREATE INDEX IF NOT EXISTS idx_cards_importance ON cards(importance);

-- Create index for filtering by quality
CREATE INDEX IF NOT EXISTS idx_cards_quality ON cards(quality);

-- Update filtered_decks to support importance filtering
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_importance TEXT[] DEFAULT '{}';
