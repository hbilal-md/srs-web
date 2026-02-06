'use client'

import { useState } from 'react'

interface ActionButtonsProps {
  onAbandon: () => void
  onFlag: () => void
  onUndo?: () => void
  disabled?: boolean
}

export default function ActionButtons({ onAbandon, onFlag, onUndo, disabled }: ActionButtonsProps) {
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)

  const handleAbandon = () => {
    if (showAbandonConfirm) {
      onAbandon()
      setShowAbandonConfirm(false)
    } else {
      setShowAbandonConfirm(true)
      setTimeout(() => setShowAbandonConfirm(false), 3000)
    }
  }

  return (
    <div className="action-row">
      <button
        onClick={handleAbandon}
        disabled={disabled}
        className={`action-link ${showAbandonConfirm ? 'action-link--danger' : ''}`}
      >
        {showAbandonConfirm ? 'Confirm suspend?' : 'Suspend'}
      </button>
      <span className="action-dot" />
      <button
        onClick={onFlag}
        disabled={disabled}
        className="action-link"
      >
        Flag
      </button>
      {onUndo && (
        <>
          <span className="action-dot" />
          <button
            onClick={onUndo}
            disabled={disabled}
            className="action-link"
            title="Undo last review (Z)"
          >
            Undo
          </button>
        </>
      )}
    </div>
  )
}
