import { useState, useEffect } from 'react'
import { APP_NAME } from '../constants/app'
import { LANGUAGE_SHOWCASE } from '../constants/languages'
import { getSavedName, saveName } from '../identity'
import LanguageSelect from './language-select'
import ProductScreensCarousel from './product-screens-carousel'

function MurmiMark({ className = 'ls-brand-mark' }) {
  return (
    <img
      className={className}
      src="/favicon.svg"
      alt=""
      width={32}
      height={32}
      decoding="async"
    />
  )
}

function scrollToSection(event, id) {
  event.preventDefault()
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  if (window.history?.replaceState) {
    window.history.replaceState(null, '', `#${id}`)
  }
}

function LanguageShowcase() {
  return (
    <section className="ls-lang-showcase" data-testid="language-showcase">
      <div className="ls-lang-showcase-head">
        <span className="ls-kicker">Languages</span>
        <h2 className="ls-h2">Built for Europe — and beyond</h2>
        <p className="ls-lead compact">
          Every EU official language, plus Chinese. Participants choose their spoken language; the conversation stays with them.
        </p>
      </div>
      <div className="ls-lang-grid">
        {LANGUAGE_SHOWCASE.map((lang) => (
          <span key={lang.code} className="ls-lang-chip" title={lang.label} data-testid={`lang-chip-${lang.code}`}>
            <span className="ls-lang-flag" aria-hidden="true">{lang.flag}</span>
            <span className="ls-lang-name">{lang.native}</span>
          </span>
        ))}
      </div>
    </section>
  )
}

const Req = () => <span className="req" aria-hidden="true">*</span>

