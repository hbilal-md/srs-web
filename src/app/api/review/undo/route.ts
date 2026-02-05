import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { FSRS, Rating, dbCardToState } from '@/lib/fsrs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/review/undo
 * Undo the most recent review, restoring the card's previous state
 */
export async function POST(request: Request) {
  try {
    const { reviewId } = await request.json()

    if (!reviewId) {
      return NextResponse.json(
        { error: 'reviewId is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Fetch the review record
    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review) {
      return NextResponse.json(
        { error: 'Review not found' },
        { status: 404 }
      )
    }

    // Restore the card to its previous state
    const { error: updateError } = await supabase
      .from('cards')
      .update({
        stability: review.prev_stability,
        difficulty: review.prev_difficulty,
        state: review.prev_state,
        review_count: review.prev_review_count,
        lapses: review.prev_lapses,
        due_date: review.prev_due_date,
        last_review: review.prev_last_review,
      })
      .eq('card_id', review.card_id)

    if (updateError) {
      console.error('Error restoring card state:', updateError)
      return NextResponse.json(
        { error: 'Failed to restore card state' },
        { status: 500 }
      )
    }

    // Delete the review record
    const { error: deleteError } = await supabase
      .from('reviews')
      .delete()
      .eq('id', reviewId)

    if (deleteError) {
      console.error('Error deleting review:', deleteError)
    }

    // Fetch the restored card to return to the frontend
    const { data: card } = await supabase
      .from('cards')
      .select('*')
      .eq('card_id', review.card_id)
      .single()

    // Calculate interval previews for the restored card
    let intervals = null
    if (card) {
      const fsrs = new FSRS()
      const cardState = dbCardToState(card)
      intervals = fsrs.previewRatings(cardState)
    }

    return NextResponse.json({
      success: true,
      card,
      intervals,
      cardId: review.card_id,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
