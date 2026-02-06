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
      setQuick10SessionComplete(true)
      setCard(null)
      return
    }

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
      alert('Card flagged for editing')
    } catch (err) {
      console.error('Error flagging card:', err)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Loading
  if (isLoading) {
    return (
      <div className="review-shell">
        <div className="loading-pulse" style={{ marginTop: '45vh' }}>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
          <div className="loading-dot"></div>
        </div>
      </div>
    )
  }

  // Quick 10 complete
  if (isQuick10 && quick10SessionComplete) {
    return (
      <div className="review-shell review-shell--centered">
        <div className="review-complete">
          <div className="quick10-complete-icon">⚡</div>
          <h1 className="review-complete-title">Quick 10 Complete</h1>
          <p className="review-complete-sub">
            {quick10Queue.length} card{quick10Queue.length !== 1 ? 's' : ''} reviewed
          </p>
          <div className="review-complete-actions">
            <Link href="/" className="review-complete-btn review-complete-btn--ghost">
              Home
            </Link>
            <button
              onClick={() => {
                setQuick10SessionComplete(false)
                initQuick10()
              }}
              className="review-complete-btn review-complete-btn--primary"
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
      <div className="review-shell review-shell--centered">
        <div className="review-complete">
          <div className="empty-state-icon">✓</div>
          <h1 className="review-complete-title">All caught up</h1>
          <p className="review-complete-sub">No cards due right now</p>

          {stats && (
            <div className="review-end-stats">
              <div className="review-end-stat">
                <span className="review-end-stat-val">{stats.reviewedToday}</span>
                <span className="review-end-stat-label">reviewed</span>
              </div>
              <div className="review-end-stat">
                <span className="review-end-stat-val">{stats.dueToday}</span>
                <span className="review-end-stat-label">due later</span>
              </div>
            </div>
          )}

          <Link href="/" className="review-complete-btn review-complete-btn--primary" style={{ marginTop: '24px' }}>
            Back Home
          </Link>
        </div>
      </div>
    )
  }

  // Progress calculation
  const quick10Progress = isQuick10
    ? ((quick10Index + 1) / quick10Queue.length) * 100
    : 0
  const normalProgress = Math.min(100, (stats?.reviewedToday || 0) / Math.max(1, (stats?.dueToday || 1)) * 100)

  return (
    <div className="review-shell">
      {/* Top progress bar — thin line across full width */}
      <div className="review-progress-track">
        <div
          className="review-progress-fill"
          style={{ width: `${isQuick10 ? quick10Progress : normalProgress}%` }}
        />
      </div>

      {/* Compact header */}
      <header className="review-header">
        <Link href="/" className="review-back" aria-label="Back home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>

        {isQuick10 ? (
          <div className="review-counter">
            <span className="review-counter-badge">⚡</span>
            <span>{quick10Index + 1}/{quick10Queue.length}</span>
          </div>
        ) : (
          <span className="review-counter">
            {remaining} remaining
          </span>
        )}

        {stats && !isQuick10 && (
          <div className="review-stats-row">
            <span>{stats.reviewedToday} today</span>
            <span className="review-stats-sep">·</span>
            <span>{stats.retentionRate}%</span>
          </div>
        )}
      </header>

      {/* Card area — takes remaining space */}
      <main className="review-body">
        <Card
          card={card}
          isRevealed={isRevealed}
          onReveal={handleReveal}
        />
      </main>

      {/* Bottom controls */}
      <footer className="review-footer">
        {isRevealed && intervals ? (
          <div className="review-controls-revealed">
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
        ) : (
          <div className="review-hint-bar">
            <span className="kbd">Space</span> to reveal
            {lastReviewId && (
              <> · <span className="kbd review-undo-hint" onClick={handleUndo}>Z undo</span></>
            )}
          </div>
        )}
      </footer>
    </div>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="review-shell">
        <div className="loading-pulse" style={{ marginTop: '45vh' }}>
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
