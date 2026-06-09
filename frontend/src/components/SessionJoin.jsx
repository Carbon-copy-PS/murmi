import { useState, useEffect } from 'react'
import { getSavedName, saveName } from '../identity'
import ThemeToggle from './ThemeToggle'

const LANGUAGES = (
  <>
    <option value="auto">Auto language</option>
    <option value="en">English</option>
    <option value="de">Deutsch / Schwiizerdutsch</option>
    <option value="fr">Français</option>
  </>
)

const Req = () => <span className="req" aria-hidden="true">*</span>

function LogoMark({ className = 'ls-logo-mark' }) {
  return (
    <svg viewBox="0 0 512 512" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="none" strokeLinecap="round">
        <g stroke="#12b76a">
          <path d="M201 351.26 A 110 110 0 0 1 201 160.74" strokeWidth="30" />
          <path d="M173.5 398.9 A 165 165 0 0 1 173.5 113.1" strokeWidth="30" strokeOpacity="0.5" />
        </g>
        <g stroke="#f04438">
          <path d="M311 160.74 A 110 110 0 0 1 311 351.26" strokeWidth="30" />
          <path d="M338.5 113.1 A 165 165 0 0 1 338.5 398.9" strokeWidth="30" strokeOpacity="0.5" />
        </g>
      </g>
      <circle cx="256" cy="256" r="46" fill="#ffffff" />
    </svg>
  )
}

const STEPS = [
  {
    num: '01',
    icon: '🎙️',
    title: 'Host opens one mic',
    text: 'One person starts a session and shares a 6-character code. Only the host streams audio, so captions stay clean and continuous.',
  },
  {
    num: '02',
    icon: '✨',
    title: 'AI extracts the claims',
    text: 'As people speak, the room is transcribed and distilled into short, neutral statements you can actually react to.',
  },
  {
    num: '03',
    icon: '👆',
    title: 'Everyone votes',
    text: 'Swipe to agree, disagree, or pass. Votes are anonymous and update live as the debate rolls on.',
  },
  {
    num: '04',
    icon: '🧭',
    title: 'See where the room stands',
    text: 'Opinion clusters, diverging bars, and an AI common-ground statement turn noise into a shared picture.',
  },
]

const FEATURES = [
  {
    icon: '🎧',
    title: 'Live captions',
    text: 'Realtime transcription with a final accuracy pass so the record reads cleanly, not just quickly.',
  },
  {
    icon: '🤖',
    title: 'AI claim extraction',
    text: 'Completed speaker turns become crisp, votable statements — no manual note-taking.',
  },
  {
    icon: '🔒',
    title: 'Anonymous voting',
    text: 'Individual votes are never tied to a name. Results only ever show as group patterns.',
  },
  {
    icon: '🌍',
    title: 'Multilingual',
    text: 'English, German / Swiss German, French, or auto-detect — per participant.',
  },
  {
    icon: '🤝',
    title: 'AI common ground',
    text: 'A mediator that drafts a shared statement bridging opposing clusters, inspired by Pol.is and the Habermas Machine.',
  },
  {
    icon: '📊',
    title: 'Opinion clusters',
    text: 'A live map groups people by how they vote, so you can see the real shape of the disagreement.',
  },
]

