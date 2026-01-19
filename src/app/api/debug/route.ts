import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/debug
 * Debug endpoint to check database connection
 */
export async function GET() {
  try {
    const supabase = createServiceClient()

    // Simple count query
    const { count, error } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })

    if (error) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }, { status: 500 })
    }

    // Also get a sample of card IDs to see what's visible
    const { data: sampleCards } = await supabase
      .from('cards')
      .select('card_id, topic, state, created_at')
      .limit(10)

    return NextResponse.json({
      totalCount: count,
      sampleCards,
      serviceKeyPresent: !!process.env.SUPABASE_SERVICE_KEY,
      serviceKeyLength: process.env.SUPABASE_SERVICE_KEY?.length,
    })
  } catch (err) {
    return NextResponse.json({
      error: String(err),
    }, { status: 500 })
  }
}
