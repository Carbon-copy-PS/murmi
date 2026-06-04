import { useState, useEffect, useRef } from 'react'
import TranscriptPanel from './TranscriptPanel'
import StatementsPanel from './StatementsPanel'
import ResultsPanel from './ResultsPanel'
import ShareModal from './ShareModal'
import { requestPermission, notify } from '../notifications'
import { getClientId } from '../identity'

const REALTIME_SAMPLE_RATE = 24000
const AUDIO_BUFFER_SIZE = 4096
const SPEECH_RMS_THRESHOLD = 0.008
const TRAILING_SILENCE_FRAMES = 7
const AUTO_APPROVE_MS = 5000

function resampleBuffer(buffer, inputRate, outputRate) {
  if (inputRate === outputRate) return buffer

  const outputLength = Math.round(buffer.length * outputRate / inputRate)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * inputRate / outputRate
    const before = Math.floor(sourceIndex)
    const after = Math.min(before + 1, buffer.length - 1)
    const weight = sourceIndex - before
    output[i] = buffer[before] * (1 - weight) + buffer[after] * weight
  }

  return output
}

function encodePcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function rmsLevel(samples) {
  if (!samples.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

export default function DebateRoom({ sessionId, userName, userLanguage, wantsHost, onLeave }) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [partialCaption, setPartialCaption] = useState(null)
  const [captionError, setCaptionError] = useState('')
  const [recording, setRecording] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [view, setView] = useState('record')
  const [statements, setStatements] = useState([])
  const [currentRoundCount, setCurrentRoundCount] = useState(0)
  const [threshold, setThreshold] = useState(5)
  const [topic, setTopic] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [autoApprove, setAutoApprove] = useState(true)
  const [heldIds, setHeldIds] = useState(() => new Set())

  const approveTimersRef = useRef(new Map())

  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const recordingRef = useRef(false)
  const participantIdRef = useRef(null)
  const isHostRef = useRef(false)
  const silenceFramesRef = useRef(0)
  const speechStartedRef = useRef(false)

  const unvotedCount = statements.filter((s) => s.approved && !s.hasVoted).length
  const pendingCount = statements.filter((s) => !s.approved).length

  useEffect(() => { requestPermission() }, [])

  useEffect(() => {
    const timers = approveTimersRef.current
    if (!isHost) {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      return
    }
    const pendingIds = new Set(statements.filter((s) => !s.approved).map((s) => s.id))

    timers.forEach((timer, id) => {
      if (!pendingIds.has(id)) {
        clearTimeout(timer)
        timers.delete(id)
      }
    })

    if (autoApprove) {
      pendingIds.forEach((id) => {
        if (heldIds.has(id) || timers.has(id)) return
        const timer = setTimeout(() => {
          wsRef.current?.send(JSON.stringify({ type: 'approve_statement', statementId: id }))
          timers.delete(id)
        }, AUTO_APPROVE_MS)
        timers.set(id, timer)
      })
    } else {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [statements, autoApprove, heldIds, isHost])

  useEffect(() => {
    const timers = approveTimersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({
        type: 'join',
        name: userName,
        language: userLanguage,
        wantsHost: Boolean(wantsHost),
        clientId: getClientId(),
      }))
    }
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case 'joined':
          participantIdRef.current = msg.participantId
          setIsHost(Boolean(msg.isHost))
          isHostRef.current = Boolean(msg.isHost)
          setView(msg.isHost ? 'record' : 'statements')
          setTranscript(msg.transcript || [])
          setStatements(msg.statements || [])
          setCurrentRoundCount(msg.currentRoundCount || 0)
          setThreshold(msg.threshold || 5)
          setTopic(msg.topic || null)
          if (msg.recording) {
            setRecording(true)
            recordingRef.current = true
          }
          break
        case 'active_mic':
          break
        case 'session_expired':
          notify('Debate Sense', 'This session has expired', { tag: 'expired', force: true })
          onLeave()
          break
        case 'host_updated': {
          const nextIsHost = msg.hostParticipantId === participantIdRef.current
          setIsHost(nextIsHost)
          isHostRef.current = nextIsHost
          break
        }
        case 'participant_joined':
        case 'participant_left':
          if (msg.hostParticipantId) {
            const nextIsHost = msg.hostParticipantId === participantIdRef.current
            setIsHost(nextIsHost)
            isHostRef.current = nextIsHost
          }
          break
        case 'recording_started':
          setRecording(true)
          recordingRef.current = true
          speechStartedRef.current = false
          silenceFramesRef.current = 0
          setCaptionError('')
          notify('Debate Sense', 'Recording started', { tag: 'recording', duration: 4000 })
          break
        case 'recording_stopped':
          setRecording(false)
          recordingRef.current = false
          speechStartedRef.current = false
          silenceFramesRef.current = 0
          setPartialCaption(null)
          notify('Debate Sense', 'Recording stopped', { tag: 'recording', duration: 4000 })
          break
        case 'caption_delta':
          setPartialCaption((prev) => {
            if (prev?.itemId === msg.itemId) {
              return { ...prev, text: prev.text + msg.delta }
            }
            return {
              itemId: msg.itemId,
              speaker: msg.speaker,
              text: msg.delta,
              timestamp: msg.timestamp,
            }
          })
          break
        case 'caption_error':
          setCaptionError(msg.message || 'Realtime captions unavailable')
          break
        case 'caption_rejected':
          setPartialCaption((prev) => (
            prev?.itemId === msg.itemId ? null : prev
          ))
          break
        case 'transcript':
          setTranscript((prev) => [...prev, msg])
          setPartialCaption((prev) => (
            !prev || !msg.itemId || prev.itemId === msg.itemId ? null : prev
          ))
          break
        case 'transcript_update':
          setTranscript((prev) =>
            prev.map((entry) => entry.id === msg.entry?.id ? msg.entry : entry)
          )
          setPartialCaption((prev) => {
            if (!prev || !msg.entry?.itemIds?.includes(prev.itemId)) return prev
            return null
          })
          break
        case 'statements_updated':
          setStatements(msg.statements)
          setCurrentRoundCount(msg.currentRoundCount)
          setThreshold(msg.threshold)
          break
        case 'threshold_reached':
          setView('statements')
          notify('Debate Sense', `Round ${msg.round} complete — vote on the statements!`, {
            tag: 'threshold',
            force: true,
          })
          break
        case 'vote_updated':
          setStatements((prev) =>
            prev.map((s) =>
              s.id === msg.statementId
                ? { ...s, agrees: msg.agrees, disagrees: msg.disagrees, hasVoted: msg.hasVoted, myVote: msg.myVote }
                : s
            )
          )
          break
      }
    }

    return () => ws.close()
  }, [sessionId, userName, userLanguage, wantsHost])

  useEffect(() => {
    let cleanup = null
    let disposed = false
    async function initAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        const audioContext = new AudioContextClass({ sampleRate: REALTIME_SAMPLE_RATE })
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        const processor = audioContext.createScriptProcessor(AUDIO_BUFFER_SIZE, 1, 1)
        const silentOutput = audioContext.createGain()
        analyser.fftSize = 256
        silentOutput.gain.value = 0
        source.connect(analyser)
        source.connect(processor)
        processor.connect(silentOutput)
        silentOutput.connect(audioContext.destination)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const interval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray)
          const level = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio_level', level }))
          }
        }, 200)

        processor.onaudioprocess = (event) => {
          if (!isHostRef.current) return
          if (!recordingRef.current) return
          if (wsRef.current?.readyState !== WebSocket.OPEN) return

          const input = event.inputBuffer.getChannelData(0)
          const resampled = resampleBuffer(input, audioContext.sampleRate, REALTIME_SAMPLE_RATE)
          const rms = rmsLevel(resampled)
          if (rms < SPEECH_RMS_THRESHOLD) {
            if (!speechStartedRef.current) return
            if (silenceFramesRef.current >= TRAILING_SILENCE_FRAMES) {
              speechStartedRef.current = false
              return
            }
            silenceFramesRef.current += 1
          } else {
            speechStartedRef.current = true
            silenceFramesRef.current = 0
          }
          const pcm16 = encodePcm16(resampled)
          wsRef.current.send(JSON.stringify({
            type: 'audio_frame',
            audio: arrayBufferToBase64(pcm16),
          }))
        }

        cleanup = () => {
          clearInterval(interval)
          processor.disconnect()
          silentOutput.disconnect()
          stream.getTracks().forEach((t) => t.stop())
          audioContext.close()
          streamRef.current = null
          audioContextRef.current = null
        }
      } catch (err) {
        console.error('Mic access denied:', err)
        setCaptionError('Microphone access is blocked for the host recorder.')
      }
    }
    if (!isHost) return undefined
    initAudio()
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [isHost])

  async function toggleRecording() {
    if (!isHost) return
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    wsRef.current?.send(JSON.stringify({ type: 'set_recording', recording: !recording }))
  }

  function handleVote(statementId, vote) {
    wsRef.current?.send(JSON.stringify({ type: 'vote', statementId, vote }))
  }

  function handleApprove(statementId) {
    wsRef.current?.send(JSON.stringify({ type: 'approve_statement', statementId }))
  }

  function handleAddStatement(text) {
    wsRef.current?.send(JSON.stringify({ type: 'add_statement', text }))
  }

  function handleHold(statementId) {
    const timer = approveTimersRef.current.get(statementId)
    if (timer) {
      clearTimeout(timer)
      approveTimersRef.current.delete(statementId)
    }
    setHeldIds((prev) => new Set(prev).add(statementId))
  }

  return (
    <div className="room">
      <div className="room-top">
        <div className="room-meta">
          <div className="room-status">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} aria-hidden="true" />
            <span className="status-text">{connected ? 'Live' : 'Connecting…'}</span>
            {isHost && <span className="host-badge" data-testid="host-badge">Host</span>}
          </div>
          {topic && <h1 className="room-topic" data-testid="room-topic">{topic}</h1>}
          <button
            className="code-pill"
            onClick={() => setShowShare(true)}
            title="Share session"
            data-testid="code-pill"
          >
            <span className="code-pill-label">Code</span>
            <span className="code-pill-value">{sessionId}</span>
          </button>
        </div>
        <div className="room-actions">
          <button className="icon-btn" onClick={() => setShowShare(true)} data-testid="share-btn">
            Share
          </button>
          <button className="link-btn" onClick={onLeave} data-testid="leave-btn">Leave</button>
        </div>
      </div>

      {showShare && (
        <ShareModal sessionId={sessionId} topic={topic} onClose={() => setShowShare(false)} />
      )}

      <div className="tabs">
        {isHost && (
          <button
            className={`tab ${view === 'record' ? 'active' : ''}`}
            onClick={() => setView('record')}
            data-testid="tab-record"
          >
            Record
          </button>
        )}
        <button
          className={`tab ${view === 'statements' ? 'active' : ''}`}
          onClick={() => setView('statements')}
          data-testid="tab-vote"
        >
          Vote
          {isHost && pendingCount > 0 && (
            <span className="badge pending" data-testid="pending-badge">{pendingCount}</span>
          )}
          {unvotedCount > 0 && <span className="badge">{unvotedCount}</span>}
        </button>
        <button
          className={`tab ${view === 'results' ? 'active' : ''}`}
          onClick={() => setView('results')}
        >
          Results
        </button>
      </div>

      {view === 'record' && (
        <>
          <button
            className={`record-btn ${recording ? 'active' : ''}`}
            onClick={toggleRecording}
            disabled={!connected || !isHost}
          >
            <span className="record-dot" />
            {isHost ? (recording ? 'Stop' : 'Record') : 'Listening'}
          </button>

          <TranscriptPanel entries={transcript} partial={partialCaption} error={captionError} />

          <div className="progress-container">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.min((currentRoundCount / threshold) * 100, 100)}%` }}
              />
            </div>
            <span className="progress-label">{currentRoundCount} / {threshold} statements</span>
          </div>
        </>
      )}
      {view === 'statements' && (
        <StatementsPanel
          statements={statements}
          onVote={handleVote}
          isHost={isHost}
          onApprove={handleApprove}
          onAddStatement={handleAddStatement}
          autoApprove={autoApprove}
          onToggleAutoApprove={setAutoApprove}
          heldIds={heldIds}
          onHold={handleHold}
        />
      )}
      {view === 'results' && (
        <ResultsPanel statements={statements} />
      )}
    </div>
  )
}
