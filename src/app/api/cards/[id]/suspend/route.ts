import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * POST /api/cards/[id]/suspend
 * Suspend a card (never show again)
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: cardId } = params
    const supabase = createServiceClient()

    // Suspend the card - set state and push due date far into future
    const farFuture = new Date()
    farFuture.setFullYear(farFuture.getFullYear() + 100)

    const { error } = await supabase
      .from('cards')
      .update({
        state: 'suspended',
        due_date: farFuture.toISOString(),
      })
      .eq('card_id', cardId)

    if (error) {
      console.error('Error suspending card:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'suspended' })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
