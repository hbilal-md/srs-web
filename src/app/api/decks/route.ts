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
      .select('card_id')
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
    // Tags filter requires contains check
    if (filterTags.length > 0) {
      query = query.overlaps('tags', filterTags)
    }
    // Importance filter (core/supporting)
    if (filterImportance.length > 0) {
      query = query.in('importance', filterImportance)
    }

    // Order by due date (most overdue first)
    query = query.order('due_date', { ascending: true })

    // Apply limit
    if (maxCards && maxCards > 0) {
      query = query.limit(maxCards)
    }

    const { data: cards, error: cardsError } = await query

    if (cardsError) {
      console.error('Error fetching cards:', cardsError)
      return NextResponse.json({ error: cardsError.message }, { status: 500 })
    }

    const cardQueue = cards?.map(c => c.card_id) || []

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
        filter_tags: filterTags,
        filter_states: filterStates,
        filter_importance: filterImportance,
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
