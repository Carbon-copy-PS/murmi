import { useState, useEffect, useRef, useCallback } from 'react'
import TranscriptPanel from './TranscriptPanel'
import StatementsPanel from './StatementsPanel'
import { requestPermission, notify } from '../notifications'

export default function DebateRoom({ sessionId, userName, onLeave }) {
  const [connected, setConnected] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [recording, setRecording] = useState(false)
  const [participantId, setParticipantId] = useState(null)
  const [view, setView] = useState('record')
  const [statements, setStatements] = useState([])
  const [currentRoundCount, setCurrentRoundCount] = useState(0)
  const [threshold, setThreshold] = useState(5)
  const [topic, setTopic] = useState(null)

  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const recordingRef = useRef(false)
  const activeMicRef = useRef(null)
  const participantIdRef = useRef(null)

  const unvotedCount = statements.filter((s) => !s.hasVoted).length

  const recordChunk = useCallback(() => {
    if (!recordingRef.current || !streamRef.current) return

    let mimeType = 'audio/webm;codecs=opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
    }

    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    const chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      if (activeMicRef.current === participantIdRef.current && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType })
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio_chunk', audio: base64 }))
          }
        }
        reader.readAsDataURL(blob)
      }
      if (recordingRef.current) recordChunk()
    }

    recorder.start()
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, 5000)
  }, [])

  useEffect(() => { requestPermission() }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      ws.send(JSON.stringify({ type: 'join', name: userName }))
    }
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case 'joined':
          setParticipantId(msg.participantId)
          participantIdRef.current = msg.participantId
          setTranscript(msg.transcript || [])
          setStatements(msg.statements || [])
          setCurrentRoundCount(msg.currentRoundCount || 0)
          setThreshold(msg.threshold || 5)
          setTopic(msg.topic || null)
          if (msg.recording) {
            setRecording(true)
            recordingRef.current = true
            recordChunk()
          }
          break
        case 'active_mic':
          activeMicRef.current = msg.participantId
          break
        case 'recording_started':
          setRecording(true)
          recordingRef.current = true
          recordChunk()
          notify('Debate Sense', 'Recording started', { tag: 'recording', duration: 4000 })
          break
        case 'recording_stopped':
          setRecording(false)
          recordingRef.current = false
          notify('Debate Sense', 'Recording stopped', { tag: 'recording', duration: 4000 })
          break
        case 'transcript':
          setTranscript((prev) => [...prev, msg])
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
  }, [sessionId, userName, recordChunk])

  useEffect(() => {
    let cleanup = null
    async function initAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const interval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray)
          const level = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio_level', level }))
          }
        }, 200)

        cleanup = () => {
          clearInterval(interval)
          stream.getTracks().forEach((t) => t.stop())
          audioContext.close()
        }
      } catch (err) {
        console.error('Mic access denied:', err)
      }
    }
    initAudio()
    return () => cleanup?.()
  }, [])

  function toggleRecording() {
    wsRef.current?.send(JSON.stringify({ type: 'set_recording', recording: !recording }))
  }

  function handleVote(statementId, vote) {
    wsRef.current?.send(JSON.stringify({ type: 'vote', statementId, vote }))
  }

  return (
    <div className="room">
      <div className="room-top">
        <div>
          <span className="session-code">{sessionId}</span>
          {topic && <span className="topic-label">{topic}</span>}
        </div>
        <button className="link-btn" onClick={onLeave}>Leave</button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${view === 'record' ? 'active' : ''}`}
          onClick={() => setView('record')}
        >
          Record
        </button>
        <button
          className={`tab ${view === 'statements' ? 'active' : ''}`}
          onClick={() => setView('statements')}
        >
          Statements
          {unvotedCount > 0 && <span className="badge">{unvotedCount}</span>}
        </button>
      </div>

      {view === 'record' ? (
        <>
          <button
            className={`record-btn ${recording ? 'active' : ''}`}
            onClick={toggleRecording}
            disabled={!connected}
          >
            <span className="record-dot" />
            {recording ? 'Stop' : 'Record'}
          </button>

          <TranscriptPanel entries={transcript} />

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
      ) : (
        <StatementsPanel statements={statements} onVote={handleVote} />
      )}
    </div>
  )
}
