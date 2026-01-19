import { NextResponse } from 'next/server'
import { createServiceClient, Card } from '@/lib/supabase'
import { FSRS, dbCardToState, Rating } from '@/lib/fsrs'

// Disable caching for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/next
 * Get the next card due for review
 */
export async function GET(request: Request) {
  try {
    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)
    const deckId = searchParams.get('deck')

    let query = supabase
      .from('cards')
      .select('*')
      .neq('state', 'suspended')
      .lte('due_date', new Date().toISOString())
      .order('due_date', { ascending: true })
      .limit(1)

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
        message: 'No cards due right now',
        dueToday: dueToday || 0,
      })
    }

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
