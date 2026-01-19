import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/stats
 * Get review statistics
 */
export async function GET() {
  try {
    const supabase = createServiceClient()

    // Get counts by state
    const { data: stateData } = await supabase
      .from('cards')
      .select('state')

    const stateCounts: Record<string, number> = {
      new: 0,
      learning: 0,
      review: 0,
      relearning: 0,
      suspended: 0,
    }

    stateData?.forEach((card) => {
      stateCounts[card.state] = (stateCounts[card.state] || 0) + 1
    })

    const totalCards = stateData?.length || 0

    // Get due counts
    const now = new Date()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const { count: dueNow } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .neq('state', 'suspended')
      .lte('due_date', now.toISOString())

    const { count: dueToday } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .neq('state', 'suspended')
      .lte('due_date', endOfDay.toISOString())

    // Get today's reviews
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { count: reviewedToday } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .gte('reviewed_at', startOfDay.toISOString())

    // Get retention rate (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentReviews } = await supabase
      .from('reviews')
      .select('rating')
      .gte('reviewed_at', sevenDaysAgo.toISOString())

    const totalReviews = recentReviews?.length || 0
    const successfulReviews = recentReviews?.filter(r => r.rating >= 2).length || 0
    const retentionRate = totalReviews > 0
      ? Math.round((successfulReviews / totalReviews) * 100)
      : 0

    return NextResponse.json({
      totalCards,
      stateCounts,
      dueNow: dueNow || 0,
      dueToday: dueToday || 0,
      reviewedToday: reviewedToday || 0,
      retentionRate,
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
