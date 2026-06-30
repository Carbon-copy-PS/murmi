import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CG_DEPTH_LABELS } from '../../constants/common-ground-depth'
import { CommonGroundCard } from '../ResultsPanel'

const noop = () => {}

export default function CommonGroundPopup({ item, onView, onClose, onVote }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!item) return null

  const depthLabel = CG_DEPTH_LABELS[item.depth] || item.depth

  return createPortal(
    <div className="modal-backdrop cg-popup-backdrop" onClick={onClose} data-testid="cg-popup-backdrop">
      <div
        className="modal cg-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cg-popup-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="cg-popup"
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
          data-testid="cg-popup-close"
        >
          ×
        </button>

        <div className="cg-popup-head">
          <span className="cg-popup-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </span>
          <div className="cg-popup-head-copy">
            <span className="cg-popup-eyebrow">New AI common ground</span>
            <h3 className="cg-popup-title" id="cg-popup-title">The room is finding shared ground</h3>
          </div>
          {depthLabel && <span className={`cg-depth-badge depth-${item.depth}`}>{depthLabel}</span>}
        </div>

        <div className="cg-popup-scroll" data-testid="cg-popup-scroll">
          <CommonGroundCard
            data={item}
            isHost={false}
            onDismiss={noop}
            onVote={onVote}
          />
          <p className="cg-popup-note">
            This summary updates as the conversation evolves. You can revisit it and change your
            reaction anytime on the <strong>Results</strong> page.
          </p>
        </div>

        <div className="cg-popup-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            data-testid="cg-popup-later"
          >
            Got it
          </button>
          <button
            type="button"
            className="btn primary cg-popup-view"
            onClick={onView}
            data-testid="cg-popup-view"
          >
            View in Results
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
