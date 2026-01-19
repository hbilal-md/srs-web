'use client'

import { useState } from 'react'

interface ActionButtonsProps {
  onAbandon: () => void
  onFlag: () => void
  disabled?: boolean
}

export default function ActionButtons({ onAbandon, onFlag, disabled }: ActionButtonsProps) {
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)

  const handleAbandon = () => {
    if (showAbandonConfirm) {
      onAbandon()
      setShowAbandonConfirm(false)
    } else {
      setShowAbandonConfirm(true)
      // Auto-hide after 3 seconds
      setTimeout(() => setShowAbandonConfirm(false), 3000)
    }
  }

  return (
    <div className="flex gap-2 justify-center">
      {/* Abandon button */}
      <button
        onClick={handleAbandon}
        disabled={disabled}
        className={`
          px-3 py-2 rounded-lg text-sm
          ${showAbandonConfirm
            ? 'bg-red-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }
          transition-colors
        `}
        title="Abandon card (never show again)"
      >
        {showAbandonConfirm ? 'Confirm abandon?' : '🗑 Abandon'}
      </button>

      {/* Flag button */}
      <button
        onClick={onFlag}
        disabled={disabled}
        className="
          px-3 py-2 rounded-lg text-sm
          bg-gray-700 text-gray-300 hover:bg-gray-600
          transition-colors
        "
        title="Flag card for editing"
      >
        🚩 Flag
      </button>
    </div>
  )
}
