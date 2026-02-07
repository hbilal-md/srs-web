import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Disable caching for this route
export const dynamic = 'force-dynamic'

function generateDeckId(): string {
  return Math.random().toString(16).slice(2, 10)
}

/**
 * GET /api/decks
 * List all filtered decks with progress
 */
export async function GET() {
  try {
    const supabase = createServiceClient()

    const { data: decks, error } = await supabase
      .from('filtered_decks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching decks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Collect all unique card IDs across all decks for batch lookup
    const allCardIds = new Set<string>()
    for (const deck of decks || []) {
      for (const id of deck.card_queue || []) {
        allCardIds.add(id)
      }
    }

    // Batch-fetch card states and due dates
    const cardStateMap = new Map<string, { state: string; due_date: string | null }>()
    if (allCardIds.size > 0) {
      const { data: cardData } = await supabase
        .from('cards')
        .select('card_id, state, due_date')
        .in('card_id', Array.from(allCardIds))

      for (const card of cardData || []) {
        cardStateMap.set(card.card_id, { state: card.state, due_date: card.due_date })
      }
    }

    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    // Add session stats to each deck
    const decksWithStats = (decks || []).map(deck => {
      const cardPool: string[] = deck.card_queue || []
      const totalCards = cardPool.length
      const introducedSet = new Set<string>(deck.cards_introduced || [])

      // Reset daily counters if day changed
      const newToday = deck.last_session_date === today ? (deck.new_today || 0) : 0
      const reviewsToday = deck.last_session_date === today ? (deck.reviews_today || 0) : 0
      const newPerSession: number = deck.new_per_session || 20
      const reviewPerSession: number = deck.review_per_session || 200

      let dueRemaining = 0
      let learningNow = 0
      let actualNewAvailable = 0

      for (const id of cardPool) {
        const card = cardStateMap.get(id)
        if (!card) continue
        if ((card.state === 'learning' || card.state === 'relearning') && card.due_date && card.due_date <= now) {
          learningNow++
        } else if (card.state === 'review' && introducedSet.has(id) && card.due_date && card.due_date <= now) {
          dueRemaining++
        } else if (!introducedSet.has(id) && card.state !== 'suspended') {
          actualNewAvailable++
        }
      }

      const newRemaining = Math.min(Math.max(0, newPerSession - newToday), actualNewAvailable)

      return {
        deck_id: deck.deck_id,
        name: deck.name,
        filter_topics: deck.filter_topics,
        filter_subtopics: deck.filter_subtopics,
        filter_tags: deck.filter_tags,
        filter_states: deck.filter_states,
        filter_importance: deck.filter_importance,
        filter_quality: deck.filter_quality,
        sort_order: deck.sort_order,
        completed: deck.completed,
        totalCards,
        newRemaining,
        dueRemaining,
        learningNow,
      }
    })

    return NextResponse.json({ decks: decksWithStats })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/decks
 * Create a new filtered deck
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      name,
      filterTopics = [],
      filterSubtopics = [],
      filterTags = [],
      filterStates = [],
      filterImportance = [],
      filterQuality = [],
      filterDifficultyMin,
      filterDifficultyMax,
      sortOrder = 'due_date',
      maxCards,
      newPerSession = 20,
      reviewPerSession = 200,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Build query to get matching cards
    let query = supabase
      .from('cards')
      .select('card_id, difficulty')
      .neq('state', 'suspended')

    // Apply filters
    if (filterTopics.length > 0) {
      query = query.in('topic', filterTopics)
    }
    if (filterSubtopics.length > 0) {
      query = query.in('subtopic', filterSubtopics)
    }
    if (filterStates.length > 0) {
      query = query.in('state', filterStates)
    }
    if (filterTags.length > 0) {
      query = query.overlaps('tags', filterTags)
    }
    if (filterImportance.length > 0) {
      query = query.in('importance', filterImportance)
    }
    if (filterQuality.length > 0) {
      query = query.in('quality', filterQuality)
    }
    // Difficulty range (only applies to reviewed cards with difficulty > 0)
    if (filterDifficultyMin != null) {
      query = query.gte('difficulty', filterDifficultyMin)
    }
    if (filterDifficultyMax != null) {
      query = query.lte('difficulty', filterDifficultyMax)
    }

    // Apply sort order
    switch (sortOrder) {
      case 'difficulty':
        query = query.order('difficulty', { ascending: false })
        break
      case 'lapses':
        query = query.order('lapses', { ascending: false })
        break
      case 'random':
        // Fetch all, shuffle client-side
        break
      case 'due_date':
      default:
        query = query.order('due_date', { ascending: true })
        break
    }

    // Apply limit
    if (maxCards && maxCards > 0) {
      query = query.limit(maxCards)
    }

    const { data: cards, error: cardsError } = await query

    if (cardsError) {
      console.error('Error fetching cards:', cardsError)
      return NextResponse.json({ error: cardsError.message }, { status: 500 })
    }

    let cardQueue = cards?.map(c => c.card_id) || []

    // Shuffle for random sort order
    if (sortOrder === 'random') {
      for (let i = cardQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[cardQueue[i], cardQueue[j]] = [cardQueue[j], cardQueue[i]]
      }
      // Apply max cards after shuffle
      if (maxCards && maxCards > 0) {
        cardQueue = cardQueue.slice(0, maxCards)
      }
    }

    if (cardQueue.length === 0) {
      return NextResponse.json(
        { error: 'No cards match the selected filters' },
        { status: 400 }
      )
    }

    // Create the deck
    const deckId = generateDeckId()
    const { data: deck, error: insertError } = await supabase
      .from('filtered_decks')
      .insert({
        deck_id: deckId,
        name,
        filter_topics: filterTopics,
        filter_subtopics: filterSubtopics,
        filter_tags: filterTags,
        filter_states: filterStates,
        filter_importance: filterImportance,
        filter_quality: filterQuality,
        filter_difficulty_min: filterDifficultyMin ?? null,
        filter_difficulty_max: filterDifficultyMax ?? null,
        sort_order: sortOrder,
        max_cards: maxCards || null,
        card_queue: cardQueue,
        current_position: 0,
        completed: false,
        cards_introduced: [],
        new_per_session: newPerSession,
        review_per_session: reviewPerSession,
        new_today: 0,
        reviews_today: 0,
        last_session_date: null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating deck:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      deck: {
        ...deck,
        totalCards: cardQueue.length,
        progress: 0,
        progressPercent: 0,
      }
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
