'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Deck {
  deck_id: string
  name: string
  totalCards: number
  progress: number
  progressPercent: number
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">SRS Tool</h1>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#16213e] p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.dueNow}</div>
            <div className="text-xs text-gray-400">Due Now</div>
          </div>
          <div className="bg-[#16213e] p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{stats.reviewedToday}</div>
            <div className="text-xs text-gray-400">Today</div>
          </div>
          <div className="bg-[#16213e] p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-400">{stats.totalCards}</div>
            <div className="text-xs text-gray-400">Total</div>
          </div>
        </div>
      )}

      {/* Review All Due Button */}
      {stats && stats.dueNow > 0 && (
        <Link
          href="/review"
          className="block w-full bg-green-600 hover:bg-green-500 text-center py-4 rounded-lg font-medium mb-6"
        >
          Review All Due ({stats.dueNow} cards)
        </Link>
      )}

      {/* Filtered Decks Section */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Filtered Decks</h2>
        <Link
          href="/decks"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="bg-[#16213e] rounded-lg p-6 text-center text-gray-400">
          <p>No filtered decks yet.</p>
          <Link href="/decks" className="text-blue-400 hover:text-blue-300 text-sm">
            Create one →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {decks.slice(0, 5).map(deck => (
            <Link
              key={deck.deck_id}
              href={`/decks/${deck.deck_id}`}
              className="block bg-[#16213e] rounded-lg p-4 hover:bg-[#1a2744] transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{deck.name}</span>
                <span className="text-sm text-gray-400">
                  {deck.progress}/{deck.totalCards}
                  {deck.completed && ' ✓'}
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${deck.progressPercent}%` }}
                />
              </div>
            </Link>
          ))}
          {decks.length > 5 && (
            <Link
              href="/decks"
              className="block text-center text-sm text-gray-400 hover:text-white py-2"
            >
              View all {decks.length} decks →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
