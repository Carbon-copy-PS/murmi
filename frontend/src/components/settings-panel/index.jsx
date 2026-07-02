import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSelect from '../language-select'
import { CG_DEPTH_OPTIONS } from '../../constants/common-ground-depth'

const VOTING_LIFETIME_OPTIONS = [
  { hours: 1, key: 'len1h' },
  { hours: 6, key: 'len6h' },
  { hours: 12, key: 'len12h' },
  { hours: 24, key: 'len1d' },
  { hours: 72, key: 'len3d' },
  { hours: 168, key: 'len1w' },
  { hours: 336, key: 'len2w' },
  { hours: 720, key: 'len1mo' },
]

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

function durationLabel(hours, t) {
  const opt = VOTING_LIFETIME_OPTIONS.find((o) => o.hours === hours)
  if (opt) return t(`settings.votingLen.${opt.key}`)
  return t('settings.votingLenHours', { count: hours })
}

function formatLogTime(at) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(at * 1000))
  } catch {
    return ''
  }
}

function VotingControls({
  votingOpen,
  votingLifetimeHours,
  votingExpiresAt,
  votingActivity,
  onSetVotingOpen,
  onSetVotingLifetime,
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const msLeft = votingExpiresAt ? votingExpiresAt * 1000 - now : null
  const expired = msLeft != null && msLeft <= 0
  const active = votingOpen && !expired
  const options = VOTING_LIFETIME_OPTIONS.some((o) => o.hours === votingLifetimeHours)
    ? VOTING_LIFETIME_OPTIONS
    : [...VOTING_LIFETIME_OPTIONS, { hours: votingLifetimeHours, key: null }]
  const log = [...(votingActivity || [])].reverse().slice(0, 8)

  return (
    <section className="settings-section" data-testid="settings-voting">
      <div className="settings-section-head">
        <span className="settings-section-title">{t('settings.votingTitle')}</span>
        <span className="settings-section-hint">{t('settings.votingHint')}</span>
      </div>

      <div className="voting-control-row">
        <span className={`voting-status-pill ${active ? 'open' : 'closed'}`} data-testid="settings-voting-status">
          <span className="voting-status-dot" aria-hidden="true" />
          {active
            ? (msLeft != null
                ? t('settings.votingOpenFor', { time: formatTimeLeft(msLeft, t) })
                : t('settings.votingOpen'))
            : t('settings.votingStopped')}
        </span>
        <button
          type="button"
          className={`btn sm voting-toggle-btn ${active ? 'danger' : 'primary'}`}
          onClick={() => onSetVotingOpen(!active)}
          data-testid="settings-voting-toggle"
        >
          {active ? t('settings.stopVoting') : t('settings.resumeVoting')}
        </button>
      </div>

      {active ? (
        <>
          <div className="voting-lifetime-row">
            <label className="voting-lifetime-label" htmlFor="voting-lifetime-select">
              {t('settings.votingLifetimeLabel')}
            </label>
            <select
              id="voting-lifetime-select"
              className="voting-lifetime-select"
              value={String(votingLifetimeHours)}
              onChange={(e) => onSetVotingLifetime(Number(e.target.value))}
              data-testid="settings-voting-lifetime-select"
            >
              {options.map((o) => (
                <option key={o.hours} value={String(o.hours)}>
                  {o.key ? t(`settings.votingLen.${o.key}`) : t('settings.votingLenHours', { count: o.hours })}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <span className="voting-toggle-note">{t('settings.resumeVotingNote')}</span>
      )}

      {log.length > 0 && (
        <div className="voting-log" data-testid="settings-voting-log">
          <button
            type="button"
            className="voting-log-toggle"
            onClick={() => setLogOpen((o) => !o)}
            aria-expanded={logOpen}
            data-testid="settings-voting-log-toggle"
          >
            <span className="voting-log-title">
              {t('settings.votingLogTitle')}
              <span className="voting-log-count">{log.length}</span>
            </span>
            <span className={`votes-recap-chevron ${logOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
          </button>
          {logOpen && (
            <ul className="voting-log-list">
              {log.map((entry, i) => (
                <li key={`vlog-${entry.at}-${i}`} className="voting-log-item">
                  <span className={`voting-log-badge ${entry.action}`}>
                    {entry.action === 'stopped' && t('settings.votingLog.stopped')}
                    {entry.action === 'resumed' && t('settings.votingLog.resumed')}
                    {entry.action === 'expired' && t('settings.votingLog.expired')}
                    {entry.action === 'lifetime' && t('settings.votingLog.lifetime', { duration: durationLabel(entry.hours, t) })}
                  </span>
                  <span className="voting-log-meta">
                    {entry.by ? `${entry.by} · ` : ''}{formatLogTime(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
  votingOpen = true,
  votingLifetimeHours = 24,
  votingExpiresAt = null,
  votingActivity = [],
  onSetVotingOpen,
  onSetVotingLifetime,
}) {
  const { t } = useTranslation()
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <VotingControls
        votingOpen={votingOpen}
        votingLifetimeHours={votingLifetimeHours}
        votingExpiresAt={votingExpiresAt}
        votingActivity={votingActivity}
        onSetVotingOpen={onSetVotingOpen}
        onSetVotingLifetime={onSetVotingLifetime}
      />

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
