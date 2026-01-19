-- SRS Tool Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Cards table - stores all flashcards
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id TEXT UNIQUE NOT NULL,  -- 8-char hex for display
  card_type TEXT NOT NULL CHECK (card_type IN ('qa', 'cloze', 'occlusion')),

  -- Content
  question TEXT,
  answer TEXT,
  cloze_text TEXT,
  blocked_image TEXT,            -- S3 URL
  reveal_image TEXT,             -- S3 URL

  -- Breadcrumbs (for linking to Obsidian reference)
  topic TEXT,
  subtopic TEXT,
  source_pdf TEXT,
  obsidian_note TEXT,            -- e.g., "Cervical Cytology" for [[Cervical Cytology]]

  -- FSRS state
  stability REAL DEFAULT 0,
  difficulty REAL DEFAULT 0,
  due_date TIMESTAMPTZ DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  review_count INT DEFAULT 0,
  lapses INT DEFAULT 0,
  state TEXT DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning', 'suspended')),

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for cards
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_date);
CREATE INDEX IF NOT EXISTS idx_cards_state ON cards(state);
CREATE INDEX IF NOT EXISTS idx_cards_topic ON cards(topic);
CREATE INDEX IF NOT EXISTS idx_cards_card_id ON cards(card_id);

-- Reviews table - stores review history
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id TEXT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 4),
  time_taken_ms INT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Snapshot before review (for analytics/debugging)
  prev_stability REAL,
  prev_difficulty REAL,
  prev_state TEXT
);

-- Indexes for reviews
CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(reviewed_at);

-- Filtered decks table - stores custom study sessions
CREATE TABLE IF NOT EXISTS filtered_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,

  -- Filter config
  filter_topics TEXT[] DEFAULT '{}',
  filter_tags TEXT[] DEFAULT '{}',
  filter_states TEXT[] DEFAULT '{}',
  max_cards INT,

  -- Progress (card_ids in order, position)
  card_queue TEXT[] DEFAULT '{}',  -- Array of card_ids
  current_position INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for filtered decks
CREATE INDEX IF NOT EXISTS idx_decks_deck_id ON filtered_decks(deck_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_cards_updated_at ON cards;
CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_filtered_decks_updated_at ON filtered_decks;
CREATE TRIGGER update_filtered_decks_updated_at
  BEFORE UPDATE ON filtered_decks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE filtered_decks ENABLE ROW LEVEL SECURITY;

-- For single-user setup, allow all authenticated users full access
-- (You can tighten this later if needed)
CREATE POLICY "Allow all for authenticated users" ON cards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON filtered_decks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow service role full access (for PDF pipeline)
CREATE POLICY "Allow all for service role" ON cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for service role" ON reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for service role" ON filtered_decks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
