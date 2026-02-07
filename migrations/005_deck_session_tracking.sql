-- Migration: Add session tracking columns to filtered_decks
-- Run this in Supabase SQL Editor

-- Track which cards have been seen at least once in this deck
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS cards_introduced TEXT[] DEFAULT '{}';

-- Per-session limits (configurable at deck creation)
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS new_per_session INT DEFAULT 20;
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS review_per_session INT DEFAULT 200;

-- Daily session counters (reset when last_session_date changes)
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS new_today INT DEFAULT 0;
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS reviews_today INT DEFAULT 0;
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS last_session_date DATE;
