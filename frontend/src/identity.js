const CLIENT_KEY = 'ds_client_id'
const NAME_KEY = 'ds_user_name'
const SESSION_KEY = 'ds_session'

export function getClientId() {
  let id = sessionStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
    sessionStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) || ''
}

export function saveName(name) {
  if (name) localStorage.setItem(NAME_KEY, name.trim())
}

export function getSavedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    const data = raw ? JSON.parse(raw) : null
    return data && data.sessionId ? data : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  if (session?.sessionId) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