const HERO_CLAIMS = [
  {
    topic: 'Education & peace',
    claim: 'Every child deserves twelve years of free, quality education.',
    source: 'Malala Yousafzai · Peace 2014',
    voteType: 'likert',
    exitVote: 'strongly_agree',
    voted: 3,
    total: 5,
  },
  {
    topic: 'Science & society',
    claim: 'Scientific knowledge should serve humanity, not private profit alone.',
    source: 'Marie Curie · Physics & Chemistry',
    voteType: 'binary',
    exitVote: 'agree',
    voted: 2,
    total: 5,
  },
  {
    topic: 'Climate action',
    claim: 'Human-caused climate change requires immediate global action.',
    source: 'IPCC · Peace 2007',
    voteType: 'binary',
    exitVote: 'disagree',
    voted: 4,
    total: 5,
  },
  {
    topic: 'Development',
    claim: 'Progress should be measured by freedom and capability, not GDP alone.',
    source: 'Amartya Sen · Economics 1998',
    voteType: 'likert',
    exitVote: 'agree',
    voted: 1,
    total: 5,
  },
  {
    topic: 'Poverty & finance',
    claim: 'Microcredit can be a sustainable path out of poverty.',
    source: 'Muhammad Yunus · Peace 2006',
    voteType: 'likert',
    exitVote: 'strongly_disagree',
    voted: 2,
    total: 5,
  },
  {
    topic: 'Peace & justice',
    claim: 'Forgiveness is essential for healing societies after conflict.',
    source: 'Desmond Tutu · Peace 1984',
    voteType: 'binary',
    exitVote: 'agree',
    voted: 3,
    total: 5,
  },
  {
    topic: 'Civilization',
    claim: 'Nationalism is among the greatest threats to human civilization.',
    source: 'Albert Einstein · Physics 1921',
    voteType: 'likert',
    exitVote: 'strongly_agree',
    voted: 4,
    total: 5,
  },
  {
    topic: 'Environment & democracy',
    claim: 'Environmental restoration and democracy are inseparable.',
    source: 'Wangari Maathai · Peace 2004',
    voteType: 'binary',
    exitVote: 'disagree',
    voted: 5,
    total: 5,
  },
]

const STAMP_LABEL = {
  agree: 'Agree',
  disagree: 'Disagree',
  strongly_agree: 'Strongly agree',
  strongly_disagree: 'Strongly disagree',
}

