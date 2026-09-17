import { getOpinionCopy } from './copy'
import './opinion-groups.css'
import OpinionMap, { GROUP_COLORS } from './OpinionMap'

const COLORS = GROUP_COLORS

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

export default function OpinionGroups({ landscape, points, language = 'en' }) {
  const copy = getOpinionCopy(language)
  if (!landscape?.available) return null
  const provisional = landscape.status === 'provisional'
  const check = landscape.projectionCheck
  const variance = Math.min(1, (landscape.explainedVariance || []).reduce((sum, value) => sum + value, 0))
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(variance)
  return <section className="opinion-groups" data-testid="shared-opinion-groups" data-source-hash={landscape.sourceHash}>
    <p className={`opinion-status ${provisional ? 'provisional' : ''}`}>
      <strong>{provisional ? copy.provisional : copy.supported}</strong>
      <span>{provisional ? copy.provisionalNote : copy.lead}</span>
    </p>
    <OpinionMap groups={landscape.groups} points={points} copy={copy} />
    <div className="opinion-projection-check">
      <p>{copy.variance}: <strong>{percent}</strong></p>
      {check && <p>{check.dimensionsCompared > 2
        ? `${check.changed ? copy.changed : copy.unchanged} ${copy.dimensions}: 2 → ${check.dimensionsCompared}.`
        : copy.twoOnly}</p>}
    </div>
    <p className="opinion-projection-check">{copy.countNote}</p>
    <div className="opinion-group-cards">
      {landscape.groups.map((group) => {
        const evidence = group.statements.filter((statement) => statement.responded > 0)
        return <article key={group.id} style={{ borderTopColor: COLORS[group.id % COLORS.length] }}>
          <h4>{copy.group} {group.letter} <span>{group.size} {copy.people}</span></h4>
          <ul>{evidence.slice(0, 3).map((statement) => <VoteEvidence key={statement.id} statement={statement} copy={copy} />)}</ul>
          {evidence.length > 3 && <details><summary>{copy.all}</summary>
            <ul>{evidence.slice(3).map((statement) => <VoteEvidence key={statement.id} statement={statement} copy={copy} />)}</ul>
          </details>}
        </article>
      })}
    </div>
  </section>
}
