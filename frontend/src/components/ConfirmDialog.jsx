import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel} data-testid="confirm-backdrop">
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-testid="confirm-modal"
      >
        <h2 className="modal-title">{title}</h2>
        {message && <p className="modal-sub">{message}</p>}

        <div className="confirm-actions">
          <button className="btn" onClick={onCancel} data-testid="confirm-cancel">
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            autoFocus
            data-testid="confirm-accept"
          >
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
