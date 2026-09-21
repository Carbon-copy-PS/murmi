import { selectGroupDifferences } from './group-differences'
import { groupStyle } from './group-colors'

export default function GroupDifferences({ groups, copy, language }) {
  const differences = selectGroupDifferences(groups)
  if (!differences.length) return null
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 })
  return <section className="opinion-differences" data-testid="group-differences">
    <h3>{copy.differencesTitle}</h3>
    <p className="opinion-differences-lead">{copy.differencesLead}</p>
    {differences.map(item => <article className="opinion-difference" key={item.id}>
      <header><h4>{item.text}</h4><span>{copy.differenceGap(Math.round(item.gap * 100))}</span></header>
      <div className="opinion-difference-groups">
        {item.rows.map(({ group, statement: s }) => <div className="opinion-difference-group opinion-group-color" style={groupStyle(group.id)} key={group.id}>
          <div className="opinion-difference-heading"><strong>{copy.group} {group.letter}</strong><span>{percent.format(s.agree / s.responded)} {copy.support}</span></div>
          <div className="opinion-difference-bar" aria-hidden="true">
            <span className="is-support" style={{ width: `${s.agree / s.responded * 100}%` }} />
            <span className="is-neutral" style={{ width: `${s.neutral / s.responded * 100}%` }} />
            <span className="is-oppose" style={{ width: `${s.disagree / s.responded * 100}%` }} />
          </div>
          <div className="opinion-difference-counts">
            <strong className="is-support">{s.agree}/{s.responded} {copy.support}</strong><span className="is-neutral">{s.neutral} {copy.neutral}</span><span className="is-oppose">{s.disagree} {copy.oppose}</span>
          </div>
          <small>{group.size - s.responded} {copy.missing}</small>
        </div>)}
      </div>
    </article>)}
  </section>
}
