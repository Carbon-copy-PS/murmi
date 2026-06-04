import { useState } from 'react'
import SessionJoin from './components/SessionJoin'
import DebateRoom from './components/DebateRoom'
import { getSavedSession, saveSession, clearSession } from './identity'

export default function App() {
  const [session, setSession] = useState(getSavedSession)

  const handleJoin = (next) => {
    saveSession(next)
    setSession(next)
  }

  const handleLeave = () => {
    clearSession()
    setSession(null)
  }

  if (!session) {
    return <SessionJoin onJoin={handleJoin} />
  }

  return (
    <DebateRoom
      sessionId={session.sessionId}
      userName={session.userName}
      userLanguage={session.userLanguage}
      wantsHost={session.wantsHost}
      onLeave={handleLeave}
    />
  )
}