function PhoneDeck() {
  const [idx, setIdx] = useState(0)
  const [anim, setAnim] = useState('idle')

  useEffect(() => {
    let swapTimer
    const cycle = setInterval(() => {
      setAnim('out')
      swapTimer = setTimeout(() => {
        setIdx((i) => (i + 1) % HERO_CLAIMS.length)
        setAnim('in')
        setTimeout(() => setAnim('idle'), 420)
      }, 480)
    }, 4200)
    return () => {
      clearInterval(cycle)
      clearTimeout(swapTimer)
    }
  }, [])

  const item = HERO_CLAIMS[idx]
  const isLikert = item.voteType === 'likert'
  const progress = Math.round((item.voted / item.total) * 100)
  const exitCls = item.exitVote.replace(/_/g, '-')
  const showStamp = anim === 'out'

  return (
    <div className="phone" data-testid="mock-phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="mock-room-top">
          <span className="mock-topic" key={`topic-${idx}`}>{item.topic}</span>
        </div>
        <div className="mock-progress">
          <span style={{ width: `${progress}%` }} className="mock-progress-fill" />
        </div>
        <span className="mock-counter">{item.voted} of {item.total} voted</span>
        <div className="mock-deck">
          <div className="mock-card behind-2" />
          <div className="mock-card behind-1" />
          <div
            key={idx}
            className={`mock-card top ${isLikert ? 'likert' : ''} anim-${anim} exit-${exitCls}`}
            data-testid="mock-card"
          >
            <span className="mock-tag">Claim</span>
            <p className="mock-card-text">{item.claim}</p>
            <span className="mock-source">{item.source}</span>
            {showStamp && (
              <span className={`mock-stamp ${exitCls}`}>{STAMP_LABEL[item.exitVote]}</span>
            )}
          </div>
        </div>
        <div className={`mock-controls ${isLikert ? 'likert' : ''}`} data-testid="mock-controls">
          {isLikert ? (
            <>
              <span className="mock-circle disagree strong" aria-hidden="true">⇤</span>
              <span className="mock-circle disagree" aria-hidden="true">✕</span>
              <span className="mock-circle pass" aria-hidden="true">↓</span>
              <span className="mock-circle agree" aria-hidden="true">✓</span>
              <span className="mock-circle agree strong" aria-hidden="true">⇥</span>
            </>
          ) : (
            <>
              <span className="mock-circle disagree" aria-hidden="true">✕</span>
              <span className="mock-circle pass" aria-hidden="true">↓</span>
              <span className="mock-circle agree" aria-hidden="true">✓</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultsShot() {
  const bars = [
    { label: 'Free transit cuts emissions', agree: 72, disagree: 28 },
    { label: 'Funding should come from fuel tax', agree: 41, disagree: 59 },
    { label: 'Rural areas would be underserved', agree: 55, disagree: 45 },
  ]
  return (
    <div className="shot" data-testid="mock-results">
      <span className="shot-title">Where the room stands</span>
      <div className="shot-bars">
        {bars.map((b) => (
          <div className="shot-bar-row" key={b.label}>
            <span className="shot-bar-label">{b.label}</span>
            <div className="shot-bar-track">
              <span className="shot-bar-d" style={{ width: `${b.disagree / 2}%` }} />
              <span className="shot-bar-a" style={{ width: `${b.agree / 2}%` }} />
              <span className="shot-bar-mid" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClusterShot() {
  const dots = [
    { x: 30, y: 38, c: '#12b76a' }, { x: 38, y: 30, c: '#12b76a' }, { x: 26, y: 50, c: '#12b76a' },
    { x: 44, y: 44, c: '#12b76a' }, { x: 72, y: 60, c: '#f04438' }, { x: 80, y: 52, c: '#f04438' },
    { x: 68, y: 72, c: '#f04438' }, { x: 56, y: 24, c: '#e0a400' }, { x: 62, y: 34, c: '#e0a400' },
  ]
  return (
    <div className="shot" data-testid="mock-clusters">
      <span className="shot-title">Opinion clusters</span>
      <svg viewBox="0 0 100 90" className="shot-scatter" aria-hidden="true">
        <ellipse cx="34" cy="41" rx="18" ry="16" fill="rgba(18,183,106,0.12)" />
        <ellipse cx="73" cy="62" rx="16" ry="14" fill="rgba(240,68,56,0.12)" />
        <ellipse cx="59" cy="29" rx="11" ry="9" fill="rgba(224,164,0,0.12)" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="3.2" fill={d.c} />
        ))}
        <circle cx="44" cy="44" r="4.2" fill="none" stroke="var(--ds-text)" strokeWidth="1.4" />
        <text x="44" y="55" textAnchor="middle" className="shot-you">You</text>
      </svg>
    </div>
  )
}

function CaptionsShot() {
  return (
    <div className="shot" data-testid="mock-captions">
      <span className="shot-title"><span className="shot-live">● Live</span> captions</span>
      <div className="shot-lines">
        <p><strong>Alex</strong> I think the bigger issue is funding, not demand.</p>
        <p><strong>Mara</strong> But demand spikes when it's free — that's the point.</p>
        <p className="shot-partial"><strong>Jon</strong> well, if we look at Zurich's model…</p>
      </div>
      <span className="shot-chip">✨ Extracting claims…</span>
    </div>
  )
}

export default function SessionJoin({ onJoin }) {
  const [mode, setMode] = useState(null)
  const [name, setName] = useState(getSavedName)
  const [language, setLanguage] = useState('auto')
  const [topic, setTopic] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('code')
    if (shared) {
      setCode(shared.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
      setMode('join')
    }
  }, [])

  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))

  const validateName = () => {
    const value = name.trim()
    if (!value) return 'Please enter your name'
    if (value.length < 2) return 'Name is too short'
    return ''
  }

  const validateCode = () => {
    const value = code.trim()
    if (!value) return 'Enter the session code'
    if (value.length !== 6) return 'Code must be 6 characters'
    return ''
  }

  const joinPayload = (sessionId, wantsHost = false) => {
    saveName(name.trim())
    return {
      sessionId,
      userName: name.trim(),
      userLanguage: language === 'auto' ? null : language,
      wantsHost,
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setErrors({})
  }

  const closeModal = () => switchMode(null)

  async function handleCreate() {
    const nameError = validateName()
    if (nameError) return setErrors({ name: nameError })
    setErrors({})
    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || null }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      onJoin(joinPayload(data.sessionId, true))
    } catch {
      setErrors({ form: 'Could not create session. Try again.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    const nextErrors = {}
    const codeError = validateCode()
    const nameError = validateName()
    if (codeError) nextErrors.code = codeError
    if (nameError) nextErrors.name = nameError
    if (Object.keys(nextErrors).length) return setErrors(nextErrors)
    setErrors({})
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${code.trim().toUpperCase()}`)
      if (!res.ok) return setErrors({ code: 'No session found with that code' })
      onJoin(joinPayload(code.trim().toUpperCase(), false))
    } catch {
      setErrors({ form: 'Could not reach the server. Try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ls" data-testid="landing">
      <nav className="ls-nav">
        <a className="ls-brand" href="#top">
          <span className="ls-brand-logo"><LogoMark /></span>
          <span className="ls-brand-name">Debate Sense</span>
        </a>
        <div className="ls-nav-actions">
          <a className="ls-nav-link" href="#how">How it works</a>
          <a className="ls-nav-link" href="#features">Features</a>
          <ThemeToggle />
          <button type="button" className="ls-btn ghost" onClick={() => switchMode('join')} data-testid="nav-join">
            Join
          </button>
          <button type="button" className="ls-btn solid" onClick={() => switchMode('create')} data-testid="nav-host">
            Host a debate
          </button>
        </div>
      </nav>

      <header className="ls-hero" id="top">
        <div className="ls-hero-copy">
          <span className="ls-eyebrow">Collaborative sense-making for live debates</span>
          <h1 className="ls-h1">
            Hear the room. <span className="ls-grad">See what it thinks.</span>
          </h1>
          <p className="ls-lead">
            Debate Sense listens to your discussion, turns it into clear claims with AI,
            and lets everyone vote anonymously — so a messy conversation becomes a shared,
            real-time picture of where people actually stand.
          </p>
          <div className="ls-cta-row">
            <button type="button" className="ls-btn solid lg" onClick={() => switchMode('create')} data-testid="hero-host">
              Host a debate
            </button>
            <button type="button" className="ls-btn ghost lg" onClick={() => switchMode('join')} data-testid="hero-join">
              I have a code →
            </button>
          </div>
          <ul className="ls-trust">
            <li>🔒 Anonymous votes</li>
            <li>⚡ Realtime captions</li>
            <li>🌍 4 languages</li>
          </ul>
        </div>
        <div className="ls-hero-visual">
          <div className="ls-glow" aria-hidden="true" />
          <PhoneDeck />
        </div>
      </header>

      <section className="ls-section" id="how">
        <div className="ls-section-head">
          <span className="ls-kicker">How it works</span>
          <h2 className="ls-h2">From spoken words to group consensus in four steps</h2>
        </div>
        <div className="ls-steps">
          {STEPS.map((s) => (
            <article className="ls-step" key={s.num}>
              <div className="ls-step-top">
                <span className="ls-step-icon" aria-hidden="true">{s.icon}</span>
                <span className="ls-step-num">{s.num}</span>
              </div>
              <h3 className="ls-step-title">{s.title}</h3>
              <p className="ls-step-text">{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ls-section ls-showcase">
        <div className="ls-section-head">
          <span className="ls-kicker">See it in action</span>
          <h2 className="ls-h2">Captions, votes, and consensus — all in one screen</h2>
        </div>
        <div className="ls-shots">
          <CaptionsShot />
          <ResultsShot />
          <ClusterShot />
        </div>
      </section>

      <section className="ls-section" id="features">
        <div className="ls-section-head">
          <span className="ls-kicker">Features</span>
          <h2 className="ls-h2">Everything you need to make a debate make sense</h2>
        </div>
        <div className="ls-features">
          {FEATURES.map((f) => (
            <article className="ls-feature" key={f.title}>
              <span className="ls-feature-icon" aria-hidden="true">{f.icon}</span>
              <h3 className="ls-feature-title">{f.title}</h3>
              <p className="ls-feature-text">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ls-final">
        <div className="ls-final-inner">
          <h2 className="ls-h2">Ready to find out what the room really thinks?</h2>
          <p className="ls-lead">Spin up a session in seconds. No sign-up, no setup.</p>
          <div className="ls-cta-row center">
            <button type="button" className="ls-btn solid lg" onClick={() => switchMode('create')} data-testid="final-host">
              Host a debate
            </button>
            <button type="button" className="ls-btn ghost lg" onClick={() => switchMode('join')} data-testid="final-join">
              Join with a code
            </button>
          </div>
        </div>
      </section>

      <footer className="ls-footer">
        <div className="ls-brand">
          <span className="ls-brand-logo"><LogoMark /></span>
          <span className="ls-brand-name">Debate Sense</span>
        </div>
        <span className="ls-foot-note">Collaborative sense-making in live debates.</span>
      </footer>

      {mode && (
        <div className="modal-backdrop" onClick={closeModal} data-testid="auth-modal">
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="modal-close" onClick={closeModal} aria-label="Close" data-testid="modal-close">×</button>

            {mode === 'create' && (
              <form
                className="auth-form"
                data-testid="create-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate()
                }}
              >
                <h2 className="form-heading">Host a debate</h2>

                <label className="field">
                  <span className="field-label">Your name <Req /></span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError('name') }}
                    placeholder="e.g. Alex"
                    autoFocus
                    aria-invalid={!!errors.name}
                    className={errors.name ? 'invalid' : ''}
                    data-testid="host-name"
                  />
                  {errors.name && <span className="field-error" data-testid="error-name">{errors.name}</span>}
                </label>

                <label className="field">
                  <span className="field-label">Topic <span className="field-optional">(optional)</span></span>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="What are you debating?"
                    data-testid="host-topic"
                  />
                </label>

                <label className="field">
                  <span className="field-label">Spoken language</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="host-language">
                    {LANGUAGES}
                  </select>
                </label>

                <button type="submit" className="btn primary" disabled={loading} data-testid="create-submit">
                  {loading ? 'Creating…' : 'Create session'}
                </button>

                {errors.form && <p className="error" data-testid="form-error">{errors.form}</p>}
              </form>
            )}

            {mode === 'join' && (
              <form
                className="auth-form"
                data-testid="join-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault()
                  handleJoin()
                }}
              >
                <h2 className="form-heading">Join a debate</h2>

                <label className="field">
                  <span className="field-label">Session code <Req /></span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      clearError('code')
                    }}
                    placeholder="ABC123"
                    maxLength={6}
                    autoFocus
                    aria-invalid={!!errors.code}
                    className={`code-input ${errors.code ? 'invalid' : ''}`}
                    data-testid="join-code"
                  />
                  {errors.code && <span className="field-error" data-testid="error-code">{errors.code}</span>}
                </label>

                <label className="field">
                  <span className="field-label">Your name <Req /></span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError('name') }}
                    placeholder="e.g. Alex"
                    aria-invalid={!!errors.name}
                    className={errors.name ? 'invalid' : ''}
                    data-testid="join-name"
                  />
                  {errors.name && <span className="field-error" data-testid="error-name">{errors.name}</span>}
                </label>

                <label className="field">
                  <span className="field-label">Spoken language</span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} data-testid="join-language">
                    {LANGUAGES}
                  </select>
                </label>

                <button type="submit" className="btn primary" disabled={loading} data-testid="join-submit">
                  {loading ? 'Joining…' : 'Join session'}
                </button>

                {errors.form && <p className="error" data-testid="form-error">{errors.form}</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
