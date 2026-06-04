const CLIENT_KEY = 'ds_client_id'
const NAME_KEY = 'ds_user_name'

export function getClientId() {
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() || `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

export function getSavedName() {
  return localStorage.getItem(NAME_KEY) || ''
}

export function saveName(name) {
  if (name) localStorage.setItem(NAME_KEY, name.trim())
}
