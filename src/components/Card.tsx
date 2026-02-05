'use client'

import { useState, useEffect } from 'react'
import type { Card as CardType } from '@/lib/supabase'

interface CardProps {
  card: CardType
  isRevealed: boolean
  onReveal: () => void
}

/**
 * Remove [blocked](url) and [reveal](url) links from text
 */
function cleanCardText(text: string): string {
  return text
    .replace(/\[blocked\]\([^)]+\)/g, '')
    .replace(/\[reveal\]\([^)]+\)/g, '')
    .replace(/\[image\]\([^)]+\)/g, '')
    .trim()
}

/**
 * Parse cloze text and return question/answer
 */
function parseCloze(text: string): { question: string; answer: string } {
  const match = text.match(/\[([^\]]+)\]/)
  if (!match) {
    return { question: text, answer: '' }
  }
  const answer = match[1]
  const question = text.replace(`[${answer}]`, '[...]')
  return { question, answer }
}

export default function Card({ card, isRevealed, onReveal }: CardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  // Reset image loaded state when card changes
  useEffect(() => {
    setImageLoaded(false)
  }, [card.card_id])

  const renderContent = () => {
    if (card.card_type === 'occlusion') {
      return (
        <div className="flex flex-col items-center gap-4">
          {/* Question */}
          <p className="text-2xl text-center text-gray-300 font-medium">
            {cleanCardText(card.question || 'What is hidden?')}
          </p>

          {/* Image - shows blocked or reveal based on state */}
          {!isRevealed && card.blocked_image && (
            <img
              src={card.blocked_image}
              alt="Blocked"
              className="card-image"
              onLoad={() => setImageLoaded(true)}
            />
          )}
          {isRevealed && card.reveal_image && (
            <img
              src={card.reveal_image}
              alt="Revealed"
              className="card-image"
            />
          )}

          {/* Answer (when revealed) */}
          {isRevealed && (
            <p className="text-3xl font-bold text-accent-green text-center mt-6">
              {card.answer}
            </p>
          )}
        </div>
      )
    }

    if (card.card_type === 'cloze') {
      const { question, answer } = parseCloze(card.cloze_text || card.question || '')
      return (
        <div className="flex flex-col items-center gap-4">
          <p className="text-2xl text-center leading-relaxed">
            {isRevealed ? (
              // Show full text with answer highlighted
              (card.cloze_text || card.question || '').replace(
                /\[([^\]]+)\]/,
                '<span class="text-accent-green font-bold">$1</span>'
              ).split('<span').map((part, i) => {
                if (i === 0) return part
                const [inner, rest] = part.split('</span>')
                return (
                  <span key={i}>
                    <span className="text-accent-green font-bold">
                      {inner.replace('class="text-accent-green font-bold">', '')}
                    </span>
                    {rest}
                  </span>
                )
              })
            ) : (
              question
            )}
          </p>
        </div>
      )
    }

    // Q/A card
    return (
      <div className="flex flex-col items-center gap-8">
        {/* Question */}
        <p className="text-2xl text-center leading-relaxed font-medium">
          {cleanCardText(card.question || '')}
        </p>

        {/* Answer (when revealed) */}
        {isRevealed && (
          <div className="border-t-2 border-gray-600 pt-8 w-full">
            <p className="text-3xl font-bold text-accent-green text-center">
              {card.answer}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="bg-dark-card rounded-xl p-8 min-h-[400px] flex flex-col cursor-pointer"
      onClick={!isRevealed ? onReveal : undefined}
    >
      {/* Breadcrumbs */}
      {(card.topic || card.subtopic) && (
        <div className="text-sm text-gray-500 mb-2">
          {card.topic}
          {card.topic && card.subtopic && ' → '}
          {card.subtopic}
        </div>
      )}

      {/* Card content */}
      <div className="flex-1 flex items-center justify-center">
        {renderContent()}
      </div>

      {/* Tap to reveal hint */}
      {!isRevealed && (
        <div className="text-center text-gray-500 text-sm mt-2">
          Tap to reveal • <span className="kbd">Space</span>
        </div>
      )}
    </div>
  )
}
