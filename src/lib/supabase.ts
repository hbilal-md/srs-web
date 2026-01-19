import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client with service role (for API routes)
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY not set')
  }
  return createClient(supabaseUrl, serviceKey)
}

// Types for database tables
export interface Card {
  id: string
  card_id: string
  card_type: 'qa' | 'cloze' | 'occlusion'
  question: string | null
  answer: string | null
  cloze_text: string | null
  blocked_image: string | null
  reveal_image: string | null
  topic: string | null
  subtopic: string | null
  source_pdf: string | null
  obsidian_note: string | null
  stability: number
  difficulty: number
  due_date: string
  last_review: string | null
  review_count: number
  lapses: number
  state: 'new' | 'learning' | 'review' | 'relearning' | 'suspended'
  tags: string[]
  flagged: boolean
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  card_id: string
  rating: 1 | 2 | 3 | 4
  time_taken_ms: number | null
  reviewed_at: string
  prev_stability: number | null
  prev_difficulty: number | null
  prev_state: string | null
}

export interface FilteredDeck {
  id: string
  deck_id: string
  name: string
  filter_topics: string[]
  filter_tags: string[]
  filter_states: string[]
  max_cards: number | null
  card_queue: string[]
  current_position: number
  completed: boolean
  created_at: string
  updated_at: string
}
