import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * DELETE /api/decks/[id]
 * Delete a filtered deck
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: deckId } = params
    const supabase = createServiceClient()

    const { error } = await supabase
      .from('filtered_decks')
      .delete()
      .eq('deck_id', deckId)

    if (error) {
      console.error('Error deleting deck:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
