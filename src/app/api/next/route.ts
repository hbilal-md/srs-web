import { NextResponse } from 'next/server'
import { createServiceClient, Card } from '@/lib/supabase'
import { FSRS, dbCardToState } from '@/lib/fsrs'

// Disable caching for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/next
 * Get the next card(s) due for review
 *
 * Query params:
 * - deck: optional deck ID to filter by
 * - limit: number of cards to fetch (default 1)
 * - random: if true, randomize selection
 * - cardId: if provided, just fetch intervals for this specific card
 */
export async function GET(request: Request) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '1', 10)
    const random = searchParams.get('random') === 'true'
    const cardId = searchParams.get('cardId')

    // If cardId is provided, just return intervals for that card
    if (cardId) {
      const { data: card, error } = await supabase
        .from('cards')
        .select('*')
        .eq('card_id', cardId)
        .single()

      if (error || !card) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 })
      }

      const fsrs = new FSRS()
      const cardState = dbCardToState(card as Card)
      const intervals = fsrs.previewRatings(cardState)

      return NextResponse.json({ card, intervals })
    }

    // Build query for due cards
    let query = supabase
      .from('cards')
      .select('*')
      .neq('state', 'suspended')
      .lte('due_date', new Date().toISOString())

    // For random selection, we need a different approach
    if (random && limit > 1) {
      // Fetch more cards than needed, then shuffle and slice
      query = query.limit(limit * 3)
    } else {
      query = query.order('due_date', { ascending: true }).limit(limit)
    }

    const { data: cards, error } = await query

    if (error) {
      console.error('Error fetching next card:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!cards || cards.length === 0) {
      // No cards due, get count of cards due later today
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const { count: dueToday } = await supabase
        .from('cards')
        .select('*', { count: 'exact', head: true })
        .neq('state', 'suspended')
        .lte('due_date', endOfDay.toISOString())

      return NextResponse.json({
        card: null,
        cards: [],
        message: 'No cards due right now',
        dueToday: dueToday || 0,
      })
    }

    // If multiple cards requested (Quick 10 mode)
    if (limit > 1) {
      let selectedCards = cards as Card[]

      // Shuffle if random mode
      if (random) {
        selectedCards = shuffleArray(selectedCards).slice(0, limit)
      }

      // Calculate intervals for first card only (others fetched on demand)
      const fsrs = new FSRS()
      const firstCardState = dbCardToState(selectedCards[0])
      const intervals = fsrs.previewRatings(firstCardState)

      return NextResponse.json({
        cards: selectedCards,
        card: selectedCards[0],
        intervals: [intervals],
        remaining: selectedCards.length,
      })
    }

    // Single card mode (original behavior)
    const card = cards[0] as Card

    // Calculate preview intervals for rating buttons
    const fsrs = new FSRS()
    const cardState = dbCardToState(card)
    const intervals = fsrs.previewRatings(cardState)

    // Get count of remaining due cards
    const { count: remaining } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .neq('state', 'suspended')
      .lte('due_date', new Date().toISOString())

    return NextResponse.json({
      card,
      intervals,
      remaining: remaining || 0,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
