export default function ResultsPanel({ statements }) {
  const voted = statements.filter((s) => s.hasVoted).length

  return (
    <div className="results-panel">
      <div className="results-placeholder">
        <svg viewBox="0 0 200 140" className="results-svg">
          <ellipse cx="60" cy="65" rx="45" ry="35" fill="none" stroke="#2a9d4e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          <ellipse cx="145" cy="75" rx="40" ry="30" fill="none" stroke="#e00" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
          <circle cx="45" cy="55" r="4" fill="#2a9d4e" opacity="0.7" />
          <circle cx="55" cy="75" r="4" fill="#2a9d4e" opacity="0.6" />
          <circle cx="70" cy="60" r="4" fill="#2a9d4e" opacity="0.8" />
          <circle cx="50" cy="68" r="4" fill="#2a9d4e" opacity="0.5" />
          <circle cx="75" cy="72" r="4" fill="#2a9d4e" opacity="0.7" />
          <circle cx="62" cy="50" r="4" fill="#2a9d4e" opacity="0.6" />
          <circle cx="135" cy="68" r="4" fill="#e00" opacity="0.7" />
          <circle cx="150" cy="80" r="4" fill="#e00" opacity="0.6" />
          <circle cx="155" cy="65" r="4" fill="#e00" opacity="0.8" />
          <circle cx="140" cy="85" r="4" fill="#e00" opacity="0.5" />
          <circle cx="100" cy="70" r="4" fill="#999" opacity="0.4" />
          <circle cx="108" cy="60" r="4" fill="#999" opacity="0.4" />
        </svg>
        <h3>Opinion Clusters</h3>
        <p className="results-description">
          Polis-style opinion clustering will appear here after the debate concludes.
        </p>
        <p className="results-stats">
          {statements.length} statement{statements.length !== 1 ? 's' : ''} extracted
          {voted > 0 && <> &middot; {voted} voted on</>}
        </p>
      </div>
    </div>
  )
}
