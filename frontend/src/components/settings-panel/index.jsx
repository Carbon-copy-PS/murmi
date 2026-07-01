import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSelect from '../language-select'
import { CG_DEPTH_OPTIONS } from '../../constants/common-ground-depth'

function formatTimeLeft(ms, t) {
  if (ms <= 0) return t('settings.expired')
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return t('settings.daysHoursLeft', { days, hours })
  if (hours > 0) return t('settings.hoursMinutesLeft', { hours, minutes })
  if (minutes > 0) return t('settings.minutesLeft', { minutes })
  return t('settings.lessThanMinute')
}

function SessionLifetime({ expiresAt }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  if (!expiresAt) return null
  const msLeft = expiresAt * 1000 - now
  const expired = msLeft <= 0

  return (
    <section className="settings-section" data-testid="settings-lifetime">
      <div className="settings-section-head">
        <span className="settings-section-title">{t('settings.lifetimeTitle')}</span>
        <span className="settings-section-hint">
          {t('settings.lifetimeHintBefore')}
          <strong>{t('settings.lifetimeHintResults')}</strong>
          {t('settings.lifetimeHintAfter')}
        </span>
      </div>
      <span className={`session-lifetime-pill ${expired ? 'expired' : ''}`} data-testid="settings-time-left">
        <span className="session-lifetime-dot" aria-hidden="true" />
        {formatTimeLeft(msLeft, t)}
      </span>
    </section>
  )
}

export default function SettingsPanel({
  roomLanguage = 'en',
  onLanguageChange,
  cgDepth = 'extended',
  onCgDepthChange,
  autoApprove = false,
  onToggleAutoApprove,
  voteType = 'binary',
  voteTypeLocked = false,
  defaultCanAddStatement = true,
  onToggleDefaultStatementPermission,
  expiresAt = null,
}) {
  const { t } = useTranslation()
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <SessionLifetime expiresAt={expiresAt} />

      <section className="settings-section" data-testid="settings-language">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('settings.spokenLanguage')}</span>
          <span className="settings-section-hint">{t('settings.spokenLanguageHint')}</span>
        </div>
        <LanguageSelect value={roomLanguage} onChange={onLanguageChange} data-testid="settings-language-select" inline />
      </section>

      <section className="settings-section" data-testid="settings-common-ground">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('settings.cgLevel')}</span>
          <span className="settings-section-hint">{t('settings.cgLevelHint')}</span>
        </div>
        <div className="settings-depth-options">
          {CG_DEPTH_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`cg-depth-btn depth-${opt.id} ${cgDepth === opt.id ? 'is-active' : ''}`}
              data-testid={`settings-depth-${opt.id}`}
              aria-pressed={cgDepth === opt.id}
              onClick={() => onCgDepthChange(opt.id)}
              title={t(`cgDepth.${opt.id}.hint`)}
            >
              <span className="cg-depth-btn-tier">{t('settings.level', { tier: opt.tier })}</span>
              <span className="cg-depth-btn-label">
                {t(`cgDepth.${opt.id}.label`)}
                {opt.recommended && <span className="cg-depth-rec">{t('settings.recommended')}</span>}
              </span>
              <span className="cg-depth-btn-hint">{t(`cgDepth.${opt.id}.hint`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" data-testid="settings-participant-arguments">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('settings.letParticipantsAdd')}</span>
          <span className="settings-section-hint">{t('settings.letParticipantsAddHint')}</span>
        </div>
        <label className="switch" data-testid="settings-default-add">
          <input
            type="checkbox"
            checked={defaultCanAddStatement}
            onChange={(e) => onToggleDefaultStatementPermission(e.target.checked)}
            data-testid="settings-default-add-input"
          />
          <span className="switch-slider" />
        </label>
      </section>

      <section className="settings-section" data-testid="settings-moderation">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('settings.autoApprove')}</span>
          <span className="settings-section-hint">{t('settings.autoApproveHint')}</span>
        </div>
        <label className="switch" data-testid="settings-auto-approve">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => onToggleAutoApprove(e.target.checked)}
            data-testid="settings-auto-approve-input"
          />
          <span className="switch-slider" />
        </label>
      </section>

      <section className="settings-section" data-testid="settings-vote-scale">
        <div className="settings-section-head">
          <span className="settings-section-title">{t('settings.voteScale')}</span>
          <span className="settings-section-hint">
            {voteTypeLocked ? t('settings.voteScaleLocked') : t('settings.voteScaleUnlocked')}
          </span>
        </div>
        <span className="vote-type-locked" data-testid="settings-vote-type">
          {voteType === 'likert' ? t('settings.likert') : t('settings.binary')}
          {voteTypeLocked && <span className="vote-type-lock" aria-label={t('settings.locked')}>🔒</span>}
        </span>
      </section>
    </div>
  )
}
