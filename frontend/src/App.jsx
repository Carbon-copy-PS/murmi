import { useEffect, useState } from 'react'
import i18n from './i18n'
import SessionJoin from './components/SessionJoin'
import SessionRoom from './components/session-room'
import { getSavedSession, saveSession, clearSession } from './identity'

export default function App() {
  const [session, setSession] = useState(getSavedSession)

  useEffect(() => {
    if (!session) i18n.changeLanguage('en')
  }, [session])

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
    <SessionRoom
      sessionId={session.sessionId}
      userName={session.userName}
      userLanguage={session.userLanguage}
      wantsHost={session.wantsHost}
      onLeave={handleLeave}
    />
  )
}
