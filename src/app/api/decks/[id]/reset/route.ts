import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/decks/[id]/reset
 * Reset a deck's progress to the beginning
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    const { error } = await supabase
      .from('filtered_decks')
      .update({
        current_position: 0,
        completed: false,
      })
      .eq('deck_id', deckId)

    if (error) {
      console.error('Error resetting deck:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
