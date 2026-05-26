export default function FlashCard({ statement, onVote, exiting }) {
  if (!statement && !exiting) {
    return (
      <div className="flash-card-empty">
        All caught up — waiting for more statements
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
          Disagree
        </button>
        <button
          className="vote-btn agree"
          onClick={() => onVote(statement.id, 'agree')}
        >
          Agree
        </button>
      </div>
    </div>
  )
}
