import { useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { APP_NAME } from '../constants/app'
import { resolveTheme } from '../theme'

export default function ShareModal({ sessionId, topic, onClose }) {
  const [copied, setCopied] = useState('')
  const qrRef = useRef(null)
  const shareLink = `${window.location.origin}/?code=${sessionId}`
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share
  const isDark = resolveTheme() === 'dark'

  function getQrCanvas() {
    return qrRef.current?.querySelector('canvas') || null
  }

  function qrToBlob() {
    return new Promise((resolve) => {
      const canvas = getQrCanvas()
      if (!canvas) return resolve(null)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  async function downloadQr() {
    const blob = await qrToBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hear-the-room-${sessionId}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function shareQr() {
    const blob = await qrToBlob()
    if (!blob) return
    const file = new File([blob], `hear-the-room-${sessionId}-qr.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: APP_NAME,
          text: topic ? `Scan to join my session: "${topic}"` : `Scan to join my session on ${APP_NAME}`,
        })
      } catch {
        /* user cancelled */
      }
    } else {
      downloadQr()
    }
  }

  const canShareFiles =
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

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
        title: APP_NAME,
        text: topic ? `Join my session: "${topic}"` : `Join my session on ${APP_NAME}`,
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
        <p className="modal-sub">Scan the QR code, or share the code or link so people can join your session.</p>

        <div className="share-qr" data-testid="share-qr">
          <div className="share-qr-frame" ref={qrRef}>
            <QRCodeCanvas
              value={shareLink}
              size={168}
              level="M"
              includeMargin={false}
              bgColor={isDark ? '#1a1a1d' : '#ffffff'}
              fgColor={isDark ? '#f2f2f3' : '#111111'}
            />
          </div>
          <span className="share-qr-hint">Point a phone camera here to join</span>
          <div className="share-qr-actions">
            <button className="btn" onClick={downloadQr} data-testid="download-qr">
              Save QR
            </button>
            {canShareFiles && (
              <button className="btn" onClick={shareQr} data-testid="share-qr-btn">
                Share QR
              </button>
            )}
          </div>
        </div>

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
