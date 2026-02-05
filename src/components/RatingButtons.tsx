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
    color: 'bg-red-600 hover:bg-red-500',
  },
  {
    rating: Rating.HARD,
    label: 'Hard',
    key: '2',
    color: 'bg-orange-600 hover:bg-orange-500',
  },
  {
    rating: Rating.GOOD,
    label: 'Good',
    key: '3',
    color: 'bg-accent-green hover:opacity-90',
  },
  {
    rating: Rating.EASY,
    label: 'Easy',
    key: '4',
    color: 'bg-blue-600 hover:bg-blue-500',
  },
]

export default function RatingButtons({ intervals, onRate, disabled }: RatingButtonsProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {RATING_CONFIG.map(({ rating, label, key, color }) => (
        <button
          key={rating}
          onClick={() => onRate(rating)}
          disabled={disabled}
          className={`
            rating-btn ${color}
            px-4 py-5
            rounded-lg font-medium
            flex flex-col items-center gap-1.5
            text-white
          `}
        >
          <span className="text-base font-semibold">{label}</span>
          <span className="text-sm opacity-90">
            {formatInterval(intervals[rating])}
          </span>
          <span className="kbd text-xs">{key}</span>
        </button>
      ))}
    </div>
  )
}
