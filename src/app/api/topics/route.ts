import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Disable caching for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/topics
 * Get all unique topics, subtopics (hierarchical), tags, and quality values
 */
export async function GET() {
  try {
    const supabase = createServiceClient()

    // Get topics, subtopics, and quality in one query
    const { data: cardData, error: cardError } = await supabase
      .from('cards')
      .select('topic, subtopic, quality')

    if (cardError) {
      console.error('Error fetching card data:', cardError)
      return NextResponse.json({ error: cardError.message }, { status: 500 })
    }

    // Get distinct tags
    const { data: tagData, error: tagError } = await supabase
      .from('cards')
      .select('tags')

    if (tagError) {
      console.error('Error fetching tags:', tagError)
      return NextResponse.json({ error: tagError.message }, { status: 500 })
    }

    // Build hierarchical topic tree: { topic: subtopic[] }
    const topicTree: Record<string, string[]> = {}
    for (const row of cardData || []) {
      if (!row.topic) continue
      if (!topicTree[row.topic]) {
        topicTree[row.topic] = []
      }
      if (row.subtopic && !topicTree[row.topic].includes(row.subtopic)) {
        topicTree[row.topic].push(row.subtopic)
      }
    }
    // Sort subtopics within each topic
    for (const topic of Object.keys(topicTree)) {
      topicTree[topic].sort()
    }

    // Extract flat lists for backwards compatibility
    const topics = Object.keys(topicTree).sort()
    const subtopics = Array.from(
      new Set(cardData?.map(t => t.subtopic).filter(Boolean))
    ).sort()

    const tags = Array.from(
      new Set(tagData?.flatMap(t => t.tags || []).filter(Boolean))
    ).sort()

    const quality = Array.from(
      new Set(cardData?.map(t => t.quality).filter(Boolean))
    ).sort()

    return NextResponse.json({
      topicTree,
      topics,
      subtopics,
      tags,
      quality,
      states: ['new', 'learning', 'review', 'relearning'],
      importance: ['core', 'supporting'],
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
