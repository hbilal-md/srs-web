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

    // Add progress info to each deck
    const decksWithProgress = decks?.map(deck => ({
      ...deck,
      totalCards: deck.card_queue?.length || 0,
      progress: deck.current_position,
      progressPercent: deck.card_queue?.length
        ? Math.round((deck.current_position / deck.card_queue.length) * 100)
        : 0,
    }))

    return NextResponse.json({ decks: decksWithProgress || [] })
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
