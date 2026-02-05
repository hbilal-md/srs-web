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
 * If rating is AGAIN (1), re-append the card to the end of the queue
 * so the user sees it again before the deck completes.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    // Parse optional body
    let rating: number | null = null
    let undo = false
    let lastRating: number | null = null
    try {
      const body = await request.json()
      rating = body.rating ?? null
      undo = body.undo ?? false
      lastRating = body.lastRating ?? null
    } catch {
      // No body or invalid JSON — that's fine, just advance
    }

    // Get current deck state
    const { data: deck, error: deckError } = await supabase
      .from('filtered_decks')
      .select('current_position, card_queue')
      .eq('deck_id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    let cardQueue = [...deck.card_queue]

    // Handle undo: go back one position
    if (undo) {
      const newPosition = Math.max(0, deck.current_position - 1)

      // If the last rating was AGAIN, the card was re-appended — remove it
      if (lastRating === 1 && cardQueue.length > 0) {
        cardQueue.pop()
      }

      const updateData: Record<string, unknown> = {
        current_position: newPosition,
        completed: false,
      }
      if (lastRating === 1) {
        updateData.card_queue = cardQueue
      }

      const { error: updateError } = await supabase
        .from('filtered_decks')
        .update(updateData)
        .eq('deck_id', deckId)

      if (updateError) {
        console.error('Error undoing deck position:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, newPosition, completed: false })
    }

    // If rated AGAIN, re-append the current card to the end of the queue
    if (rating === 1) {
      const currentCardId = cardQueue[deck.current_position]
      if (currentCardId) {
        cardQueue.push(currentCardId)
      }
    }

    const newPosition = deck.current_position + 1
    const completed = newPosition >= cardQueue.length

    // Update deck position (and queue if it grew)
    const updateData: Record<string, unknown> = {
      current_position: newPosition,
      completed,
    }
    if (rating === 1) {
      updateData.card_queue = cardQueue
    }

    const { error: updateError } = await supabase
      .from('filtered_decks')
      .update(updateData)
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
