'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Deck {
  deck_id: string
  name: string
  filter_topics: string[]
  filter_subtopics: string[]
  filter_tags: string[]
  filter_states: string[]
  filter_importance: string[]
  filter_quality: string[]
  sort_order: string
  totalCards: number
  newRemaining: number
  dueRemaining: number
  learningNow: number
}

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchDecks() {
      try {
        const res = await fetch('/api/decks')
        const data = await res.json()
        setDecks(data.decks || [])
      } catch (err) {
        console.error('Error fetching decks:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchDecks()
  }, [])

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck?')) return
    try {
      await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      setDecks(decks.filter(d => d.deck_id !== deckId))
    } catch (err) {
      console.error('Error deleting deck:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/" className="text-gray-400 hover:text-white text-sm">
            &larr; Home
          </Link>
          <h1 className="text-2xl font-bold mt-2">Filtered Decks</h1>
        </div>
        <Link
          href="/decks/new"
          className="px-4 py-2 bg-accent-green hover:opacity-90 rounded-lg text-gray-900 font-medium"
        >
          + New Deck
        </Link>
      </div>

      {/* Deck list */}
      {decks.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p>No filtered decks yet.</p>
          <p className="text-sm mt-2">Create one to study specific topics or tags.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {decks.map(deck => (
            <div key={deck.deck_id} className="bg-dark-card rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-lg">{deck.name}</h3>
                  <div className="flex gap-3 text-sm text-gray-400">
                    <span className="text-blue-400">{deck.newRemaining ?? 0} new</span>
                    <span className="text-green-400">{deck.dueRemaining ?? 0} due</span>
                    {deck.learningNow > 0 && (
                      <span className="text-orange-400">{deck.learningNow} learning</span>
                    )}
                    <span>{deck.totalCards} total</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/decks/${deck.deck_id}`}
                    className="px-3 py-1 bg-accent-green hover:opacity-90 rounded text-sm text-gray-900 font-medium"
                  >
                    Continue
                  </Link>
                  <button
                    onClick={() => handleDeleteDeck(deck.deck_id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Filter tags display */}
              {(
                (deck.filter_topics || []).length > 0 ||
                (deck.filter_tags || []).length > 0 ||
                (deck.filter_states || []).length > 0 ||
                (deck.filter_importance || []).length > 0 ||
                (deck.filter_quality || []).length > 0
              ) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(deck.filter_topics || []).map(t => (
                    <span key={t} className="text-xs bg-accent-green/30 px-2 py-0.5 rounded">{t}</span>
                  ))}
                  {(deck.filter_subtopics || []).map(t => (
                    <span key={t} className="text-xs bg-accent-green/20 px-2 py-0.5 rounded">{t}</span>
                  ))}
                  {(deck.filter_tags || []).map(t => (
                    <span key={t} className="text-xs bg-dark-accent px-2 py-0.5 rounded">#{t}</span>
                  ))}
                  {(deck.filter_states || []).map(s => (
                    <span key={s} className="text-xs bg-gray-600/30 px-2 py-0.5 rounded">{s}</span>
                  ))}
                  {(deck.filter_importance || []).map(imp => (
                    <span key={imp} className={`text-xs px-2 py-0.5 rounded ${imp === 'core' ? 'bg-accent-green/30' : 'bg-gray-500/30'}`}>
                      {imp === 'core' ? 'core' : 'supporting'}
                    </span>
                  ))}
                  {(deck.filter_quality || []).map(q => (
                    <span key={q} className="text-xs bg-blue-500/30 px-2 py-0.5 rounded">Quality {q}</span>
                  ))}
                  {deck.sort_order && deck.sort_order !== 'due_date' && (
                    <span className="text-xs bg-gray-600/30 px-2 py-0.5 rounded">
                      Sort: {deck.sort_order}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
