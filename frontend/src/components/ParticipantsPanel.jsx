import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguage, getLanguageLabel } from '../constants/languages'

const FILTERS = [
  { id: 'all', labelKey: 'participants.all' },
  { id: 'pending', labelKey: 'participants.notDone' },
  { id: 'done', labelKey: 'participants.completed' },
]

const SORTS = [
  { id: 'name', labelKey: 'participants.sortName' },
  { id: 'progress', labelKey: 'participants.sortProgress' },
]

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

function ParticipantRow({ p, isYou, canManage, onToggleHost, onSetRecorder, onToggleStatementPermission }) {
  const { t } = useTranslation()
  const canAdd = p.canAddStatement !== false
  const required = p.votesRequired || 0
  const cast = p.votesCast || 0
  const remaining = Math.max(required - cast, 0)
  const pct = required ? Math.min((cast / required) * 100, 100) : 0
  const done = required > 0 && remaining === 0

  return (
    <li className="participant-row" data-testid={`participant-${p.id}`}>
      <span className={`participant-avatar ${p.isHost ? 'host' : ''}`} aria-hidden="true">
        {initials(p.name) || '?'}
      </span>

      <div className="participant-main">
        <div className="participant-head">
          <span className="participant-name" data-testid={`participant-name-${p.id}`}>
            {p.name}
            {isYou && <span className="you-chip">{t('common.you')}</span>}
            {p.isHost && <span className="host-badge inline" data-testid={`participant-host-${p.id}`}>{t('common.host')}</span>}
            {p.isRecorder && <span className="recorder-chip" title={t('participants.recordingMic')}>{t('participants.mic')}</span>}
            {!p.isHost && !canAdd && (
              <span className="mute-chip" data-testid={`participant-muted-${p.id}`} title={t('participants.cantAdd')}>{t('participants.addOff')}</span>
            )}
          </span>
          {p.language && (
            <span className="participant-lang" title={getLanguageLabel(p.language)}>
              {getLanguage(p.language)?.flag && (
                <span className="participant-lang-flag" aria-hidden="true">{getLanguage(p.language).flag}</span>
              )}
              {getLanguageLabel(p.language)}
            </span>
          )}
        </div>

        <div className="participant-votes">
          <div className="participant-vote-track">
            <span
              className={`participant-vote-fill ${done ? 'done' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="participant-vote-meta" data-testid={`participant-votes-${p.id}`}>
            {cast} / {required}
            {required === 0
              ? t('participants.noVotesYet')
              : done
                ? t('participants.done')
                : <span className="participant-vote-remaining">{t('participants.leftCount', { count: remaining })}</span>}
          </span>
        </div>
      </div>

      {canManage && (
        <div className="participant-actions">
          {!p.isHost && (
            <button
              className={`host-toggle-btn ${canAdd ? 'revoke' : 'promote'}`}
              onClick={() => onToggleStatementPermission(p.id, !canAdd)}
              title={canAdd ? t('participants.revokeAddTitle') : t('participants.allowAddTitle')}
              data-testid={`toggle-add-${p.id}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                {canAdd ? (
                  <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M5 12h14" />
                ) : (
                  <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 5v14M5 12h14" />
                )}
              </svg>
              <span>{canAdd ? t('participants.blockAdding') : t('participants.allowAdding')}</span>
            </button>
          )}

          {p.isHost && !p.isRecorder && (
            <button
              className="host-toggle-btn mic"
              onClick={() => onSetRecorder(p)}
              title={isYou ? t('participants.takeMicTitle') : t('participants.giveMicTitle')}
              data-testid={`give-mic-${p.id}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{isYou ? t('participants.takeMic') : t('participants.giveMic')}</span>
            </button>
          )}

          {!isYou && (
            <button
              className={`host-toggle-btn ${p.isHost ? 'revoke' : 'promote'}`}
              onClick={() => onToggleHost(p)}
              title={p.isHost ? t('participants.revokeHostTitle') : t('participants.makeHostTitle')}
              data-testid={`toggle-host-${p.id}`}
            >
              {p.isHost ? (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                  <span>{t('participants.revoke')}</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M4 18l3-9 5 5 5-8 3 12z" />
                  </svg>
                  <span>{t('participants.makeHost')}</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function ParticipantsPanel({ participants = [], currentId, canManageHosts = false, onToggleHost = () => {}, onSetRecorder = () => {}, onToggleStatementPermission = () => {} }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('name')

  const stats = useMemo(() => {
    const total = participants.length
    const completed = participants.filter(
      (p) => (p.votesRequired || 0) > 0 && (p.votesCast || 0) >= (p.votesRequired || 0),
    ).length
    const pending = participants.filter(
      (p) => (p.votesRequired || 0) > 0 && (p.votesCast || 0) < (p.votesRequired || 0),
    ).length
    return { total, completed, pending }
  }, [participants])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = participants
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q))
    if (filter !== 'all') {
      list = list.filter((p) => {
        const required = p.votesRequired || 0
        const done = required > 0 && (p.votesCast || 0) >= required
        return filter === 'done' ? done : !done
      })
    }
    const sorted = [...list]
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => {
        const ra = a.votesRequired || 0
        const rb = b.votesRequired || 0
        const pa = ra ? (a.votesCast || 0) / ra : 0
        const pb = rb ? (b.votesCast || 0) / rb : 0
        return pb - pa
      })
    }
    sorted.sort((a, b) => Number(b.isHost) - Number(a.isHost))
    return sorted
  }, [participants, query, filter, sort])

  return (
    <div className="participants-panel" data-testid="participants-panel">
      <div className="participants-summary">
        <div className="participants-stat">
          <span className="participants-stat-value">{stats.total}</span>
          <span className="participants-stat-label">{t('participants.summaryParticipants')}</span>
        </div>
        <div className="participants-stat">
          <span className="participants-stat-value done">{stats.completed}</span>
          <span className="participants-stat-label">{t('participants.summaryCompleted')}</span>
        </div>
        <div className="participants-stat">
          <span className="participants-stat-value pending">{stats.pending}</span>
          <span className="participants-stat-label">{t('participants.summaryNotDone')}</span>
        </div>
      </div>

      <div className="participants-toolbar">
        <div className="participants-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            className="participants-search-input"
            placeholder={t('participants.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('participants.searchAria')}
            data-testid="participants-search"
          />
          {query && (
            <button
              className="participants-search-clear"
              onClick={() => setQuery('')}
              aria-label={t('participants.clearSearch')}
              data-testid="participants-search-clear"
            >
              ×
            </button>
          )}
        </div>

        <div className="participants-sort">
          <label className="participants-sort-label" htmlFor="participants-sort-select">{t('participants.sort')}</label>
          <select
            id="participants-sort-select"
            className="participants-sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            data-testid="participants-sort"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{t(s.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="participants-filters" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`participants-filter ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
            data-testid={`participants-filter-${f.id}`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="participants-empty" data-testid="participants-empty">
          {participants.length === 0 ? t('participants.emptyNone') : t('participants.emptyFiltered')}
        </p>
      ) : (
        <ul className="participant-list" data-testid="participant-list">
          {visible.map((p) => (
            <ParticipantRow
              key={p.id}
              p={p}
              isYou={p.id === currentId}
              canManage={canManageHosts}
              onToggleHost={onToggleHost}
              onSetRecorder={onSetRecorder}
              onToggleStatementPermission={onToggleStatementPermission}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
