import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { FSRS, dbCardToState } from '@/lib/fsrs'

/**
 * GET /api/decks/[id]/next
 * Get the next card from a filtered deck using dynamic session queue.
 *
 * Priority:
 * 1. Learning cards due now (state=learning|relearning, due_date <= now)
 * 2. Review cards due now (in cards_introduced, due_date <= now) — capped by review_per_session
 * 3. New cards (not in cards_introduced) — capped by new_per_session
 * 4. Nothing available → return nextDueAt for upcoming learning cards
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

    const cardPool: string[] = deck.card_queue || []
    if (cardPool.length === 0) {
      return NextResponse.json({
        card: null,
        deck: buildDeckInfo(deck, 0),
        nextDueAt: null,
      })
    }

    // Session reset: if last_session_date is not today, reset daily counters
    const today = new Date().toISOString().slice(0, 10)
    let newToday: number = deck.new_today || 0
    let reviewsToday: number = deck.reviews_today || 0

    if (deck.last_session_date !== today) {
      newToday = 0
      reviewsToday = 0
      await supabase
        .from('filtered_decks')
        .update({ new_today: 0, reviews_today: 0, last_session_date: today })
        .eq('deck_id', deckId)
    }

    const cardsIntroducedSet = new Set<string>(deck.cards_introduced || [])
    const newPerSession: number = deck.new_per_session || 20
    const reviewPerSession: number = deck.review_per_session || 200
    const now = new Date().toISOString()

    // 1. Learning cards due now
    const { data: learningCards } = await supabase
      .from('cards')
      .select('*')
      .in('card_id', cardPool)
      .in('state', ['learning', 'relearning'])
      .lte('due_date', now)
      .order('due_date', { ascending: true })
      .limit(1)

    if (learningCards && learningCards.length > 0) {
      const card = learningCards[0]
      const fsrs = new FSRS()
      const intervals = fsrs.previewRatings(dbCardToState(card))
      const learningCount = await countLearningCards(supabase, cardPool, now)

      return NextResponse.json({
        card,
        cardType: 'learning',
        intervals,
        deck: buildDeckInfo(deck, learningCount, newToday, newPerSession, reviewsToday, reviewPerSession),
        nextDueAt: null,
      })
    }

    // 2. Review cards due now (cards already introduced, in review state, due)
    if (reviewsToday < reviewPerSession) {
      const introducedInPool = cardPool.filter(id => cardsIntroducedSet.has(id))

      if (introducedInPool.length > 0) {
        const { data: reviewCards } = await supabase
          .from('cards')
          .select('*')
          .in('card_id', introducedInPool)
          .eq('state', 'review')
          .lte('due_date', now)
          .order('due_date', { ascending: true })
          .limit(1)

        if (reviewCards && reviewCards.length > 0) {
          const card = reviewCards[0]
          const fsrs = new FSRS()
          const intervals = fsrs.previewRatings(dbCardToState(card))
          const learningCount = await countLearningCards(supabase, cardPool, now)

          return NextResponse.json({
            card,
            cardType: 'review',
            intervals,
            deck: buildDeckInfo(deck, learningCount, newToday, newPerSession, reviewsToday, reviewPerSession),
            nextDueAt: null,
          })
        }
      }
    }

    // 3. New cards (not yet introduced)
    if (newToday < newPerSession) {
      const newCardIds = cardPool.filter(id => !cardsIntroducedSet.has(id))

      if (newCardIds.length > 0) {
        // Get the first new card (preserve original pool order)
        const { data: newCards } = await supabase
          .from('cards')
          .select('*')
          .in('card_id', newCardIds)
          .neq('state', 'suspended')
          .limit(1)

        if (newCards && newCards.length > 0) {
          const card = newCards[0]
          const fsrs = new FSRS()
          const intervals = fsrs.previewRatings(dbCardToState(card))
          const learningCount = await countLearningCards(supabase, cardPool, now)

          return NextResponse.json({
            card,
            cardType: 'new',
            intervals,
            deck: buildDeckInfo(deck, learningCount, newToday, newPerSession, reviewsToday, reviewPerSession),
            nextDueAt: null,
          })
        }
      }
    }

    // 4. Nothing available — check for upcoming learning cards
    const { data: upcomingLearning } = await supabase
      .from('cards')
      .select('due_date')
      .in('card_id', cardPool)
      .in('state', ['learning', 'relearning'])
      .gt('due_date', now)
      .order('due_date', { ascending: true })
      .limit(1)

    const nextDueAt = upcomingLearning?.[0]?.due_date || null
    const learningCount = 0

    // Count remaining new cards
    const remainingNew = cardPool.filter(id => !cardsIntroducedSet.has(id)).length

    return NextResponse.json({
      card: null,
      deck: buildDeckInfo(deck, learningCount, newToday, newPerSession, reviewsToday, reviewPerSession),
      nextDueAt,
      remainingNew,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/decks/[id]/next
 * Called after a card is rated. Updates session counters and cards_introduced.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    let cardType: string | null = null
    let cardId: string | null = null
    let undo = false
    try {
      const body = await request.json()
      cardType = body.cardType ?? null
      cardId = body.cardId ?? null
      undo = body.undo ?? false
    } catch {
      // No body — skip
    }

    // Get current deck state
    const { data: deck, error: deckError } = await supabase
      .from('filtered_decks')
      .select('cards_introduced, new_today, reviews_today')
      .eq('deck_id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const cardsIntroduced: string[] = [...(deck.cards_introduced || [])]
    let newToday: number = deck.new_today || 0
    let reviewsToday: number = deck.reviews_today || 0

    if (undo) {
      // Reverse: remove from introduced if it was newly added, decrement counters
      if (cardType === 'new' && cardId) {
        const idx = cardsIntroduced.indexOf(cardId)
        if (idx !== -1) cardsIntroduced.splice(idx, 1)
        newToday = Math.max(0, newToday - 1)
      } else if (cardType === 'review') {
        reviewsToday = Math.max(0, reviewsToday - 1)
      }
    } else {
      // Forward: add to introduced if new, increment counters
      if (cardType === 'new' && cardId) {
        if (!cardsIntroduced.includes(cardId)) {
          cardsIntroduced.push(cardId)
        }
        newToday += 1
      } else if (cardType === 'review') {
        reviewsToday += 1
      }
      // Learning cards don't affect counters
    }

    const { error: updateError } = await supabase
      .from('filtered_decks')
      .update({
        cards_introduced: cardsIntroduced,
        new_today: newToday,
        reviews_today: reviewsToday,
      })
      .eq('deck_id', deckId)

    if (updateError) {
      console.error('Error updating deck:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper: count learning cards due now in the pool
async function countLearningCards(
  supabase: ReturnType<typeof createServiceClient>,
  cardPool: string[],
  now: string
): Promise<number> {
  const { count } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .in('card_id', cardPool)
    .in('state', ['learning', 'relearning'])
    .lte('due_date', now)

  return count || 0
}

// Helper: build deck info for response
function buildDeckInfo(
  deck: Record<string, unknown>,
  learningCount: number,
  newToday?: number,
  newLimit?: number,
  reviewsToday?: number,
  reviewLimit?: number,
) {
  const cardPool = (deck.card_queue as string[]) || []
  const introduced = (deck.cards_introduced as string[]) || []

  return {
    deck_id: deck.deck_id,
    name: deck.name,
    totalCards: cardPool.length,
    introduced: introduced.length,
    newToday: newToday ?? deck.new_today ?? 0,
    newLimit: newLimit ?? deck.new_per_session ?? 20,
    reviewsToday: reviewsToday ?? deck.reviews_today ?? 0,
    reviewLimit: reviewLimit ?? deck.review_per_session ?? 200,
    learningNow: learningCount,
  }
}
