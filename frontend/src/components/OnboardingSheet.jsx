const STEPS = [
  {
    icon: '🎙️',
    title: 'Listen & follow along',
    text: 'The room speaks out loud. AI turns the live discussion into short, neutral statements you can react to.',
  },
  {
    icon: '👆',
    title: 'Vote your view',
    text: 'Swipe right to agree, left to disagree, or down to pass. You can also tap the buttons or use arrow keys. Changed your mind? Edit any vote later.',
  },
  {
    icon: '🔒',
    title: 'Anonymous by design',
    text: 'Your individual votes are never shown next to your name. Results only ever appear as group patterns.',
  },
]

export default function OnboardingSheet({ onDismiss }) {
  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Debate Sense" data-testid="onboarding-sheet">
      <div className="onboarding-sheet">
        <div className="onboarding-head">
          <span className="onboarding-kicker">Welcome to</span>
          <h2 className="onboarding-title">Debate Sense</h2>
          <p className="onboarding-sub">Here's how this works in 10 seconds.</p>
        </div>

        <ul className="onboarding-steps">
          {STEPS.map((step) => (
            <li key={step.title} className="onboarding-step">
              <span className="onboarding-step-icon" aria-hidden="true">{step.icon}</span>
              <div className="onboarding-step-body">
                <span className="onboarding-step-title">{step.title}</span>
                <p className="onboarding-step-text">{step.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="btn primary onboarding-cta"
          onClick={onDismiss}
          data-testid="onboarding-dismiss"
        >
          Got it — let's go
        </button>
      </div>
    </div>
  )
}
