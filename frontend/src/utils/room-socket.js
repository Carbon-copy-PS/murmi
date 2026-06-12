import { getClientId } from '../identity'

const PING_INTERVAL_MS = 25000
const MAX_BACKOFF_MS = 15000
const NO_RECONNECT_CODES = new Set([4000, 4001])

export function createRoomSocket({ sessionId, getJoinPayload, onMessage, onStatus, onSocket }) {
  let ws = null
  let reconnectTimer = null
  let pingTimer = null
  let attempt = 0
  let closed = false
  let intentional = false

  function clearPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (closed || intentional) return
    onStatus('reconnecting')
    const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
    attempt += 1
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (closed || intentional) return
    onStatus(attempt > 0 ? 'reconnecting' : 'connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`)

    ws.onopen = () => {
      attempt = 0
      onSocket?.(ws)
      onStatus('live')
      ws.send(JSON.stringify({
        type: 'join',
        ...getJoinPayload(),
        clientId: getClientId(),
      }))
      clearPing()
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL_MS)
    }

    ws.onclose = (ev) => {
      clearPing()
      onSocket?.(null)
      ws = null
      if (intentional || closed) return
      if (NO_RECONNECT_CODES.has(ev.code)) {
        onStatus('offline')
        return
      }
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws?.close()
    }

    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.type === 'pong') return
      onMessage(msg)
    }
  }

  function reconnectNow() {
    if (closed || intentional) return
    clearReconnect()
    attempt = 0
    if (ws) {
      const prev = ws
      ws = null
      prev.onclose = null
      prev.close()
    }
    connect()
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectNow()
    }
  }

  function handleOnline() {
    reconnectNow()
  }

  connect()
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('online', handleOnline)

  return {
    send(data) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
        return true
      }
      return false
    },
    getWs() {
      return ws
    },
    close() {
      intentional = true
      closed = true
      clearPing()
      clearReconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      if (ws) {
        const prev = ws
        ws = null
        prev.onclose = null
        prev.close()
      }
    },
  }
}
