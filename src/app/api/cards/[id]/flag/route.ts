import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/cards/[id]/flag
 * Flag a card for editing
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: cardId } = params
    const supabase = createServiceClient()

    // Get current tags
    const { data: card, error: fetchError } = await supabase
      .from('cards')
      .select('tags')
      .eq('card_id', cardId)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }

    // Add 'flagged' to tags if not already present
    const tags = card.tags || []
    if (!tags.includes('flagged')) {
      tags.push('flagged')
    }

    const { error } = await supabase
      .from('cards')
      .update({
        flagged: true,
        tags,
      })
      .eq('card_id', cardId)

    if (error) {
      console.error('Error flagging card:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'flagged' })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
