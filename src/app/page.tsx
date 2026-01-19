'use client'

import { useState, useEffect, useCallback } from 'react'
import Card from '@/components/Card'
import RatingButtons from '@/components/RatingButtons'
import ActionButtons from '@/components/ActionButtons'
import { Rating } from '@/lib/fsrs'
import type { Card as CardType } from '@/lib/supabase'

interface NextCardResponse {
  card: CardType | null
  intervals?: Record<Rating, number>
  remaining?: number
  message?: string
  dueToday?: number
}

interface Stats {
  dueNow: number
  dueToday: number
  reviewedToday: number
  retentionRate: number
}

export default function ReviewPage() {
  const [card, setCard] = useState<CardType | null>(null)
  const [intervals, setIntervals] = useState<Record<Rating, number> | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null)

  // Fetch next card
  const fetchNextCard = useCallback(async () => {
    setIsLoading(true)
    setIsRevealed(false)
    setReviewStartTime(null)

    try {
      const res = await fetch('/api/next')
      const data: NextCardResponse = await res.json()

      setCard(data.card)
      setIntervals(data.intervals || null)
      setRemaining(data.remaining || 0)

      if (data.card) {
        setReviewStartTime(Date.now())
      }
    } catch (err) {
      console.error('Error fetching card:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats')
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchNextCard()
    fetchStats()
  }, [fetchNextCard, fetchStats])

  // Handle reveal
  const handleReveal = () => {
    setIsRevealed(true)
  }

  // Handle rating
  const handleRate = async (rating: Rating) => {
    if (!card || isSubmitting) return

    setIsSubmitting(true)

    const timeTakenMs = reviewStartTime
      ? Date.now() - reviewStartTime
      : null

    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.card_id,
          rating,
          timeTakenMs,
        }),
      })

      // Fetch next card
      await fetchNextCard()
      // Update stats
      fetchStats()
    } catch (err) {
      console.error('Error submitting review:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle abandon
  const handleAbandon = async () => {
    if (!card || isSubmitting) return

    setIsSubmitting(true)

    try {
      await fetch(`/api/cards/${card.card_id}/suspend`, {
        method: 'POST',
      })
      await fetchNextCard()
      fetchStats()
    } catch (err) {
      console.error('Error abandoning card:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle flag
  const handleFlag = async () => {
    if (!card || isSubmitting) return

    try {
      await fetch(`/api/cards/${card.card_id}/flag`, {
        method: 'POST',
      })
      // Show brief feedback
      alert('Card flagged for editing')
    } catch (err) {
      console.error('Error flagging card:', err)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (!isRevealed) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault()
          handleReveal()
        }
      } else if (intervals && !isSubmitting) {
        switch (e.key) {
          case '1':
            handleRate(Rating.AGAIN)
            break
          case '2':
            handleRate(Rating.HARD)
            break
          case '3':
            handleRate(Rating.GOOD)
            break
          case '4':
            handleRate(Rating.EASY)
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRevealed, intervals, isSubmitting])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  // No cards due
  if (!card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">🎉 All caught up!</h1>
          <p className="text-gray-400 mb-6">No cards due right now.</p>

          {stats && (
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto text-sm">
              <div className="bg-[#16213e] p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.reviewedToday}</div>
                <div className="text-gray-400">Reviewed today</div>
              </div>
              <div className="bg-[#16213e] p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.dueToday}</div>
                <div className="text-gray-400">Due later today</div>
              </div>
            </div>
          )}

          <button
            onClick={fetchNextCard}
            className="mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-2xl mx-auto">
      {/* Header with stats */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-400">
          {remaining} card{remaining !== 1 ? 's' : ''} remaining
        </div>
        {stats && (
          <div className="flex gap-4 text-sm text-gray-400">
            <span>Today: {stats.reviewedToday}</span>
            <span>Retention: {stats.retentionRate}%</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-bar mb-4">
        <div
          className="progress-fill"
          style={{
            width: `${Math.min(100, (stats?.reviewedToday || 0) / Math.max(1, (stats?.dueToday || 1)) * 100)}%`
          }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col">
        <Card
          card={card}
          isRevealed={isRevealed}
          onReveal={handleReveal}
        />
      </div>

      {/* Rating buttons (only when revealed) */}
      {isRevealed && intervals && (
        <div className="mt-6 space-y-4">
          <RatingButtons
            intervals={intervals}
            onRate={handleRate}
            disabled={isSubmitting}
          />
          <ActionButtons
            onAbandon={handleAbandon}
            onFlag={handleFlag}
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* Keyboard hints */}
      <div className="mt-4 text-center text-xs text-gray-500">
        {!isRevealed ? (
          <span><span className="kbd">Space</span> to reveal</span>
        ) : (
          <span><span className="kbd">1-4</span> to rate</span>
        )}
      </div>
    </div>
  )
}
