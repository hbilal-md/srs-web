import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { FSRS, Rating, dbCardToState, stateToDbCard } from '@/lib/fsrs'

interface ReviewRequest {
  cardId: string
  rating: Rating
  timeTakenMs?: number
}

/**
 * POST /api/review
 * Submit a review rating for a card
 */
export async function POST(request: Request) {
  try {
    const body: ReviewRequest = await request.json()
    const { cardId, rating, timeTakenMs } = body

    if (!cardId || !rating || rating < 1 || rating > 4) {
      return NextResponse.json(
        { error: 'Invalid request: cardId and rating (1-4) required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get the current card
    const { data: card, error: fetchError } = await supabase
      .from('cards')
      .select('*')
      .eq('card_id', cardId)
      .single()

    if (fetchError || !card) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      )
    }

    // Calculate new state using FSRS
    const fsrs = new FSRS()
    const cardState = dbCardToState(card)
    const { newState, intervalDays } = fsrs.review(cardState, rating as Rating)

    // Save review history
    const { error: reviewError } = await supabase
      .from('reviews')
      .insert({
        card_id: cardId,
        rating,
        time_taken_ms: timeTakenMs || null,
        prev_stability: card.stability,
        prev_difficulty: card.difficulty,
        prev_state: card.state,
      })

    if (reviewError) {
      console.error('Error saving review:', reviewError)
      // Continue anyway - card update is more important
    }

    // Update card with new state
    const dbState = stateToDbCard(newState)
    const { error: updateError } = await supabase
      .from('cards')
      .update(dbState)
      .eq('card_id', cardId)

    if (updateError) {
      console.error('Error updating card:', updateError)
      return NextResponse.json(
        { error: 'Failed to update card' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      intervalDays,
      newState: dbState,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
