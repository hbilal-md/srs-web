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
  newRemaining: number
  dueRemaining: number
  learningNow: number
}

interface NextCardResponse {
  card: CardType | null
  cardType?: 'new' | 'review' | 'learning'
  intervals?: Record<Rating, number>
  deck?: DeckInfo
  nextDueAt?: string | null
}

export default function DeckReviewPage() {
  const params = useParams()
  const deckId = params.id as string

  const [card, setCard] = useState<CardType | null>(null)
  const [cardType, setCardType] = useState<'new' | 'review' | 'learning' | null>(null)
  const [intervals, setIntervals] = useState<Record<Rating, number> | null>(null)
  const [deck, setDeck] = useState<DeckInfo | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null)
  const [lastReviewId, setLastReviewId] = useState<string | null>(null)
  const [lastRating, setLastRating] = useState<number | null>(null)
  const [lastCardType, setLastCardType] = useState<string | null>(null)
  const [lastCardId, setLastCardId] = useState<string | null>(null)
  const [nextDueAt, setNextDueAt] = useState<string | null>(null)

  // Fetch next card from deck
  const fetchNextCard = useCallback(async () => {
    setIsLoading(true)
    setIsRevealed(false)
    setReviewStartTime(null)
    setLastReviewId(null)
    setLastRating(null)
    setLastCardType(null)
    setLastCardId(null)

    try {
      const res = await fetch(`/api/decks/${deckId}/next`)
      const data: NextCardResponse = await res.json()

      setCard(data.card)
      setCardType(data.cardType || null)
      setIntervals(data.intervals || null)
      setDeck(data.deck || null)
      setNextDueAt(data.nextDueAt || null)

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

      // Update deck session counters
      await fetch(`/api/decks/${deckId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardType, cardId: card.card_id }),
      })

      // Store for undo before fetching next
      const prevCardType = cardType
      const prevCardId = card.card_id

      // Fetch next card
      await fetchNextCard()

      // Restore undo info (fetchNextCard clears it)
      setLastReviewId(reviewId)
      setLastRating(rating)
      setLastCardType(prevCardType)
      setLastCardId(prevCardId)
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

      // Roll back deck session counters
      await fetch(`/api/decks/${deckId}/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ undo: true, cardType: lastCardType, cardId: lastCardId }),
      })

      if (data.success && data.card) {
        setCard(data.card)
        setCardType(lastCardType as 'new' | 'review' | 'learning' | null)
        setIntervals(data.intervals || null)
        setIsRevealed(false)
        setLastReviewId(null)
        setLastRating(null)
        setLastCardType(null)
        setLastCardId(null)
        setReviewStartTime(Date.now())
        // Refresh deck info
        const deckRes = await fetch(`/api/decks/${deckId}/next`)
        const deckData = await deckRes.json()
        setDeck(deckData.deck || deck)
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

  // All caught up / session done
  if (!card && deck) {
    const nextDueDate = nextDueAt ? new Date(nextDueAt) : null
    const minutesUntilDue = nextDueDate
      ? Math.max(1, Math.round((nextDueDate.getTime() - Date.now()) / 60000))
      : null

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-4">{'\u23F3'}</div>
          <h1 className="text-2xl font-bold mb-2">All caught up</h1>
          <p className="text-xl text-gray-300 mb-1">{deck.name}</p>

          {minutesUntilDue && (
            <p className="text-gray-400 mb-4">
              Next card due in {minutesUntilDue < 60
                ? `${minutesUntilDue} min`
                : `${Math.round(minutesUntilDue / 60)} hr`}
            </p>
          )}

          {!minutesUntilDue && deck.newRemaining > 0 && (
            <p className="text-gray-400 mb-4">
              {deck.newRemaining} new cards remaining for future sessions
            </p>
          )}

          {!minutesUntilDue && deck.newRemaining === 0 && (
            <p className="text-gray-400 mb-4">
              Nothing due right now
            </p>
          )}

          {/* Session summary */}
          <div className="flex gap-4 justify-center text-sm text-gray-400 mb-6">
            <span className="text-blue-400">{deck.newRemaining} new</span>
            <span className="text-green-400">{deck.dueRemaining} due</span>
            {deck.learningNow > 0 && <span className="text-orange-400">{deck.learningNow} learning</span>}
            <span>{deck.totalCards} total</span>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              href="/"
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Back Home
            </Link>
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
          &larr; Home
        </Link>
        {deck && (
          <div className="text-sm text-gray-400">
            {deck.name}
          </div>
        )}
      </div>

      {/* Session stats */}
      {deck && (
        <div className="flex items-center justify-center gap-4 text-sm mb-3">
          <span className="text-blue-400">{deck.newRemaining} new</span>
          <span className="text-green-400">{deck.dueRemaining} due</span>
          {deck.learningNow > 0 && (
            <span className="text-orange-400">{deck.learningNow} learning</span>
          )}
          <span className="text-gray-500">{deck.totalCards} total</span>
          {cardType && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              cardType === 'new' ? 'bg-blue-500/20 text-blue-400' :
              cardType === 'review' ? 'bg-green-500/20 text-green-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {cardType}
            </span>
          )}
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
            {lastReviewId && <> &bull; <span className="kbd cursor-pointer hover:text-gray-300" onClick={handleUndo}>Z undo</span></>}
          </span>
        ) : (
          <span>
            <span className="kbd">1-4</span> to rate
            {lastReviewId && <> &bull; <span className="kbd cursor-pointer hover:text-gray-300" onClick={handleUndo}>Z undo</span></>}
          </span>
        )}
      </div>
    </div>
  )
}
