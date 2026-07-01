import { useTranslation } from 'react-i18next'

export function StatementTags({ statement }) {
  const { t } = useTranslation()
  if (!statement?.edited && !statement?.tension && !statement?.custom) return null
  return (
    <div className="statement-tags">
      {statement.edited && <span className="card-tag edited">{t('tags.edited')}</span>}
      {statement.tension && <span className="card-tag tension">{t('tags.tension')}</span>}
      {statement.custom && !statement.tension && <span className="card-tag">{t('tags.custom')}</span>}
    </div>
  )
}

function formatAddedRelative(ts, t) {
  if (!ts) return ''
  const mins = Math.floor(Math.max(0, Date.now() - ts * 1000) / 60000)
  if (mins < 1) return t('time.justNow')
  if (mins < 60) return t('time.minutesAgo', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('time.hoursAgo', { count: hours })
  return t('time.daysAgo', { count: Math.floor(hours / 24) })
}

export function StatementByline({ statement }) {
  const { t } = useTranslation()
  if (!statement?.author) return null
  return (
    <div className="statement-byline" data-testid={`statement-byline-${statement.id}`}>
      <span className="statement-byline-avatar" aria-hidden="true">
        {statement.author.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="statement-byline-text">
        {t('tags.addedBy')} <strong>{statement.author}</strong>
        {statement.createdAt && (
          <span className="statement-byline-meta"> · {formatAddedRelative(statement.createdAt, t)}</span>
        )}
      </span>
    </div>
  )
}

export function isAiStatement(statement) {
  return statement && !statement.custom && !statement.tension
}
