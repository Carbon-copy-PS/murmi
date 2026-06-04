import { useState, useEffect } from 'react'
import { getSavedName, saveName } from '../identity'

const LANGUAGES = (
  <>
    <option value="auto">Auto language</option>
    <option value="en">English</option>
    <option value="de">Deutsch / Schwiizerdutsch</option>
    <option value="fr">Français</option>
  </>
)

const Req = () => <span className="req" aria-hidden="true">*</span>

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

  const goBack = () => switchMode(null)

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
    <div className="landing">
      <header className="landing-hero">
        <div className="landing-logo" aria-hidden="true">
          <svg viewBox="0 0 512 512" className="landing-logo-mark" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        </div>
        <h1 className="landing-title">Debate Sense</h1>
        <p className="landing-tagline">
          Live captions and real-time sentiment for better conversations.
        </p>
      </header>

      {mode === null && (
        <div className="choice-grid" data-testid="mode-choice">
          <button
            type="button"
            className="choice-card choice-host"
            onClick={() => switchMode('create')}
            data-testid="choose-host"
          >
            <span className="choice-icon" aria-hidden="true">＋</span>
            <span className="choice-title">Host a debate</span>
            <span className="choice-desc">Start a new session and invite others with a code.</span>
          </button>

          <button
            type="button"
            className="choice-card choice-join"
            onClick={() => switchMode('join')}
            data-testid="choose-join"
          >
            <span className="choice-icon" aria-hidden="true">→</span>
            <span className="choice-title">Join a debate</span>
            <span className="choice-desc">Got a code from a host? Hop into their session.</span>
          </button>
        </div>
      )}

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
          <button type="button" className="back-btn" onClick={goBack} data-testid="back-btn">
            ← Back
          </button>
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
          <button type="button" className="back-btn" onClick={goBack} data-testid="back-btn">
            ← Back
          </button>
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
  )
}
