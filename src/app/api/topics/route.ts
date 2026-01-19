import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * GET /api/topics
 * Get all unique topics for deck filter UI
 */
export async function GET() {
  try {
    const supabase = createServiceClient()

    // Get distinct topics
    const { data: topicData, error: topicError } = await supabase
      .from('cards')
      .select('topic')
      .neq('topic', null)

    if (topicError) {
      console.error('Error fetching topics:', topicError)
      return NextResponse.json({ error: topicError.message }, { status: 500 })
    }

    // Get distinct tags
    const { data: tagData, error: tagError } = await supabase
      .from('cards')
      .select('tags')

    if (tagError) {
      console.error('Error fetching tags:', tagError)
      return NextResponse.json({ error: tagError.message }, { status: 500 })
    }

    // Extract unique values
    const topics = [...new Set(topicData?.map(t => t.topic).filter(Boolean))]
    const tags = [...new Set(tagData?.flatMap(t => t.tags || []).filter(Boolean))]

    return NextResponse.json({
      topics: topics.sort(),
      tags: tags.sort(),
      states: ['new', 'learning', 'review', 'relearning'],
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
