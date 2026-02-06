'use client'

import { Rating, formatInterval } from '@/lib/fsrs'

interface RatingButtonsProps {
  intervals: Record<Rating, number>
  onRate: (rating: Rating) => void
  disabled?: boolean
}

const RATING_CONFIG = [
  {
    rating: Rating.AGAIN,
    label: 'Again',
    key: '1',
    accent: 'var(--rating-again)',
  },
  {
    rating: Rating.HARD,
    label: 'Hard',
    key: '2',
    accent: 'var(--rating-hard)',
  },
  {
    rating: Rating.GOOD,
    label: 'Good',
    key: '3',
    accent: 'var(--rating-good)',
  },
  {
    rating: Rating.EASY,
    label: 'Easy',
    key: '4',
    accent: 'var(--rating-easy)',
  },
]

export default function RatingButtons({ intervals, onRate, disabled }: RatingButtonsProps) {
  return (
    <div className="rating-row">
      {RATING_CONFIG.map(({ rating, label, key, accent }) => (
        <button
          key={rating}
          onClick={() => onRate(rating)}
          disabled={disabled}
          className="rating-btn-minimal"
          style={{ '--btn-accent': accent } as React.CSSProperties}
        >
          <span className="rating-label">{label}</span>
          <span className="rating-interval">{formatInterval(intervals[rating])}</span>
          <span className="rating-key">{key}</span>
        </button>
      ))}
    </div>
  )
}
