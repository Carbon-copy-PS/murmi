import { useEffect, useState } from 'react'
import LanguageSelect from '../language-select'
import { CG_DEPTH_OPTIONS } from '../../constants/common-ground-depth'

function formatTimeLeft(ms) {
  if (ms <= 0) return 'Expired'
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  if (minutes > 0) return `${minutes}m left`
  return 'Less than a minute left'
}

function SessionLifetime({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  if (!expiresAt) return null
  const msLeft = expiresAt * 1000 - now
  const expired = msLeft <= 0

  return (
    <section className="settings-section" data-testid="settings-lifetime">
      <div className="settings-section-head">
        <span className="settings-section-title">Session lifetime</span>
        <span className="settings-section-hint">
          When the timer runs out, this session and all of its transcript, statements, votes and
          common ground are permanently deleted and cannot be recovered. Export a copy from the
          {' '}<strong>Results</strong> tab before then to keep it.
        </span>
      </div>
      <span className={`session-lifetime-pill ${expired ? 'expired' : ''}`} data-testid="settings-time-left">
        <span className="session-lifetime-dot" aria-hidden="true" />
        {formatTimeLeft(msLeft)}
      </span>
    </section>
  )
}

export default function SettingsPanel({
  roomLanguage = 'auto',
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
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <SessionLifetime expiresAt={expiresAt} />

      <section className="settings-section" data-testid="settings-language">
        <div className="settings-section-head">
          <span className="settings-section-title">Spoken language</span>
          <span className="settings-section-hint">Language used to transcribe the room audio.</span>
        </div>
        <LanguageSelect value={roomLanguage} onChange={onLanguageChange} data-testid="settings-language-select" inline />
      </section>

      <section className="settings-section" data-testid="settings-common-ground">
        <div className="settings-section-head">
          <span className="settings-section-title">AI common ground level</span>
          <span className="settings-section-hint">Depth used when generating common ground from votes.</span>
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
              title={opt.hint}
            >
              <span className="cg-depth-btn-tier">Level {opt.tier}</span>
              <span className="cg-depth-btn-label">
                {opt.label}
                {opt.recommended && <span className="cg-depth-rec">Recommended</span>}
              </span>
              <span className="cg-depth-btn-hint">{opt.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" data-testid="settings-participant-arguments">
        <div className="settings-section-head">
          <span className="settings-section-title">Let participants add arguments</span>
          <span className="settings-section-hint">Default for people who join from now on. Existing participants keep their current access (manage them in Participants).</span>
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
          <span className="settings-section-title">Auto-approve statements</span>
          <span className="settings-section-hint">Statements from the mic go live after 5s unless held for review.</span>
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
          <span className="settings-section-title">Vote scale</span>
          <span className="settings-section-hint">
            {voteTypeLocked ? 'Locked once the discussion has started.' : 'Set when creating the session.'}
          </span>
        </div>
        <span className="vote-type-locked" data-testid="settings-vote-type">
          {voteType === 'likert' ? 'Likert (5-point)' : 'Agree / Disagree'}
          {voteTypeLocked && <span className="vote-type-lock" aria-label="Locked">🔒</span>}
        </span>
      </section>
    </div>
  )
}
