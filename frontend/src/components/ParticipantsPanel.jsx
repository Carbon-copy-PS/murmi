import { useMemo, useState } from 'react'
import { getLanguage, getLanguageLabel } from '../constants/languages'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Not done' },
  { id: 'done', label: 'Completed' },
]

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'progress', label: 'Progress' },
]

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

function ParticipantRow({ p, isYou, canManage, onToggleHost, onSetRecorder }) {
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
            {isYou && <span className="you-chip">You</span>}
            {p.isHost && <span className="host-badge inline" data-testid={`participant-host-${p.id}`}>Host</span>}
            {p.isRecorder && <span className="recorder-chip" title="Recording mic">Mic</span>}
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
              ? ' — no votes yet'
              : done
                ? ' · done'
                : <span className="participant-vote-remaining"> · {remaining} left</span>}
          </span>
        </div>
      </div>

      {canManage && (
        <div className="participant-actions">
          {p.isHost && !p.isRecorder && (
            <button
              className="host-toggle-btn mic"
              onClick={() => onSetRecorder(p)}
              title={isYou ? 'Take the mic' : 'Give the mic'}
              data-testid={`give-mic-${p.id}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>{isYou ? 'Take mic' : 'Give mic'}</span>
            </button>
          )}

          {!isYou && (
            <button
              className={`host-toggle-btn ${p.isHost ? 'revoke' : 'promote'}`}
              onClick={() => onToggleHost(p)}
              title={p.isHost ? 'Revoke host access' : 'Make host'}
              data-testid={`toggle-host-${p.id}`}
            >
              {p.isHost ? (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                  <span>Revoke</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M4 18l3-9 5 5 5-8 3 12z" />
                  </svg>
                  <span>Make host</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export default function ParticipantsPanel({ participants = [], currentId, canManageHosts = false, onToggleHost = () => {}, onSetRecorder = () => {} }) {
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
          <span className="participants-stat-label">Participants</span>
        </div>
        <div className="participants-stat">
          <span className="participants-stat-value done">{stats.completed}</span>
          <span className="participants-stat-label">Completed</span>
        </div>
        <div className="participants-stat">
          <span className="participants-stat-value pending">{stats.pending}</span>
          <span className="participants-stat-label">Not done</span>
        </div>
      </div>

      <div className="participants-toolbar">
        <div className="participants-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className="participants-search-input"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search participants"
            data-testid="participants-search"
          />
          {query && (
            <button
              className="participants-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              data-testid="participants-search-clear"
            >
              ×
            </button>
          )}
        </div>

        <div className="participants-sort">
          <label className="participants-sort-label" htmlFor="participants-sort-select">Sort</label>
          <select
            id="participants-sort-select"
            className="participants-sort-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            data-testid="participants-sort"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
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
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="participants-empty" data-testid="participants-empty">
          {participants.length === 0 ? 'No participants yet.' : 'No participants match your filters.'}
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
            />
          ))}
        </ul>
      )}
    </div>
  )
}
