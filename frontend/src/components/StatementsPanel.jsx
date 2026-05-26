import { useState, useCallback } from 'react'
import FlashCard from './FlashCard'
import DivergingBarChart from './DivergingBarChart'

export default function StatementsPanel({ statements, onVote }) {
  const [exitingCard, setExitingCard] = useState(false)
  const [justVotedId, setJustVotedId] = useState(null)
  const [localVoted, setLocalVoted] = useState(new Set())

  const unvoted = statements.filter((s) => !s.hasVoted && !localVoted.has(s.id))
  const voted = statements.filter((s) => s.hasVoted || localVoted.has(s.id))
  const currentCard = exitingCard ? null : unvoted[0] || null

  const handleCardVote = useCallback((statementId, vote) => {
    setExitingCard(true)
    setLocalVoted((prev) => new Set(prev).add(statementId))
    onVote(statementId, vote)
    setJustVotedId(statementId)

    setTimeout(() => {
      setExitingCard(false)
    }, 300)
  }, [onVote])

  if (statements.length === 0) {
    return <div className="flash-card-empty">Statements will appear as the debate progresses</div>
  }

  return (
    <div className="statements-panel">
      <FlashCard
        statement={exitingCard ? unvoted[0] : currentCard}
        onVote={handleCardVote}
        exiting={exitingCard}
      />

      {voted.length > 0 && (
        <>
          <div className="section-divider"><span>Your votes</span></div>
          <DivergingBarChart
            statements={voted}
            justVotedId={justVotedId}
            onAnimationDone={() => setJustVotedId(null)}
          />
        </>
      )}
    </div>
  )
}
