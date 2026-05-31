import { useState } from 'react'
import SessionJoin from './components/SessionJoin'
import DebateRoom from './components/DebateRoom'

export default function App() {
  const [session, setSession] = useState(null)

  if (!session) {
    return <SessionJoin onJoin={setSession} />
  }

  return (
    <DebateRoom
      sessionId={session.sessionId}
      userName={session.userName}
      userLanguage={session.userLanguage}
      wantsHost={session.wantsHost}
      onLeave={() => setSession(null)}
    />
  )
}
