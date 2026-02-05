-- Migration: Add new filter columns to filtered_decks
-- Run this in Supabase SQL Editor

ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_subtopics TEXT[] DEFAULT '{}';
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_importance TEXT[] DEFAULT '{}';
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_quality TEXT[] DEFAULT '{}';
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_difficulty_min REAL;
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS filter_difficulty_max REAL;
ALTER TABLE filtered_decks ADD COLUMN IF NOT EXISTS sort_order TEXT DEFAULT 'due_date';
