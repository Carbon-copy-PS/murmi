import { useTranslation } from 'react-i18next'

export default function FlashCard({ statement, onVote, exiting }) {
  const { t } = useTranslation()
  if (!statement && !exiting) {
    return (
      <div className="flash-card-empty">
        {t('statements.allCaughtUp')}
      </div>
    )
  }

  if (!statement) return null

  return (
    <div className={`flash-card ${exiting ? 'exit' : 'enter'}`}>
      <p className="flash-card-text">{statement.text}</p>
      <div className="flash-card-actions">
        <button
          className="vote-btn disagree"
          onClick={() => onVote(statement.id, 'disagree')}
        >
          {t('common.disagree')}
        </button>
        <button
          className="vote-btn agree"
          onClick={() => onVote(statement.id, 'agree')}
        >
          {t('common.agree')}
        </button>
      </div>
    </div>
  )
}
