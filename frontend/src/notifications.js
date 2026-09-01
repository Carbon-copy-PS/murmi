const supported = typeof Notification !== 'undefined'
let permission = supported ? Notification.permission : 'denied'

export async function requestPermission() {
  if (!supported) return false
  if (permission === 'granted') return true
  permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function notify(title, body, options = {}) {
  if (!supported || permission !== 'granted') return null
  if (document.visibilityState === 'visible' && !options.force) return null

  const n = new Notification(title, {
    body,
    icon: options.icon,
    tag: options.tag,
    silent: options.silent ?? false,
    ...options,
  })

  if (options.duration) {
    setTimeout(() => n.close(), options.duration)
  }

  return n
}
