import { useState } from 'react'

export default function SessionJoin({ onJoin }) {
  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name')
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic.trim() || null }),
    })
    const data = await res.json()
    onJoin({ sessionId: data.sessionId, userName: name.trim() })
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name')
    if (!code.trim()) return setError('Enter a session code')
    const res = await fetch(`/api/sessions/${code.trim().toUpperCase()}`)
    if (!res.ok) return setError('Session not found')
    onJoin({ sessionId: code.trim().toUpperCase(), userName: name.trim() })
  }

  return (
    <div className="join">
      <h1>Debate Sense</h1>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        autoFocus
      />

      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Debate topic (optional)"
      />

      <button className="btn primary" onClick={handleCreate}>New Session</button>

      <div className="divider"><span>or</span></div>

      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Session code"
        maxLength={6}
      />

      <button className="btn" onClick={handleJoin}>Join</button>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
