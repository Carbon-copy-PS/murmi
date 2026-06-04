import { useState, useEffect } from 'react'

export default function ShareModal({ sessionId, topic, onClose }) {
  const [copied, setCopied] = useState('')
  const shareLink = `${window.location.origin}/?code=${sessionId}`
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy(value, key) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setCopied('')
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: 'Debate Sense',
        text: topic ? `Join my debate: "${topic}"` : 'Join my debate on Debate Sense',
        url: shareLink,
      })
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="share-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share session"
        onClick={(e) => e.stopPropagation()}
        data-testid="share-modal"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close" data-testid="share-close">
          ×
        </button>

        <h2 className="modal-title">Invite others</h2>
        <p className="modal-sub">Share this code or link so people can join your debate.</p>

        <div className="share-code-box">
          <span className="share-code">{sessionId}</span>
          <button
            className="btn"
            onClick={() => copy(sessionId, 'code')}
            data-testid="copy-code"
          >
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
        </div>

        <div className="share-link-box">
          <input className="share-link" type="text" value={shareLink} readOnly data-testid="share-link" />
          <button
            className="btn"
            onClick={() => copy(shareLink, 'link')}
            data-testid="copy-link"
          >
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {canNativeShare && (
          <button className="btn primary share-native" onClick={nativeShare} data-testid="native-share">
            Share…
          </button>
        )}
      </div>
    </div>
  )
}
