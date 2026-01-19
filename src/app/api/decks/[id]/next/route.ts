import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { FSRS, dbCardToState } from '@/lib/fsrs'

/**
 * GET /api/decks/[id]/next
 * Get the next card from a filtered deck
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    // Get the deck
    const { data: deck, error: deckError } = await supabase
      .from('filtered_decks')
      .select('*')
      .eq('deck_id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // Check if deck is completed
    if (deck.completed || deck.current_position >= deck.card_queue.length) {
      return NextResponse.json({
        card: null,
        message: 'Deck completed',
        deck: {
          ...deck,
          totalCards: deck.card_queue.length,
          progress: deck.current_position,
          progressPercent: 100,
        },
      })
    }

    // Get the current card
    const cardId = deck.card_queue[deck.current_position]

    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('card_id', cardId)
      .single()

    if (cardError || !card) {
      // Card was deleted or not found, skip to next
      const { error: updateError } = await supabase
        .from('filtered_decks')
        .update({ current_position: deck.current_position + 1 })
        .eq('deck_id', deckId)

      // Retry with next card
      return GET(request, { params })
    }

    // Calculate intervals
    const fsrs = new FSRS()
    const cardState = dbCardToState(card)
    const intervals = fsrs.previewRatings(cardState)

    return NextResponse.json({
      card,
      intervals,
      deck: {
        ...deck,
        totalCards: deck.card_queue.length,
        progress: deck.current_position,
        progressPercent: Math.round((deck.current_position / deck.card_queue.length) * 100),
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/decks/[id]/next
 * Advance to the next card in the deck (called after review)
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    // Get current deck state
    const { data: deck, error: deckError } = await supabase
      .from('filtered_decks')
      .select('current_position, card_queue')
      .eq('deck_id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const newPosition = deck.current_position + 1
    const completed = newPosition >= deck.card_queue.length

    // Update deck position
    const { error: updateError } = await supabase
      .from('filtered_decks')
      .update({
        current_position: newPosition,
        completed,
      })
      .eq('deck_id', deckId)

    if (updateError) {
      console.error('Error updating deck:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      newPosition,
      completed,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
