import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/decks/[id]/reset
 * Reset a deck's session counters.
 * With ?full=true, also clears cards_introduced for a complete restart.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    const url = new URL(request.url)
    const fullReset = url.searchParams.get('full') === 'true'

    const updateData: Record<string, unknown> = {
      new_today: 0,
      reviews_today: 0,
      last_session_date: null,
      // Legacy fields — keep in sync
      current_position: 0,
      completed: false,
    }

    if (fullReset) {
      updateData.cards_introduced = []
    }

    const { error } = await supabase
      .from('filtered_decks')
      .update(updateData)
      .eq('deck_id', deckId)

    if (error) {
      console.error('Error resetting deck:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, fullReset })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
