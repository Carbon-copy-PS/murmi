import { useState, useEffect, useRef } from 'react'
import TranscriptPanel from './TranscriptPanel'
import StatementsPanel from './StatementsPanel'
import ResultsPanel from './ResultsPanel'
import ParticipantsPanel from './ParticipantsPanel'
import ShareModal from './ShareModal'
import ConfirmDialog from './ConfirmDialog'
import { requestPermission, notify } from '../notifications'
import { getClientId, saveName, saveSession } from '../identity'

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

function EditIcon() {
  return (
    <svg className="field-edit-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
      />
    </svg>
  )
}

export default function DebateRoom({ sessionId, userName, userLanguage, wantsHost, onLeave }) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [partialCaption, setPartialCaption] = useState(null)
  const [captionError, setCaptionError] = useState('')
  const [recording, setRecording] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [isRecorder, setIsRecorder] = useState(false)
  const [view, setView] = useState('record')
  const [statements, setStatements] = useState([])
  const [currentRoundCount, setCurrentRoundCount] = useState(0)
  const [threshold, setThreshold] = useState(5)
  const [topic, setTopic] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [autoApprove, setAutoApprove] = useState(true)
  const [heldIds, setHeldIds] = useState(() => new Set())
  const [results, setResults] = useState(null)
  const [participants, setParticipants] = useState([])
  const [displayName, setDisplayName] = useState(userName)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(userName)
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')

  const approveTimersRef = useRef(new Map())

  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const recordingRef = useRef(false)
  const participantIdRef = useRef(null)
  const isHostRef = useRef(false)
  const isRecorderRef = useRef(false)
  const silenceFramesRef = useRef(0)
  const speechStartedRef = useRef(false)

  const unvotedCount = statements.filter((s) => s.approved && !s.hasVoted).length
  const pendingCount = statements.filter((s) => !s.approved).length

  useEffect(() => { requestPermission() }, [])

  useEffect(() => {
    if (view !== 'results' || !connected) return
    requestResults()
    const interval = setInterval(requestResults, 5000)
    return () => clearInterval(interval)
  }, [view, connected])

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
        case 'joined': {
          participantIdRef.current = msg.participantId
          const host = Boolean(msg.isHost)
          const recorder = msg.recorderId === msg.participantId
          setIsHost(host)
          isHostRef.current = host
          setIsRecorder(recorder)
          isRecorderRef.current = recorder
          setView(recorder ? 'record' : 'statements')
          setTranscript(msg.transcript || [])
          setStatements(msg.statements || [])
          setCurrentRoundCount(msg.currentRoundCount || 0)
          setThreshold(msg.threshold || 5)
          setTopic(msg.topic || null)
          setParticipants(msg.participantsStatus || [])
          if (msg.recording) {
            setRecording(true)
            recordingRef.current = true
          }
          break
        }
        case 'participants_status':
          setParticipants(msg.participants || [])
          break
        case 'hosts_updated': {
          const myId = participantIdRef.current
          const host = (msg.hostIds || []).includes(myId)
          const recorder = msg.recorderId === myId
          setIsHost(host)
          isHostRef.current = host
          setIsRecorder(recorder)
          isRecorderRef.current = recorder
          if (!host) {
            setView((prev) => (prev === 'record' || prev === 'participants' ? 'statements' : prev))
          } else if (!recorder) {
            setView((prev) => (prev === 'record' ? 'statements' : prev))
          }
          break
        }
        case 'topic_updated':
          setTopic(msg.topic || null)
          break
        case 'participant_renamed':
          break
        case 'active_mic':
          break
        case 'session_expired':
          notify('Debate Sense', 'This session has expired', { tag: 'expired', force: true })
          onLeave()
          break
        case 'participant_joined':
        case 'participant_left':
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
        case 'results':
          setResults({ statements: msg.statements, voters: msg.voters })
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
          if (!isRecorderRef.current) return
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
    if (!isRecorder) return undefined
    initAudio()
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [isRecorder])

  async function toggleRecording() {
    if (!isRecorder) return
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    wsRef.current?.send(JSON.stringify({ type: 'set_recording', recording: !recording }))
  }

  function handleVote(statementId, vote) {
    wsRef.current?.send(JSON.stringify({ type: 'vote', statementId, vote }))
  }

  function handleToggleHost(targetId, makeHost) {
    wsRef.current?.send(JSON.stringify({ type: 'set_host', participantId: targetId, host: makeHost }))
  }

  function requestToggleHost(p) {
    setConfirm({
      title: p.isHost ? 'Revoke host access?' : `Make ${p.name} a host?`,
      message: p.isHost
        ? `${p.name} will lose host controls for this debate.`
        : `${p.name} will be able to manage statements, recording and other participants.`,
      confirmLabel: p.isHost ? 'Revoke host' : 'Make host',
      danger: p.isHost,
      onConfirm: () => handleToggleHost(p.id, !p.isHost),
    })
  }

  function handleSetRecorder(targetId) {
    wsRef.current?.send(JSON.stringify({ type: 'set_recorder', participantId: targetId }))
  }

  function requestSetRecorder(p) {
    const isYou = p.id === participantIdRef.current
    setConfirm({
      title: isYou ? 'Take the mic?' : `Give the mic to ${p.name}?`,
      message: isYou
        ? 'You become the recorder — recording will capture your microphone.'
        : `${p.name} becomes the recorder. Their microphone will capture the debate audio.`,
      confirmLabel: isYou ? 'Take mic' : 'Give mic',
      danger: false,
      onConfirm: () => handleSetRecorder(p.id),
    })
  }

  function requestLeave() {
    setConfirm({
      title: 'Leave this debate?',
      message: 'You can rejoin anytime with the session code.',
      confirmLabel: 'Leave',
      danger: true,
      onConfirm: onLeave,
    })
  }

  function startEditName() {
    setNameDraft(displayName)
    setEditingName(true)
  }

  function saveDisplayName() {
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed.length < 2) return
    if (trimmed !== displayName) {
      wsRef.current?.send(JSON.stringify({ type: 'rename', name: trimmed }))
      setDisplayName(trimmed)
      saveName(trimmed)
      saveSession({ sessionId, userName: trimmed, userLanguage, wantsHost })
    }
    setEditingName(false)
  }

  function handleNameKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveDisplayName()
    } else if (e.key === 'Escape') {
      setEditingName(false)
    }
  }

  function startEditTopic() {
    setTopicDraft(topic || '')
    setEditingTopic(true)
  }

  function saveTopic() {
    const trimmed = topicDraft.trim()
    if (trimmed !== (topic || '')) {
      wsRef.current?.send(JSON.stringify({ type: 'set_topic', topic: trimmed }))
      setTopic(trimmed || null)
    }
    setEditingTopic(false)
  }

  function handleTopicKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveTopic()
    } else if (e.key === 'Escape') {
      setEditingTopic(false)
    }
  }

  function requestResults() {
    wsRef.current?.send(JSON.stringify({ type: 'get_results' }))
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
        <div className="room-bar">
          <div className="room-status">
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} aria-hidden="true" />
            <span className="status-text">{connected ? 'Live' : 'Connecting…'}</span>
            {isHost && <span className="host-badge" data-testid="host-badge">Host</span>}
          </div>
          <button
            className="code-pill"
            onClick={() => setShowShare(true)}
            title="Share session"
            data-testid="code-pill"
          >
            <span className="code-pill-label">Code</span>
            <span className="code-pill-value">{sessionId}</span>
          </button>
          <div className="room-actions">
            <button className="icon-btn" onClick={() => setShowShare(true)} data-testid="share-btn">
              Share
            </button>
            <button className="link-btn" onClick={requestLeave} data-testid="leave-btn">Leave</button>
          </div>
        </div>

        <div className="room-fields">
          <div className="field-block" data-testid="topic-field">
            <span className="field-tag">Topic</span>
            {editingTopic ? (
              <div className="field-edit">
                <input
                  type="text"
                  className="field-edit-input"
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={handleTopicKeyDown}
                  autoFocus
                  maxLength={200}
                  placeholder="What are you debating?"
                  aria-label="Edit topic"
                  data-testid="topic-edit-input"
                />
                <button className="icon-btn sm" onClick={saveTopic} data-testid="topic-save-btn">Save</button>
              </div>
            ) : isHost ? (
              <button
                className="field-value editable"
                onClick={startEditTopic}
                title="Edit topic"
                data-testid="topic-edit-btn"
              >
                <span className={`field-value-text ${topic ? '' : 'placeholder'}`}>
                  {topic || 'Add a topic'}
                </span>
                <EditIcon />
              </button>
            ) : (
              <span className="field-value" data-testid="room-topic">
                <span className={`field-value-text ${topic ? '' : 'placeholder'}`}>
                  {topic || 'No topic set'}
                </span>
              </span>
            )}
          </div>

          <div className="field-block" data-testid="room-user">
            <span className="field-tag">Your name</span>
            {editingName ? (
              <div className="field-edit">
                <input
                  type="text"
                  className="field-edit-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  autoFocus
                  maxLength={120}
                  aria-label="Edit your name"
                  data-testid="name-edit-input"
                />
                <button className="icon-btn sm" onClick={saveDisplayName} data-testid="name-save-btn">Save</button>
              </div>
            ) : (
              <button
                className="field-value editable"
                onClick={startEditName}
                title="Edit your name"
                data-testid="name-edit-btn"
              >
                <span className="field-value-text">{displayName}</span>
                <EditIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {showShare && (
        <ShareModal sessionId={sessionId} topic={topic} onClose={() => setShowShare(false)} />
      )}

      <div className="tabs">
        {isRecorder && (
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
        {isHost && (
          <button
            className={`tab ${view === 'participants' ? 'active' : ''}`}
            onClick={() => setView('participants')}
            data-testid="tab-participants"
          >
            Participants
            {participants.length > 0 && <span className="badge">{participants.length}</span>}
          </button>
        )}
      </div>

      {view === 'record' && (
        <>
          <button
            className={`record-btn ${recording ? 'active' : ''}`}
            onClick={toggleRecording}
            disabled={!connected || !isRecorder}
          >
            <span className="record-dot" />
            {isRecorder ? (recording ? 'Stop' : 'Record') : 'Listening'}
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
        <ResultsPanel statements={statements} results={results} isHost={isHost} />
      )}
      {view === 'participants' && isHost && (
        <ParticipantsPanel
          participants={participants}
          currentId={participantIdRef.current}
          canManageHosts={isHost}
          onToggleHost={requestToggleHost}
          onSetRecorder={requestSetRecorder}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={() => {
            confirm.onConfirm?.()
            setConfirm(null)
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
