'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/Card'
import RatingButtons from '@/components/RatingButtons'
import ActionButtons from '@/components/ActionButtons'
import { Rating } from '@/lib/fsrs'
import type { Card as CardType } from '@/lib/supabase'

interface DeckInfo {
  deck_id: string
  name: string
  totalCards: number
  progress: number
  progressPercent: number
  completed: boolean
}

interface NextCardResponse {
  card: CardType | null
  intervals?: Record<Rating, number>
  deck?: DeckInfo
  message?: string
}

export default function DeckReviewPage() {
  const params = useParams()
  const deckId = params.id as string

  const [card, setCard] = useState<CardType | null>(null)
  const [intervals, setIntervals] = useState<Record<Rating, number> | null>(null)
  const [deck, setDeck] = useState<DeckInfo | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null)
  const [lastReviewId, setLastReviewId] = useState<string | null>(null)
  const [lastRating, setLastRating] = useState<number | null>(null)

  // Fetch next card from deck
  const fetchNextCard = useCallback(async () => {
    setIsLoading(true)
    setIsRevealed(false)
    setReviewStartTime(null)
    setLastReviewId(null)
    setLastRating(null)

    try {
      const res = await fetch(`/api/decks/${deckId}/next`)
      const data: NextCardResponse = await res.json()

      setCard(data.card)
      setIntervals(data.intervals || null)
      setDeck(data.deck || null)

      if (data.card) {
        setReviewStartTime(Date.now())
      }
    } catch (err) {
      console.error('Error fetching card:', err)
    } finally {
      setIsLoading(false)
    }
  }, [deckId])

  // Initial load
  useEffect(() => {
    fetchNextCard()
  }, [fetchNextCard])

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
      // Submit the review
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

      // Advance deck position (pass rating so AGAIN cards get re-queued)
      await fetch(`/api/decks/${deckId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })

      // Fetch next card
      await fetchNextCard()
      // Store review info for undo (after fetchNextCard clears it, set again)
      setLastReviewId(reviewId)
      setLastRating(rating)
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
      // Advance deck position
      await fetch(`/api/decks/${deckId}/next`, {
        method: 'POST',
      })
      await fetchNextCard()
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
      // Undo the review (restore card state)
      const res = await fetch('/api/review/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: lastReviewId }),
      })
      const data = await res.json()

      // Roll back deck position
      await fetch(`/api/decks/${deckId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo: true, lastRating }),
      })

      if (data.success && data.card) {
        setCard(data.card)
        setIntervals(data.intervals || null)
        setIsRevealed(false)
        setLastReviewId(null)
        setLastRating(null)
        setReviewStartTime(Date.now())
        // Update deck progress
        if (deck) {
          setDeck({
            ...deck,
            progress: Math.max(0, deck.progress - 1),
            progressPercent: Math.max(0, Math.round(((deck.progress - 1) / deck.totalCards) * 100)),
            completed: false,
          })
        }
      }
    } catch (err) {
      console.error('Error undoing review:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle flag
  const handleFlag = async () => {
    if (!card) return

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  // Deck completed
  if (!card && deck) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">🎉 Deck Complete!</h1>
          <p className="text-xl text-gray-300 mb-2">{deck.name}</p>
          <p className="text-gray-400 mb-6">
            You reviewed all {deck.totalCards} cards.
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Back Home
            </Link>
            <button
              onClick={async () => {
                await fetch(`/api/decks/${deckId}/reset`, { method: 'POST' })
                fetchNextCard()
              }}
              className="px-6 py-3 bg-accent-green hover:opacity-90 rounded-lg text-gray-900 font-medium"
            >
              Review Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Deck not found or empty.</p>
          <Link href="/" className="text-accent-green hover:opacity-80">
            Back Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">
          ← Home
        </Link>
        {deck && (
          <div className="text-sm text-gray-400">
            {deck.name}
          </div>
        )}
      </div>

      {/* Progress */}
      {deck && (
        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>{deck.progress + 1} / {deck.totalCards}</span>
            <span>{deck.progressPercent}%</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${deck.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex flex-col">
        <Card
          card={card}
          isRevealed={isRevealed}
          onReveal={handleReveal}
        />
      </div>

      {/* Rating buttons */}
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