function HostChevron() {
  return (
    <span className="ls-btn-chevron" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

const STEPS = [
  {
    num: '01',
    title: 'Host a session',
    text: 'Start in seconds, share a code, and invite the group — no sign-up, no setup.',
  },
  {
    num: '02',
    title: 'Speak & participate',
    text: 'As people contribute, Murmi turns the discussion into clear claims everyone can engage with.',
  },
  {
    num: '03',
    title: 'Vote together',
    text: 'Everyone can react to claims anonymously, in real time — so quieter voices count too.',
  },
  {
    num: '04',
    title: 'Decide with clarity',
    text: 'From messy talk to shared understanding — structure better conversations and move toward decisions.',
  },
]

const FEATURES = [
  {
    icon: '◎',
    title: 'Focus the discussion',
    text: 'Keeps the group on claims that matter, so workshops and meetings move toward decisions instead of drift.',
  },
  {
    icon: '◇',
    title: 'Include overlooked voices',
    text: 'Brings quieter themes and perspectives into the decision, so the whole group can weigh in fairly.',
  },
  {
    icon: '☰',
    title: 'Fair, anonymous voting',
    text: 'Opinion clusters and vote patterns show where people align or diverge — without singling anyone out.',
  },
  {
    icon: '◌',
    title: 'Multilingual',
    text: 'All 24 EU official languages plus Chinese — or auto-detect. Each participant picks their own.',
  },
  {
    icon: '✦',
    title: 'AI common ground',
    text: 'A mediator that drafts a shared statement bridging opposing clusters, inspired by Pol.is and the Habermas Machine.',
  },
  {
    icon: '▦',
    title: 'Opinion map',
    text: 'A live map groups people by how they vote, so the shape of disagreement becomes something you can work with.',
  },
]

export default function SessionJoin({ onJoin }) {
  const [mode, setMode] = useState(null)
  const [name, setName] = useState(getSavedName)
  const [language, setLanguage] = useState('en')
  const [topic, setTopic] = useState('')
  const [voteType, setVoteType] = useState('likert')
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
      userLanguage: wantsHost ? language : null,
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
        body: JSON.stringify({ topic: topic.trim() || null, voteType, language }),
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
    <div className="ls murmi-land" data-testid="landing">
      <div className="ls-topfold">
        <nav className="ls-nav">
          <a className="ls-brand" href="#top" onClick={(e) => scrollToSection(e, 'top')}>
            <MurmiMark />
            <span className="ls-brand-name">{APP_NAME}</span>
          </a>
          <div className="ls-nav-center">
            <a className="ls-nav-link" href="#how" onClick={(e) => scrollToSection(e, 'how')}>How it works</a>
            <a className="ls-nav-link" href="#in-action" onClick={(e) => scrollToSection(e, 'in-action')}>In action</a>
            <a className="ls-nav-link" href="#features" onClick={(e) => scrollToSection(e, 'features')}>Why Murmi</a>
            <a className="ls-nav-link" href="#together" onClick={(e) => scrollToSection(e, 'together')}>Use cases</a>
          </div>
          <div className="ls-nav-actions">
            <button type="button" className="ls-btn nav-join" onClick={() => switchMode('join')} data-testid="nav-join">
              Join
            </button>
            <button type="button" className="ls-btn nav-host" onClick={() => switchMode('create')} data-testid="nav-host">
              <span>Host a session</span>
              <span className="ls-nav-host-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12">
                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
        </nav>

        <header className="ls-hero" id="top">
          <div className="ls-hero-scrim" aria-hidden="true" />
          <div className="ls-hero-copy">
            <p className="ls-hero-brand">{APP_NAME}</p>
            <h1 className="ls-h1">
              Better group<br />
              decisions at the speed<br />
              of conversation.
            </h1>
            <p className="ls-hero-lead">
              Spin up a session, invite the room, and move from messy talk to shared understanding.
            </p>
            <div className="ls-cta-row">
              <button type="button" className="ls-btn host-pill lg" onClick={() => switchMode('create')} data-testid="hero-host">
                <span>Host a Session</span>
                <HostChevron />
              </button>
              <button type="button" className="ls-btn ghost" onClick={() => switchMode('join')} data-testid="hero-join">
                Join with a code
              </button>
            </div>
          </div>
          <div className="ls-hero-visual" aria-hidden="true">
            <img
              className="ls-hero-art"
              src="/brand/hero-gathering.jpg"
              alt=""
              width={1920}
              height={1080}
            />
          </div>
        </header>
      </div>

      <div className="ls-sheet">
      <section className="ls-section ls-section-split" id="how">
        <div className="ls-section-media">
          <img src="/brand/section-together.jpg" alt="" width={1672} height={941} />
        </div>
        <div className="ls-section-copy">
          <span className="ls-kicker">How it works</span>
          <h2 className="ls-h2">From messy talks to shared understanding.</h2>
          <p className="ls-lead compact">Groups go beyond opinions to decisions they can stand behind together.</p>
          <div className="ls-steps">
            {STEPS.map((s) => (
              <article className="ls-step" key={s.num}>
                <div className="ls-step-top">
                  <span className="ls-step-num">{s.num}</span>
                </div>
                <h3 className="ls-step-title">{s.title}</h3>
                <p className="ls-step-text">{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ProductScreensCarousel />

      <section className="ls-section" id="features">
        <div className="ls-section-head">
          <span className="ls-kicker">Why {APP_NAME}?</span>
          <h2 className="ls-h2">Think better together</h2>
          <p className="ls-lead compact">
            {APP_NAME} doesn&apos;t replace people. It helps everyone join the decision and reach shared understanding.
          </p>
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

      <section className="ls-section ls-audiences" id="together">
        <div className="ls-section-head">
          <span className="ls-kicker">Who it&apos;s for</span>
          <h2 className="ls-h2">Built for groups that decide together</h2>
        </div>
        <div className="ls-audience-grid">
          <article className="ls-audience">
            <h3>Teams & Workshops</h3>
            <p>Make meetings more productive and decisions stronger.</p>
          </article>
          <article className="ls-audience">
            <h3>Public Civic Engagement</h3>
            <p>Involve more people, more fairly, with greater transparency.</p>
          </article>
          <article className="ls-audience">
            <h3>Organizations & Leaders</h3>
            <p>Understand your stakeholders and lead with confidence.</p>
          </article>
        </div>
      </section>

      <LanguageShowcase />
      </div>

      <section className="ls-final">
        <div className="ls-final-bg" aria-hidden="true">
          <img src="/brand/cta-invite.jpg" alt="" width={2172} height={724} />
        </div>
        <div className="ls-final-scrim" aria-hidden="true" />
        <div className="ls-final-inner">
          <h2 className="ls-h2">Ready to think better together?</h2>
          <p className="ls-lead">Host a session in seconds — no sign-up, no setup.</p>
          <div className="ls-cta-row center">
            <button type="button" className="ls-btn host-pill lg" onClick={() => switchMode('create')} data-testid="final-host">
              <span>Host a session</span>
              <HostChevron />
            </button>
            <button type="button" className="ls-btn join lg" onClick={() => switchMode('join')} data-testid="final-join">
              Join with a code
            </button>
          </div>
        </div>
      </section>

      <footer className="ls-footer">
        <div className="ls-footer-brand">
          <a className="ls-brand" href="#top" onClick={(e) => scrollToSection(e, 'top')}>
            <MurmiMark />
            <span className="ls-brand-name">{APP_NAME}</span>
          </a>
          <span className="ls-foot-note">
            Born in the Swiss Alps — built with collective intelligence.
          </span>
        </div>
        <nav className="ls-footer-nav" aria-label="Footer">
          <a className="ls-footer-link" href="#how" onClick={(e) => scrollToSection(e, 'how')}>How it works</a>
          <a className="ls-footer-link" href="#in-action" onClick={(e) => scrollToSection(e, 'in-action')}>In action</a>
          <a className="ls-footer-link" href="#features" onClick={(e) => scrollToSection(e, 'features')}>Why Murmi</a>
          <a className="ls-footer-link" href="#together" onClick={(e) => scrollToSection(e, 'together')}>Use cases</a>
        </nav>
      </footer>

      {mode && (
        <div className="modal-backdrop" onClick={closeModal} data-testid="auth-modal">
          <div
            className={`modal auth-modal${mode === 'create' ? ' host' : ' join'}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
          >
            <button type="button" className="auth-modal-close" onClick={closeModal} aria-label="Close" data-testid="modal-close">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="auth-modal-toolbar">
              <div className="auth-modal-tabs" role="tablist" aria-label="Session mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'create'}
                  className={`auth-modal-tab${mode === 'create' ? ' active' : ''}`}
                  onClick={() => switchMode('create')}
                  data-testid="auth-tab-host"
                >
                  Host
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'join'}
                  className={`auth-modal-tab${mode === 'join' ? ' active' : ''}`}
                  onClick={() => switchMode('join')}
                  data-testid="auth-tab-join"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="auth-modal-body">
              <div className="auth-modal-header">
                <span className="auth-modal-icon" aria-hidden="true">{mode === 'create' ? '🎙️' : '🔗'}</span>
                <div className="auth-modal-copy">
                  <h2 id="auth-modal-title" className="auth-modal-title">
                    {mode === 'create' ? 'Host a session' : 'Join a session'}
                  </h2>
                  <p className="auth-modal-lead">
                    {mode === 'create'
                      ? 'Set up a session, share the code, and invite the group to participate.'
                      : 'Enter the 6-character code from your host to jump in.'}
                  </p>
                </div>
              </div>

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
                    placeholder="What is the group discussing?"
                    data-testid="host-topic"
                  />
                </label>

                <label className="field">
                  <span className="field-label">Spoken language</span>
                  <LanguageSelect value={language} onChange={setLanguage} data-testid="host-language" singleLine />
                </label>

                <div className="field">
                  <span className="field-label">Vote scale</span>
                  <div className="vote-type-seg auth-vote-type" role="group" aria-label="Vote scale">
                    <button
                      type="button"
                      className={`vote-type-opt ${voteType === 'binary' ? 'on' : ''}`}
                      onClick={() => setVoteType('binary')}
                      aria-pressed={voteType === 'binary'}
                      data-testid="create-vote-type-binary"
                    >
                      Agree / Disagree
                    </button>
                    <button
                      type="button"
                      className={`vote-type-opt ${voteType === 'likert' ? 'on' : ''}`}
                      onClick={() => setVoteType('likert')}
                      aria-pressed={voteType === 'likert'}
                      data-testid="create-vote-type-likert"
                    >
                      Likert (5-point)
                    </button>
                  </div>
                  <span className="field-hint">Locked once recording starts.</span>
                </div>

                <button type="submit" className="btn primary auth-submit" disabled={loading} data-testid="create-submit">
                  {loading ? 'Creating…' : 'Create session'}
                </button>

                {errors.form && <p className="auth-form-error" data-testid="form-error">{errors.form}</p>}
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
                <label className="field auth-code-field">
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
                    autoComplete="off"
                    inputMode="text"
                    aria-invalid={!!errors.code}
                    className={`auth-code-input${errors.code ? ' invalid' : ''}`}
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

                <button type="submit" className="btn primary auth-submit" disabled={loading} data-testid="join-submit">
                  {loading ? 'Joining…' : 'Join session'}
                </button>

                {errors.form && <p className="auth-form-error" data-testid="form-error">{errors.form}</p>}
              </form>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
