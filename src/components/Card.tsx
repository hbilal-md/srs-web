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
  const [blockedLoaded, setBlockedLoaded] = useState(false)
  const [revealLoaded, setRevealLoaded] = useState(false)

  // Reset image loaded state when card changes
  useEffect(() => {
    setBlockedLoaded(false)
    setRevealLoaded(false)
  }, [card.card_id])

  const isOcclusion = card.card_type === 'occlusion'

  const renderContent = () => {
    if (isOcclusion) {
      const questionText = cleanCardText(card.question || '')

      return (
        <div className="occlusion-layout" onClick={!isRevealed ? onReveal : undefined}>
          {/* Question text — only show if meaningful */}
          {questionText && questionText !== 'What is hidden?' && (
            <p className="occlusion-question">{questionText}</p>
          )}

          {/* Stacked image container — both images load simultaneously */}
          <div className="occlusion-image-wrap">
            {card.blocked_image && (
              <img
                src={card.blocked_image}
                alt=""
                className={`occlusion-img occlusion-img--blocked ${isRevealed ? 'occl-hidden' : 'occl-visible'}`}
                onLoad={() => setBlockedLoaded(true)}
                draggable={false}
              />
            )}
            {card.reveal_image && (
              <img
                src={card.reveal_image}
                alt=""
                className={`occlusion-img occlusion-img--reveal ${isRevealed ? 'occl-visible' : 'occl-hidden'}`}
                onLoad={() => setRevealLoaded(true)}
                draggable={false}
              />
            )}

            {/* Subtle loading shimmer while images load */}
            {!blockedLoaded && !revealLoaded && (
              <div className="occlusion-shimmer" />
            )}
          </div>

          {/* Tap hint */}
          {!isRevealed && blockedLoaded && (
            <div className="review-tap-hint">
              Tap image to reveal
            </div>
          )}
        </div>
      )
    }

    if (card.card_type === 'cloze') {
      const { question } = parseCloze(card.cloze_text || card.question || '')
      return (
        <div className="review-card-inner" onClick={!isRevealed ? onReveal : undefined}>
          {/* Breadcrumb */}
          {(card.topic || card.subtopic) && (
            <div className="review-breadcrumb">
              {card.topic}{card.topic && card.subtopic && ' · '}{card.subtopic}
            </div>
          )}

          <div className="review-card-body">
            <p className="review-card-text">
              {isRevealed ? (
                // Show full text with answer highlighted
                (card.cloze_text || card.question || '').split(/\[([^\]]+)\]/).map((part, i) => {
                  if (i % 2 === 1) {
                    return (
                      <span key={i} className="cloze-answer">{part}</span>
                    )
                  }
                  return part
                })
              ) : (
                question
              )}
            </p>
          </div>

          {!isRevealed && (
            <div className="review-tap-hint">
              Tap to reveal
            </div>
          )}
        </div>
      )
    }

    // Q/A card
    return (
      <div className="review-card-inner" onClick={!isRevealed ? onReveal : undefined}>
        {/* Breadcrumb */}
        {(card.topic || card.subtopic) && (
          <div className="review-breadcrumb">
            {card.topic}{card.topic && card.subtopic && ' · '}{card.subtopic}
          </div>
        )}

        <div className="review-card-body">
          <p className="review-card-text">
            {cleanCardText(card.question || '')}
          </p>

          {isRevealed && (
            <>
              <div className="review-divider" />
              <p className="review-card-answer">
                {card.answer}
              </p>
            </>
          )}
        </div>

        {!isRevealed && (
          <div className="review-tap-hint">
            Tap to reveal
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`review-card ${isOcclusion ? 'review-card--occlusion' : 'review-card--text'}`}>
      {/* Breadcrumb for occlusion cards — outside the card body */}
      {isOcclusion && (card.topic || card.subtopic) && (
        <div className="review-breadcrumb">
          {card.topic}{card.topic && card.subtopic && ' · '}{card.subtopic}
        </div>
      )}
      {renderContent()}
    </div>
  )
}
