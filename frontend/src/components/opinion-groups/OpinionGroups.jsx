import { useId } from 'react'
import { getOpinionCopy } from './copy'
import './opinion-groups.css'
import OpinionMap from './OpinionMap'
import { groupStyle } from './group-colors'

function VoteEvidence({ statement, copy }) {
  return <li>
    <p>{statement.text}</p>
    <div className="opinion-vote-counts">
      <strong>{statement.agree}/{statement.responded} {copy.support}</strong>
      <span>{statement.neutral} {copy.neutral}</span>
      <span>{statement.disagree} {copy.oppose}</span>
      <span>{statement.missing} {copy.missing}</span>
    </div>
  </li>
}

export default function OpinionGroups({ landscape, points, language = 'en', onRefreshThemes }) {
  const copy = getOpinionCopy(language)
  const id = useId()
  if (!landscape?.available) return null
  const groups = landscape.groups.map(group => ({...group, theme: group.theme?.sourceHash === landscape.sourceHash ||
    (group.theme?.retained === true && group.theme?.matchedSourceHash === landscape.sourceHash) ? group.theme : null}))
  const themes = landscape.themes?.sourceHash === landscape.sourceHash ? landscape.themes : null
  // New reports store only anonymous geometry. Keys are local rendering indexes,
  // never participant IDs or links to individual ballots.
  const mapPoints = points ?? (groups.every(group => Array.isArray(group.dots))
    ? groups.flatMap(group => group.dots.map((dot, index) => ({...dot, cluster: group.id, key: `snapshot-${group.id}-${index}`})))
    : undefined)
  const provisional = landscape.status === 'provisional'
  const check = landscape.projectionCheck
  const variance = Math.min(1, (landscape.explainedVariance || []).reduce((sum, value) => sum + value, 0))
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(variance)
  return <section className="opinion-groups" data-testid="shared-opinion-groups" data-source-hash={landscape.sourceHash}>
    <p className={`opinion-status ${provisional ? 'provisional' : ''}`}>
      <strong>{provisional ? copy.provisional : copy.supported}</strong>
      <span>{provisional ? copy.provisionalNote : copy.lead}</span>
    </p>
    <OpinionMap groups={groups} points={mapPoints} copy={copy} onSelectGroup={groupId => {
      const card = document.getElementById(`${id}-group-${groupId}`)
      card?.focus({preventScroll:true});card?.scrollIntoView({block:'nearest', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})
    }} />
    <div className="opinion-theme-status">
      <span>{themes?.retained ? (themes.status === 'unavailable' ? copy.themesRetainedUnavailable : copy.themesRetained) : themes?.status === 'pending' ? copy.themesPending : themes?.status === 'unavailable' ? copy.themesUnavailable : themes?.generatedAt ? copy.themesNote : copy.themeEmergingNote}
        {themes?.generatedAt && <> · {copy.updated} {new Intl.DateTimeFormat(language, {hour:'2-digit',minute:'2-digit'}).format(new Date(themes.generatedAt * 1000))}</>}
      </span>
      {onRefreshThemes && <button type="button" onClick={onRefreshThemes}>{copy.refreshThemes}</button>}
    </div>
    <div className="opinion-projection-check">
      <p>{copy.variance}: <strong>{percent}</strong></p>
      {check && <p>{check.dimensionsCompared > 2
        ? `${check.changed ? copy.changed : copy.unchanged} ${copy.dimensions}: 2 → ${check.dimensionsCompared}.`
        : copy.twoOnly}</p>}
    </div>
    <p className="opinion-projection-check">{copy.countNote}</p>
    {themes?.shared && <aside className="opinion-shared-theme">
      <strong>{copy.sharedAcrossGroups} · {themes.shared.title}</strong>
      <p>{themes.shared.description}</p>
      <details><summary>{copy.viewEvidence}</summary><ul>{themes.shared.evidenceStatementIds.map(sid => {
        const statement = groups[0]?.statements.find(s=>s.id===sid)
        return statement && <li key={sid}>{statement.text}<p>{groups.map(g=>{
          const s=g.statements.find(item=>item.id===sid)
          return `${copy.group} ${g.letter}: ${s.agree}/${s.responded} ${copy.support}, ${s.missing} ${copy.missing}`
        }).join(' · ')}</p></li>
      })}</ul></details>
    </aside>}
    <div className="opinion-group-cards">
      {groups.map((group) => {
        const refs = group.theme?.evidenceStatementIds || []
        const limit = refs.length || 3
        const evidence = group.statements.filter(s => s.responded > 0).sort((a,b) => Number(refs.includes(b.id))-Number(refs.includes(a.id)))
        return <article key={group.id} id={`${id}-group-${group.id}`} tabIndex="-1" className="opinion-group-color" style={groupStyle(group.id)}>
          <h4><strong className="opinion-group-name"><i aria-hidden="true" />{copy.group} {group.letter}</strong> <span>{group.size} {copy.people}</span></h4>
          <div className="opinion-group-theme"><strong>{group.theme?.title || copy.themeEmerging}</strong>
            <p>{group.theme?.description || (themes?.status === 'unavailable' ? copy.themesUnavailable : themes?.status === 'pending' ? copy.themesPending : copy.themeEmergingNote)}</p>
            {group.theme && <small>{copy.supportingVotes}</small>}
          </div>
          <ul>{evidence.slice(0, limit).map((statement) => <VoteEvidence key={statement.id} statement={statement} copy={copy} />)}</ul>
          {evidence.length > limit && <details><summary>{copy.all}</summary>
            <ul>{evidence.slice(limit).map((statement) => <VoteEvidence key={statement.id} statement={statement} copy={copy} />)}</ul>
          </details>}
        </article>
      })}
    </div>
  </section>
}
