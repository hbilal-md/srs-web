'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
  completed: boolean
}

interface Stats {
  dueNow: number
  dueToday: number
  reviewedToday: number
  retentionRate: number
  totalCards: number
}

export default function HomePage() {
  const [decks, setDecks] = useState<Deck[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        const [decksRes, statsRes] = await Promise.all([
          fetch('/api/decks'),
          fetch('/api/stats'),
        ])

        const decksData = await decksRes.json()
        const statsData = await statsRes.json()

        setDecks(decksData.decks || [])
        setStats(statsData)
      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Delete this deck?')) return
    try {
      await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      setDecks(decks.filter(d => d.deck_id !== deckId))
    } catch (err) {
      console.error('Error deleting deck:', err)
    }
    setOpenMenu(null)
  }

  const handleResetDeck = async (deckId: string) => {
    try {
      await fetch(`/api/decks/${deckId}/reset`, { method: 'POST' })
      setDecks(decks.map(d =>
        d.deck_id === deckId
          ? { ...d, newRemaining: 0, dueRemaining: 0, learningNow: 0, completed: false }
          : d
      ))
    } catch (err) {
      console.error('Error resetting deck:', err)
    }
    setOpenMenu(null)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-pulse">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    )
  }

  const dueCount = stats?.dueNow || 0

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-gray-200">
          Study
        </h1>
        <Link
          href="/decks/new"
          className="text-sm text-gray-500 hover:text-accent-green transition-colors"
        >
          + New Deck
        </Link>
      </header>

      {/* Quick 10 - Featured Deck */}
      {dueCount > 0 && (
        <Link
          href="/review?mode=quick10"
          className="quick-deck group block mb-8"
        >
          <div className="quick-deck-inner">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="quick-deck-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </span>
                <div>
                  <h2 className="font-semibold text-lg text-white group-hover:text-accent-green transition-colors">
                    Quick 10
                  </h2>
                  <p className="text-sm text-gray-500">Random due cards</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-accent-green">
                  {Math.min(10, dueCount)}
                </span>
                <span className="text-sm text-gray-500 ml-1">cards</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="tag-chip tag-chip-accent">shuffle</span>
              <span className="tag-chip">from {dueCount} due</span>
              <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                Start →
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* No cards due state */}
      {dueCount === 0 && (
        <div className="empty-state mb-8">
          <div className="empty-state-icon">✓</div>
          <h2 className="text-lg font-medium text-gray-300 mb-1">All caught up</h2>
          <p className="text-sm text-gray-500">No cards due right now</p>
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Filtered Decks
        </h2>
        <span className="text-xs text-gray-600">{decks.length} deck{decks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filtered Decks */}
      {decks.length === 0 ? (
        <div className="empty-deck-state">
          <p className="text-gray-500 mb-2">No filtered decks yet</p>
          <Link href="/decks/new" className="text-accent-green hover:underline text-sm">
            Create your first deck →
          </Link>
        </div>
      ) : (
        <div className="deck-grid">
          {decks.map((deck, index) => (
            <div
              key={deck.deck_id}
              className="deck-card group"
              style={{ animationDelay: `${index * 50}ms`, cursor: 'pointer' }}
              onClick={() => router.push(`/decks/${deck.deck_id}`)}
            >
              {/* Deck Header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-gray-200 group-hover:text-white transition-colors leading-tight">
                  {deck.name}
                </h3>
                <div className="flex items-center gap-2">
                  {deck.completed && (
                    <span className="completed-badge">✓</span>
                  )}
                  {/* Three-dot menu */}
                  <div className="relative" ref={openMenu === deck.deck_id ? menuRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenu(openMenu === deck.deck_id ? null : deck.deck_id)
                      }}
                      className="deck-menu-btn"
                    >
                      ⋮
                    </button>
                    {openMenu === deck.deck_id && (
                      <div className="deck-menu-dropdown">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleResetDeck(deck.deck_id)
                          }}
                          className="deck-menu-item"
                        >
                          Reset
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteDeck(deck.deck_id)
                          }}
                          className="deck-menu-item deck-menu-item--danger"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Session Stats */}
              <div className="flex items-center gap-3 text-xs mb-3">
                <span className="text-blue-400">{deck.newRemaining} new</span>
                <span className="text-green-400">{deck.dueRemaining} due</span>
                {deck.learningNow > 0 && (
                  <span className="text-orange-400">{deck.learningNow} learning</span>
                )}
                <span className="text-gray-500 ml-auto">{deck.totalCards} total</span>
              </div>

              {/* Tags & Filters */}
              <div className="flex flex-wrap gap-1.5">
                {(deck.filter_topics || []).slice(0, 2).map(t => (
                  <span key={t} className="tag-chip tag-chip-topic">{t}</span>
                ))}
                {(deck.filter_subtopics || []).slice(0, 2).map(t => (
                  <span key={t} className="tag-chip tag-chip-subtopic">{t}</span>
                ))}
                {(deck.filter_tags || []).slice(0, 2).map(t => (
                  <span key={t} className="tag-chip">#{t}</span>
                ))}
                {(deck.filter_states || []).slice(0, 1).map(s => (
                  <span key={s} className="tag-chip tag-chip-state">{s}</span>
                ))}
                {(deck.filter_importance || []).map(imp => (
                  <span key={imp} className={`tag-chip ${imp === 'core' ? 'tag-chip-core' : 'tag-chip-supporting'}`}>
                    {imp}
                  </span>
                ))}
                {(
                  (deck.filter_topics?.length || 0) +
                  (deck.filter_subtopics?.length || 0) +
                  (deck.filter_tags?.length || 0)
                ) > 6 && (
                  <span className="tag-chip tag-chip-more">+more</span>
                )}
              </div>

              {/* Hover hint */}
              <div className="deck-card-hint">
                {deck.completed ? 'Review again' : 'Continue'} →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
