'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
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

function ReviewContent() {
  const searchParams = useSearchParams()
  const isQuick10 = searchParams.get('mode') === 'quick10'

  const [card, setCard] = useState<CardType | null>(null)
  const [intervals, setIntervals] = useState<Record<Rating, number> | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null)
  const [lastReviewId, setLastReviewId] = useState<string | null>(null)

  // Quick 10 mode state
  const [quick10Queue, setQuick10Queue] = useState<CardType[]>([])
  const [quick10Index, setQuick10Index] = useState(0)
  const [quick10SessionComplete, setQuick10SessionComplete] = useState(false)

  // Initialize Quick 10 queue
  const initQuick10 = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/next?limit=10&random=true')
      const data = await res.json()

      if (data.cards && data.cards.length > 0) {
        setQuick10Queue(data.cards)
        setCard(data.cards[0])
        setIntervals(data.intervals?.[0] || null)
        setQuick10Index(0)
        setReviewStartTime(Date.now())
      } else {
        setCard(null)
      }
    } catch (err) {
      console.error('Error fetching quick 10:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch next card (normal mode)
  const fetchNextCard = useCallback(async () => {
    setIsLoading(true)
    setIsRevealed(false)
    setReviewStartTime(null)
    setLastReviewId(null)

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
    if (isQuick10) {
      initQuick10()
    } else {
      fetchNextCard()
    }
    fetchStats()
  }, [isQuick10, initQuick10, fetchNextCard, fetchStats])

  // Handle reveal
  const handleReveal = () => {
    setIsRevealed(true)
  }

  // Move to next card in Quick 10 mode
  const moveToNextQuick10Card = useCallback(async () => {
    const nextIndex = quick10Index + 1

    if (nextIndex >= quick10Queue.length) {
      // Session complete
      setQuick10SessionComplete(true)
      setCard(null)
      return
    }

    // Fetch intervals for next card
    try {
      const nextCard = quick10Queue[nextIndex]
      const res = await fetch(`/api/next?cardId=${nextCard.card_id}`)
      const data = await res.json()

      setQuick10Index(nextIndex)
      setCard(nextCard)
      setIntervals(data.intervals || null)
      setIsRevealed(false)
      setReviewStartTime(Date.now())
    } catch (err) {
      console.error('Error fetching intervals:', err)
    }
  }, [quick10Index, quick10Queue])

  // Handle rating
  const handleRate = async (rating: Rating) => {
    if (!card || isSubmitting) return

    setIsSubmitting(true)

    const timeTakenMs = reviewStartTime
      ? Date.now() - reviewStartTime
      : null

    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.card_id,
          rating,
          timeTakenMs,
        }),
      })
      const data = await res.json()
      const reviewId = data.reviewId

      if (isQuick10) {
        await moveToNextQuick10Card()
      } else {
        await fetchNextCard()
      }
      // Store review ID for undo
      setLastReviewId(reviewId)
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

      if (isQuick10) {
        await moveToNextQuick10Card()
      } else {
        await fetchNextCard()
      }
      fetchStats()
    } catch (err) {
      console.error('Error abandoning card:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle undo
  const handleUndo = async () => {
    if (!lastReviewId || isSubmitting) return

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/review/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: lastReviewId }),
      })
      const data = await res.json()

      if (data.success && data.card) {
        setCard(data.card)
        setIntervals(data.intervals || null)
        setIsRevealed(false)
        setLastReviewId(null)
        setReviewStartTime(Date.now())
        setRemaining((prev) => prev + 1)
      }

      fetchStats()
    } catch (err) {
      console.error('Error undoing review:', err)
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

      // Undo shortcut (Z) - works anytime there's a review to undo
      if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && lastReviewId) {
        e.preventDefault()
        handleUndo()
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
  }, [isRevealed, intervals, isSubmitting, lastReviewId])

  // Loading state
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

  // Quick 10 session complete
  if (isQuick10 && quick10SessionComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="quick10-complete-icon mb-4">⚡</div>
          <h1 className="text-2xl font-bold mb-2">Quick 10 Complete!</h1>
          <p className="text-gray-400 mb-6">
            You reviewed {quick10Queue.length} card{quick10Queue.length !== 1 ? 's' : ''}
          </p>

          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-dark-card hover:bg-dark-accent rounded-lg transition-colors"
            >
              Home
            </Link>
            <button
              onClick={() => {
                setQuick10SessionComplete(false)
                initQuick10()
              }}
              className="px-6 py-3 bg-accent-green hover:opacity-90 rounded-lg text-gray-900 font-medium"
            >
              Another 10
            </button>
          </div>
        </div>
      </div>
    )
  }

  // No cards due
  if (!card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="empty-state-icon mx-auto mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-2">All caught up!</h1>
          <p className="text-gray-400 mb-6">No cards due right now.</p>

          {stats && (
            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto text-sm mb-6">
              <div className="bg-dark-card p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.reviewedToday}</div>
                <div className="text-gray-400">Reviewed today</div>
              </div>
              <div className="bg-dark-card p-4 rounded-lg">
                <div className="text-2xl font-bold">{stats.dueToday}</div>
                <div className="text-gray-400">Due later today</div>
              </div>
            </div>
          )}

          <Link
            href="/"
            className="px-6 py-3 bg-accent-green hover:opacity-90 rounded-lg text-gray-900 inline-block"
          >
            Back Home
          </Link>
        </div>
      </div>
    )
  }

  // Calculate progress for Quick 10
  const quick10Progress = isQuick10
    ? ((quick10Index + 1) / quick10Queue.length) * 100
    : 0

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-4xl mx-auto">
      {/* Header with stats */}
      <div className="flex justify-between items-center mb-3">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">
          ← Home
        </Link>

        {isQuick10 ? (
          <div className="flex items-center gap-2">
            <span className="quick-deck-badge">⚡ Quick 10</span>
            <span className="text-sm text-gray-400">
              {quick10Index + 1}/{quick10Queue.length}
            </span>
          </div>
        ) : (
          <div className="text-sm text-gray-400">
            {remaining} card{remaining !== 1 ? 's' : ''} remaining
          </div>
        )}

        {stats && !isQuick10 && (
          <div className="flex gap-4 text-sm text-gray-400">
            <span>Today: {stats.reviewedToday}</span>
            <span>Retention: {stats.retentionRate}%</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-bar mb-3">
        <div
          className="progress-fill"
          style={{
            width: isQuick10
              ? `${quick10Progress}%`
              : `${Math.min(100, (stats?.reviewedToday || 0) / Math.max(1, (stats?.dueToday || 1)) * 100)}%`
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
        <div className="mt-4 space-y-3">
          <RatingButtons
            intervals={intervals}
            onRate={handleRate}
            disabled={isSubmitting}
          />
          <ActionButtons
            onAbandon={handleAbandon}
            onFlag={handleFlag}
            onUndo={lastReviewId ? handleUndo : undefined}
            disabled={isSubmitting}
          />
        </div>
      )}

      {/* Keyboard hints */}
      <div className="mt-4 text-center text-xs text-gray-500">
        {!isRevealed ? (
          <span>
            <span className="kbd">Space</span> to reveal
            {lastReviewId && <> • <span className="kbd cursor-pointer hover:text-gray-300" onClick={handleUndo}>Z undo</span></>}
          </span>
        ) : (
          <span>
            <span className="kbd">1-4</span> to rate
            {lastReviewId && <> • <span className="kbd cursor-pointer hover:text-gray-300" onClick={handleUndo}>Z undo</span></>}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-pulse">
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    }>
      <ReviewContent />
    </Suspense>
  )
}
