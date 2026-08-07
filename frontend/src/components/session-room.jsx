import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { APP_NAME } from '../constants/app'
import { getLanguage } from '../constants/languages'
import { resolveUiLanguage } from '../i18n'
import TranscriptPanel from './TranscriptPanel'
import StatementsPanel from './StatementsPanel'
import ResultsPanel from './ResultsPanel'
import ParticipantsPanel from './ParticipantsPanel'
import SettingsPanel from './settings-panel'
import ShareModal from './ShareModal'
import ConfirmDialog from './ConfirmDialog'
import ThemeToggle from './ThemeToggle'
import { requestPermission, notify } from '../notifications'
import { saveName, saveSession, hasOnboarded, setOnboarded } from '../identity'
import {
  startRoomTour,
  TOUR_TRANSCRIPT,
  TOUR_STATEMENTS,
  TOUR_RESULTS,
  TOUR_COMMON_GROUND_HISTORY,
  TOUR_PARTICIPANTS,
} from '../utils/room-tour'
import { createRoomSocket } from '../utils/room-socket'
import CommonGroundPopup from './common-ground-popup'
import { DEFAULT_CG_MODE } from '../constants/common-ground-mode'

const noop = () => {}

const REALTIME_SAMPLE_RATE = 24000
const AUDIO_BUFFER_SIZE = 4096
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

export default function SessionRoom({ sessionId, userName, userLanguage, wantsHost, onLeave }) {
  const { t, i18n } = useTranslation()
  const [connStatus, setConnStatus] = useState('connecting')
  const connected = connStatus === 'live'
  const [transcript, setTranscript] = useState([])
  const [partialCaption, setPartialCaption] = useState(null)
  const [captionError, setCaptionError] = useState('')
  const [recording, setRecording] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [isRecorder, setIsRecorder] = useState(false)
  const [view, setView] = useState('record')
  const [statements, setStatements] = useState([])
  const [topic, setTopic] = useState(null)
  const [publicId, setPublicId] = useState(null)
  const [voteType, setVoteType] = useState('binary')
  const [voteTypeLocked, setVoteTypeLocked] = useState(false)
  const [cgMode, setCgMode] = useState(DEFAULT_CG_MODE)
  const [expiresAt, setExpiresAt] = useState(null)
  const [votingOpen, setVotingOpen] = useState(true)
  const [votingLifetimeHours, setVotingLifetimeHours] = useState(24)
  const [votingExpiresAt, setVotingExpiresAt] = useState(null)
  const [votingActivity, setVotingActivity] = useState([])
  const [showShare, setShowShare] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [autoApprove, setAutoApprove] = useState(false)
  const [canAddStatement, setCanAddStatement] = useState(true)
  const [defaultCanAddStatement, setDefaultCanAddStatement] = useState(true)
  const [statementSubmitted, setStatementSubmitted] = useState(false)
  const [heldIds, setHeldIds] = useState(() => new Set())
  const [results, setResults] = useState(null)
  const [commonGroundHistory, setCommonGroundHistory] = useState([])
  const [cgPending, setCgPending] = useState(false)
  const [cgPendingMode, setCgPendingMode] = useState(null)
  const [cgError, setCgError] = useState(null)
  const [cgPopup, setCgPopup] = useState(null)
  const cgSeenIdsRef = useRef(new Set())
  const [recommendationsPending, setRecommendationsPending] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState(null)
  const [recommendationDrafts, setRecommendationDrafts] = useState(null)
  const [participants, setParticipants] = useState([])
  const [presence, setPresence] = useState({ here: 0, votingNow: 0 })
  const [displayName, setDisplayName] = useState(userName)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(userName)
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [roomLanguage, setRoomLanguage] = useState(userLanguage || 'en')
  const [tourActive, setTourActive] = useState(false)
  const tourRef = useRef(null)
  const tourStartedRef = useRef(false)

  const approveTimersRef = useRef(new Map())
  const cgTimeoutRef = useRef(null)
  const recommendationsTimeoutRef = useRef(null)

  const tabsWrapRef = useRef(null)
  const tabsScrollRef = useRef(null)

  const wsRef = useRef(null)
  const socketRef = useRef(null)
  const onLeaveRef = useRef(onLeave)
  onLeaveRef.current = onLeave
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioCleanupRef = useRef(null)
  const ensureMicPipelineRef = useRef(async () => {})
  const recordingRef = useRef(false)
  const participantIdRef = useRef(null)
  const isHostRef = useRef(false)
  const isRecorderRef = useRef(false)

  const unvotedCount = statements.filter((s) => s.approved && !s.hasVoted).length
  const pendingCount = statements.filter((s) => !s.approved).length

  const [nowTick, setNowTick] = useState(() => Date.now())
  const votingExpired = votingExpiresAt != null && nowTick >= votingExpiresAt * 1000
  const votingActive = votingOpen && !votingExpired
  const votingActiveRef = useRef(votingActive)
  votingActiveRef.current = votingActive

  useEffect(() => {
    if (!votingExpiresAt) return undefined
    const id = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(id)
  }, [votingExpiresAt])

  useEffect(() => { requestPermission() }, [])

  useEffect(() => {
    i18n.changeLanguage(resolveUiLanguage(roomLanguage))
  }, [roomLanguage, i18n])

  useEffect(() => {
    const root = document.documentElement
    if (view === 'record') root.classList.add('room-record-view')
    else root.classList.remove('room-record-view')
    return () => root.classList.remove('room-record-view')
  }, [view])

  useEffect(() => {
    if (!connected || tourStartedRef.current || hasOnboarded()) return undefined
    tourStartedRef.current = true
    const timer = setTimeout(() => {
      setTourActive(true)
      tourRef.current = startRoomTour({
        isHost: isHostRef.current,
        isRecorder: isRecorderRef.current,
        setView,
        t,
        onDone: () => {
          setOnboarded()
          setTourActive(false)
          tourRef.current = null
          setView(isRecorderRef.current ? 'record' : 'statements')
        },
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [connected])

  useEffect(() => () => { tourRef.current?.destroy() }, [])

  useEffect(() => {
    if (presence.votingNow <= 0) return undefined
    const t = setTimeout(() => setPresence((p) => ({ ...p, votingNow: 0 })), 8000)
    return () => clearTimeout(t)
  }, [presence])

  useEffect(() => {
    if (view !== 'results' || !connected) return
    requestResults()
    const interval = setInterval(requestResults, 5000)
    return () => clearInterval(interval)
  }, [view, connected])

  useEffect(() => {
    const timers = approveTimersRef.current
    if (!isRecorder) {
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
  }, [statements, autoApprove, heldIds, isRecorder])

  useEffect(() => {
    const timers = approveTimersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      if (cgTimeoutRef.current) clearTimeout(cgTimeoutRef.current)
      if (recommendationsTimeoutRef.current) clearTimeout(recommendationsTimeoutRef.current)
    }
  }, [])

  const joinPayloadRef = useRef({})
  joinPayloadRef.current = {
    name: displayName,
    language: roomLanguage,
    wantsHost: Boolean(wantsHost),
  }

  const handleWsMessageRef = useRef(() => {})

  handleWsMessageRef.current = (msg) => {
      switch (msg.type) {
        case 'joined': {
          participantIdRef.current = msg.participantId
          const host = Boolean(msg.isHost)
          const recorder = msg.recorderId === msg.participantId
          setIsHost(host)
          isHostRef.current = host
          setIsRecorder(recorder)
          isRecorderRef.current = recorder
          if (!msg.returning) {
            setView(recorder ? 'record' : 'statements')
          }
          setTranscript(msg.transcript || [])
          setStatements(msg.statements || [])
          setTopic(msg.topic || null)
          if (msg.publicId) setPublicId(msg.publicId)
          setRoomLanguage(msg.recorderLanguage || 'en')
          setVoteType(msg.voteType || 'binary')
          setVoteTypeLocked(!!msg.voteTypeLocked || !!msg.recording || (msg.transcript?.length > 0))
          if (msg.commonGroundMode) setCgMode(msg.commonGroundMode)
          else if (msg.commonGroundDepth) setCgMode(msg.commonGroundDepth === 'policy' ? 'policy' : 'generic')
          if (typeof msg.expiresAt === 'number') setExpiresAt(msg.expiresAt)
          if (typeof msg.votingOpen === 'boolean') setVotingOpen(msg.votingOpen)
          if (typeof msg.votingLifetimeHours === 'number') setVotingLifetimeHours(msg.votingLifetimeHours)
          setVotingExpiresAt(typeof msg.votingExpiresAt === 'number' ? msg.votingExpiresAt : null)
          if (Array.isArray(msg.votingActivity)) setVotingActivity(msg.votingActivity)
          if (msg.commonGroundHistory) {
            msg.commonGroundHistory.forEach((item) => cgSeenIdsRef.current.add(item.id))
            setCommonGroundHistory(msg.commonGroundHistory)
          }
          setParticipants(msg.participantsStatus || [])
          if (msg.presence) setPresence(msg.presence)
          if (typeof msg.autoApprove === 'boolean') setAutoApprove(msg.autoApprove)
          if (typeof msg.canAddStatement === 'boolean') setCanAddStatement(msg.canAddStatement)
          if (typeof msg.defaultCanAddStatement === 'boolean') setDefaultCanAddStatement(msg.defaultCanAddStatement)
          if (msg.recording) {
            setRecording(true)
            recordingRef.current = true
            if (recorder) {
              ensureMicPipelineRef.current().catch(() => {
                setCaptionError(t('errors.micBlockedHelp'))
              })
            }
          }
          break
        }
        case 'participants_status':
          setParticipants(msg.participants || [])
          break
        case 'permissions_updated':
          if (typeof msg.canAddStatement === 'boolean') setCanAddStatement(msg.canAddStatement)
          break
        case 'default_statement_permission_updated':
          if (typeof msg.allowed === 'boolean') setDefaultCanAddStatement(msg.allowed)
          break
        case 'voting_status_updated':
          if (typeof msg.votingOpen === 'boolean') setVotingOpen(msg.votingOpen)
          if (typeof msg.votingLifetimeHours === 'number') setVotingLifetimeHours(msg.votingLifetimeHours)
          setVotingExpiresAt(typeof msg.votingExpiresAt === 'number' ? msg.votingExpiresAt : null)
          if (Array.isArray(msg.votingActivity)) setVotingActivity(msg.votingActivity)
          break
        case 'voting_rejected':
          notify(APP_NAME, t('voting.closedToast'), { tag: 'voting-closed' })
          break
        case 'statement_submitted':
          setStatementSubmitted(true)
          break
        case 'presence':
          setPresence({ here: msg.here || 0, votingNow: msg.votingNow || 0 })
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
            setView((prev) => (prev === 'record' || prev === 'participants' || prev === 'settings' ? 'statements' : prev))
          } else if (!recorder) {
            setView((prev) => (prev === 'record' ? 'statements' : prev))
          }
          break
        }
        case 'topic_updated':
          setTopic(msg.topic || null)
          break
        case 'language_updated':
          setRoomLanguage(msg.language || 'en')
          break
        case 'participant_renamed':
          break
        case 'active_mic':
          break
        case 'session_expired':
          socketRef.current?.close()
          notify(APP_NAME, t('notify.expired'), { tag: 'expired', force: true })
          onLeaveRef.current()
          break
        case 'participant_joined':
        case 'participant_left':
          break
        case 'recording_started':
          setRecording(true)
          setVoteTypeLocked(true)
          recordingRef.current = true
          if (isRecorderRef.current) {
            ensureMicPipelineRef.current().catch(() => {
              setCaptionError(t('errors.micBlockedHelp'))
            })
          }
          notify(APP_NAME, t('notify.recordingStarted'), { tag: 'recording', duration: 4000 })
          break
        case 'recording_stopped':
          setRecording(false)
          recordingRef.current = false
          setPartialCaption(null)
          notify(APP_NAME, t('notify.recordingStopped'), { tag: 'recording', duration: 4000 })
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
          setCaptionError(msg.code ? t(`errors.${msg.code}`) : (msg.message || t('errors.captionsUnavailable')))
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
          if (msg.voteType) setVoteType(msg.voteType)
          break
        case 'vote_type_updated':
          setVoteType(msg.voteType || 'binary')
          break
        case 'vote_updated':
          setStatements((prev) =>
            prev.map((s) =>
              s.id === msg.statementId
                ? {
                    ...s,
                    agrees: msg.agrees,
                    disagrees: msg.disagrees,
                    hasVoted: msg.hasVoted,
                    myVote: msg.myVote,
                    lastVoteAt: typeof msg.lastVoteAt === 'number'
                      ? msg.lastVoteAt
                      : (s.lastVoteAt || Date.now() / 1000),
                  }
                : s
            )
          )
          break
        case 'results':
          setResults({ statements: msg.statements, voters: msg.voters })
          if (msg.commonGroundHistory) setCommonGroundHistory(msg.commonGroundHistory)
          if (msg.commonGroundMode) setCgMode(msg.commonGroundMode)
          else if (msg.commonGroundDepth) setCgMode(msg.commonGroundDepth === 'policy' ? 'policy' : 'generic')
          break
        case 'common_ground_mode_updated':
          setCgMode(msg.mode || DEFAULT_CG_MODE)
          break
        case 'common_ground_pending':
          setCgPending(true)
          setCgPendingMode(msg.mode || msg.depth || DEFAULT_CG_MODE)
          setCgError(null)
          break
        case 'common_ground_history': {
          if (cgTimeoutRef.current) clearTimeout(cgTimeoutRef.current)
          const history = msg.history || []
          if (msg.addedId && !cgSeenIdsRef.current.has(msg.addedId)) {
            cgSeenIdsRef.current.add(msg.addedId)
            const added = history.find((item) => item.id === msg.addedId)
            if (!isHostRef.current && added) {
              setCgPopup(msg.addedId)
            }
          }
          setCommonGroundHistory(history)
          setCgPending(false)
          setCgPendingMode(null)
          break
        }
        case 'common_ground_error':
          if (cgTimeoutRef.current) clearTimeout(cgTimeoutRef.current)
          setCgPending(false)
          setCgPendingMode(null)
          setCgError(msg.code ? t(`errors.${msg.code}`) : (msg.message || t('errors.cgFailed')))
          break
        case 'recommendations_pending':
          setRecommendationsPending(true)
          setRecommendationsError(null)
          break
        case 'recommendations_draft':
          if (recommendationsTimeoutRef.current) clearTimeout(recommendationsTimeoutRef.current)
          setRecommendationsPending(false)
          setRecommendationDrafts({
            unexploredTopics: msg.unexploredTopics || [],
            divisiveIssues: msg.divisiveIssues || [],
            proposedSolutions: msg.proposedSolutions || [],
          })
          break
        case 'recommendations_error':
          if (recommendationsTimeoutRef.current) clearTimeout(recommendationsTimeoutRef.current)
          setRecommendationsPending(false)
          setRecommendationsError(msg.code ? t(`errors.${msg.code}`) : (msg.message || t('errors.recommendationsFailed')))
          break
      }
  }

  useEffect(() => {
    const socket = createRoomSocket({
      sessionId,
      getJoinPayload: () => joinPayloadRef.current,
      onStatus: setConnStatus,
      onSocket: (ws) => { wsRef.current = ws },
      onMessage: (msg) => handleWsMessageRef.current(msg),
    })
    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
      wsRef.current = null
    }
  }, [sessionId])

  function teardownMic() {
    audioCleanupRef.current?.()
    audioCleanupRef.current = null
    streamRef.current = null
    audioContextRef.current = null
  }

  async function ensureMicPipeline() {
    if (streamRef.current && audioContextRef.current) {
      const track = streamRef.current.getAudioTracks()[0]
      if (track?.readyState === 'live' && !track.muted) {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume()
        }
        setCaptionError('')
        return
      }
      teardownMic()
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    const track = stream.getAudioTracks()[0]
    if (!track || track.readyState !== 'live') {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('Microphone unavailable')
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
      const pcm16 = encodePcm16(resampled)
      wsRef.current.send(JSON.stringify({
        type: 'audio_frame',
        audio: arrayBufferToBase64(pcm16),
      }))
    }

    track.onmute = () => setCaptionError(t('errors.micMuted'))
    track.onunmute = () => {
      if (recordingRef.current) setCaptionError('')
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    audioCleanupRef.current = () => {
      clearInterval(interval)
      track.onmute = null
      track.onunmute = null
      processor.disconnect()
      silentOutput.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      audioContext.close()
    }

    setCaptionError('')
  }

  ensureMicPipelineRef.current = ensureMicPipeline

  useEffect(() => {
    if (!isRecorder) {
      teardownMic()
    }
  }, [isRecorder])

  async function toggleRecording() {
    if (!isRecorder) return
    const nextRecording = !recording
    if (nextRecording) {
      try {
        await ensureMicPipeline()
      } catch (err) {
        console.error('Failed to start microphone:', err)
        setCaptionError(t('errors.micBlockedHelp'))
        notify(APP_NAME, t('errors.micBlockedHelp'), { tag: 'mic-blocked', force: true })
        return
      }
    }
    wsRef.current?.send(JSON.stringify({ type: 'set_recording', recording: nextRecording }))
  }

  function handleVote(statementId, vote) {
    if (!votingActiveRef.current) {
      notify(APP_NAME, t('voting.closedToast'), { tag: 'voting-closed' })
      return
    }
    wsRef.current?.send(JSON.stringify({ type: 'vote', statementId, vote }))
  }

  function handleSetVotingOpen(open) {
    setVotingOpen(open)
    wsRef.current?.send(JSON.stringify({ type: 'set_voting_open', open }))
  }

  function requestSetVotingOpen(open) {
    setConfirm({
      title: open ? t('confirm.resumeVotingTitle') : t('confirm.stopVotingTitle'),
      message: open ? t('confirm.resumeVotingMessage') : t('confirm.stopVotingMessage'),
      confirmLabel: open ? t('confirm.resumeVoting') : t('confirm.stopVoting'),
      danger: !open,
      onConfirm: () => handleSetVotingOpen(open),
    })
  }

  function handleSetVotingLifetime(hours) {
    setVotingLifetimeHours(hours)
    wsRef.current?.send(JSON.stringify({ type: 'set_voting_lifetime', hours }))
  }

  function handleToggleAutoApprove(value) {
    setAutoApprove(value)
    wsRef.current?.send(JSON.stringify({ type: 'set_auto_approve', autoApprove: value }))
  }

  function handleSetCgMode(mode) {
    setCgMode(mode)
    wsRef.current?.send(JSON.stringify({ type: 'set_common_ground_mode', mode }))
  }

  function handleToggleStatementPermission(targetId, allowed) {
    wsRef.current?.send(JSON.stringify({ type: 'set_statement_permission', participantId: targetId, allowed }))
  }

  function handleSetDefaultStatementPermission(allowed) {
    setDefaultCanAddStatement(allowed)
    wsRef.current?.send(JSON.stringify({ type: 'set_default_statement_permission', allowed }))
  }

  function handleToggleHost(targetId, makeHost) {
    wsRef.current?.send(JSON.stringify({ type: 'set_host', participantId: targetId, host: makeHost }))
  }

  function requestToggleHost(p) {
    setConfirm({
      title: p.isHost ? t('confirm.revokeHostTitle') : t('confirm.makeHostTitle', { name: p.name }),
      message: p.isHost
        ? t('confirm.revokeHostMessage', { name: p.name })
        : t('confirm.makeHostMessage', { name: p.name }),
      confirmLabel: p.isHost ? t('confirm.revokeHost') : t('confirm.makeHost'),
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
      title: isYou ? t('confirm.takeMicTitle') : t('confirm.giveMicTitle', { name: p.name }),
      message: isYou
        ? t('confirm.takeMicMessage')
        : t('confirm.giveMicMessage', { name: p.name }),
      confirmLabel: isYou ? t('confirm.takeMic') : t('confirm.giveMic'),
      danger: false,
      onConfirm: () => handleSetRecorder(p.id),
    })
  }

  function requestLeave() {
    setConfirm({
      title: t('confirm.leaveTitle'),
      message: t('confirm.leaveMessage'),
      confirmLabel: t('confirm.leave'),
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

  function handleLanguageChange(code) {
    setRoomLanguage(code)
    wsRef.current?.send(JSON.stringify({ type: 'set_language', language: code }))
    if (isRecorder) {
      saveSession({ sessionId, userName: displayName, userLanguage: code, wantsHost })
    }
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

  function requestCommonGround(analysis, mode = cgMode) {
    // Policy evidence is built on the server; generic still uses the Results cluster summary.
    if (mode !== 'policy' && !analysis) return
    if (cgTimeoutRef.current) clearTimeout(cgTimeoutRef.current)
    setCgPending(true)
    setCgPendingMode(mode)
    setCgError(null)
    const msg =
      mode === 'policy'
        ? { type: 'get_common_ground', mode }
        : { type: 'get_common_ground', analysis, mode }
    wsRef.current?.send(JSON.stringify(msg))
    cgTimeoutRef.current = setTimeout(() => {
      setCgPending(false)
      setCgPendingMode(null)
      setCgError(t('errors.cgTimeout'))
    }, 80000)
  }

  function endorseCommonGround(cgId) {
    if (!cgId) return
    wsRef.current?.send(JSON.stringify({ type: 'endorse_common_ground', id: cgId }))
  }

  function dismissCommonGround(cgId) {
    if (!cgId) return
    setCgError(null)
    wsRef.current?.send(JSON.stringify({ type: 'dismiss_common_ground', id: cgId }))
  }

  function voteCommonGround(cgId, vote, reason = '') {
    if (!cgId) return
    wsRef.current?.send(JSON.stringify({ type: 'vote_common_ground', id: cgId, vote, reason }))
  }

  function handleApprove(statementId) {
    wsRef.current?.send(JSON.stringify({ type: 'approve_statement', statementId }))
  }

  function handleReject(statementId) {
    const timer = approveTimersRef.current.get(statementId)
    if (timer) {
      clearTimeout(timer)
      approveTimersRef.current.delete(statementId)
    }
    wsRef.current?.send(JSON.stringify({ type: 'reject_statement', statementId }))
  }

  function handleAddStatement(text) {
    setStatementSubmitted(false)
    wsRef.current?.send(JSON.stringify({ type: 'add_statement', text }))
  }

  function handleEditStatement(statementId, text) {
    wsRef.current?.send(JSON.stringify({ type: 'edit_statement', statementId, text }))
  }

  function handleDeleteStatement(statement) {
    const voteTotal = (statement.agrees || 0) + (statement.disagrees || 0)
    setConfirm({
      title: t('statements.deleteConfirmTitle'),
      message: voteTotal > 0
        ? t('statements.deleteConfirmWithVotes', { count: voteTotal })
        : t('statements.deleteConfirmMessage'),
      confirmLabel: t('statements.deleteStatement'),
      danger: true,
      onConfirm: () => {
        wsRef.current?.send(JSON.stringify({ type: 'delete_statement', statementId: statement.id }))
        if (view === 'results') requestResults()
      },
    })
  }

  function requestRecommendations(count, analysis) {
    if (!analysis) return
    if (recommendationsTimeoutRef.current) clearTimeout(recommendationsTimeoutRef.current)
    setRecommendationsPending(true)
    setRecommendationsError(null)
    wsRef.current?.send(JSON.stringify({ type: 'generate_recommendations', count, analysis }))
    recommendationsTimeoutRef.current = setTimeout(() => {
      setRecommendationsPending(false)
      setRecommendationsError(t('errors.recommendationsTimeout'))
    }, 60000)
  }

  function publishRecommendations(texts) {
    wsRef.current?.send(JSON.stringify({ type: 'publish_tensions', texts }))
    setRecommendationDrafts(null)
    setRecommendationsError(null)
  }

  function clearRecommendationDrafts() {
    setRecommendationDrafts(null)
    setRecommendationsError(null)
  }

  function handleHold(statementId) {
    const timer = approveTimersRef.current.get(statementId)
    if (timer) {
      clearTimeout(timer)
      approveTimersRef.current.delete(statementId)
    }
    setHeldIds((prev) => new Set(prev).add(statementId))
  }

  const activeLanguage = getLanguage(roomLanguage) || getLanguage('en')
  const cgPopupItem = cgPopup ? commonGroundHistory.find((item) => item.id === cgPopup) : null

  function openCommonGroundResults() {
    setView('results')
    setCgPopup(null)
  }

  function updateTabsScrollHint() {
    const el = tabsScrollRef.current
    const wrap = tabsWrapRef.current
    if (!el || !wrap) return
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
    const overflowing = el.scrollWidth > el.clientWidth + 4
    wrap.classList.toggle('scroll-end', atEnd || !overflowing)
  }

  useEffect(() => {
    updateTabsScrollHint()
    window.addEventListener('resize', updateTabsScrollHint)
    return () => window.removeEventListener('resize', updateTabsScrollHint)
  }, [isHost, isRecorder])

  return (
    <div className={`room${view === 'record' ? ' room-record' : ''}`}>
      <div className="room-top">
        <div className="room-bar">
          <div className="room-status">
            <span
              className={`status-dot ${connStatus === 'live' ? 'online' : connStatus === 'reconnecting' ? 'reconnecting' : 'offline'}`}
              aria-hidden="true"
            />
            <span className="status-text" data-testid="conn-status">
              {connStatus === 'live' && t('room.status.live')}
              {connStatus === 'connecting' && t('room.status.connecting')}
              {connStatus === 'reconnecting' && t('room.status.reconnecting')}
              {connStatus === 'offline' && t('room.status.disconnected')}
            </span>
            {isHost && <span className="host-badge" data-testid="host-badge">{t('room.hostBadge')}</span>}
          </div>
          <div className="room-actions">
            <span className="room-lang-pill" data-testid="room-language" title={activeLanguage.label}>
              <span className="room-lang-flag" aria-hidden="true">{activeLanguage.flag}</span>
              <span className="room-lang-text">{activeLanguage.label}</span>
            </span>
            <ThemeToggle />
            <button className="icon-btn" onClick={() => setShowShare(true)} data-testid="share-btn">
              {t('room.share')}
            </button>
            <button className="link-btn" onClick={requestLeave} data-testid="leave-btn">{t('room.leave')}</button>
          </div>
        </div>

        <div className="room-subbar">
          <button
            className="code-pill"
            onClick={() => setShowShare(true)}
            title={t('room.shareSession')}
            data-testid="code-pill"
          >
            <span className="code-pill-label">{t('room.code')}</span>
            <span className="code-pill-value">{sessionId}</span>
          </button>
          {presence.here > 0 && (
            <span className="presence-pill" data-testid="presence-pill">
              <span className="presence-here">
                <span className="presence-here-dot" aria-hidden="true" />
                {t('room.here', { count: presence.here })}
              </span>
              {presence.votingNow > 0 && (
                <span className="presence-voting" data-testid="presence-voting">
                  <span className="presence-voting-dot" aria-hidden="true" />
                  {t('room.voting', { count: presence.votingNow })}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="room-fields">
          <div className="field-block" data-testid="topic-field">
            <span className="field-tag">{t('room.topic')}</span>
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
                  placeholder={t('room.topicPlaceholder')}
                  aria-label={t('room.editTopic')}
                  data-testid="topic-edit-input"
                />
                <button className="icon-btn sm" onClick={saveTopic} data-testid="topic-save-btn">{t('common.save')}</button>
              </div>
            ) : isHost ? (
              <button
                className="field-value editable"
                onClick={startEditTopic}
                title={t('room.editTopic')}
                data-testid="topic-edit-btn"
              >
                <span className={`field-value-text ${topic ? '' : 'placeholder'}`}>
                  {topic || t('room.addTopic')}
                </span>
                <EditIcon />
              </button>
            ) : (
              <span className="field-value" data-testid="room-topic">
                <span className={`field-value-text ${topic ? '' : 'placeholder'}`}>
                  {topic || t('room.noTopic')}
                </span>
              </span>
            )}
          </div>

          <div className="field-block" data-testid="room-user">
            <span className="field-tag">{t('room.yourName')}</span>
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
                  aria-label={t('room.editName')}
                  data-testid="name-edit-input"
                />
                <button className="icon-btn sm" onClick={saveDisplayName} data-testid="name-save-btn">{t('common.save')}</button>
              </div>
            ) : (
              <button
                className="field-value editable"
                onClick={startEditName}
                title={t('room.editName')}
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
        <ShareModal sessionId={sessionId} topic={topic} publicId={publicId} onClose={() => setShowShare(false)} />
      )}

      {cgPopupItem && !isHost && (
        <CommonGroundPopup
          item={cgPopupItem}
          onView={openCommonGroundResults}
          onClose={() => setCgPopup(null)}
          onVote={voteCommonGround}
        />
      )}

      <div className="tabs-wrap" ref={tabsWrapRef} data-testid="tabs-wrap">
      <div className="tabs" ref={tabsScrollRef} onScroll={updateTabsScrollHint}>
        {isRecorder && (
          <button
            className={`tab ${view === 'record' ? 'active' : ''}`}
            onClick={() => setView('record')}
            data-testid="tab-record"
          >
            {t('tabs.record')}
          </button>
        )}
        <button
          className={`tab ${view === 'statements' ? 'active' : ''}`}
          onClick={() => setView('statements')}
          data-testid="tab-vote"
        >
          {t('tabs.vote')}
          {isHost && pendingCount > 0 && (
            <span className="badge pending" data-testid="pending-badge">{pendingCount}</span>
          )}
          {unvotedCount > 0 && <span className="badge">{unvotedCount}</span>}
        </button>
        <button
          className={`tab ${view === 'results' ? 'active' : ''}`}
          onClick={() => setView('results')}
        >
          {t('tabs.results')}
        </button>
        {isHost && (
          <button
            className={`tab ${view === 'participants' ? 'active' : ''}`}
            onClick={() => setView('participants')}
            data-testid="tab-participants"
          >
            {t('tabs.participants')}
            {participants.length > 0 && <span className="badge">{participants.length}</span>}
          </button>
        )}
        {isHost && (
          <button
            className={`tab ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            data-testid="tab-settings"
          >
            {t('tabs.settings')}
          </button>
        )}
      </div>
        <span className="tabs-scroll-hint" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      {view === 'record' && (
        <div className="record-view" data-testid="record-view">
          <button
            className={`record-btn ${recording ? 'active' : ''}`}
            onClick={toggleRecording}
            disabled={!connected || !isRecorder}
          >
            <span className="record-dot" />
            {isRecorder ? (recording ? t('room.stop') : t('room.record')) : t('room.listening')}
          </button>

          <TranscriptPanel entries={tourActive ? TOUR_TRANSCRIPT : transcript} partial={tourActive ? null : partialCaption} error={tourActive ? '' : captionError} />
        </div>
      )}
      {view === 'statements' && (
        <StatementsPanel
          statements={tourActive ? TOUR_STATEMENTS : statements}
          onVote={tourActive ? noop : handleVote}
          isHost={isHost}
          isRecorder={isRecorder}
          onApprove={tourActive ? noop : handleApprove}
          onReject={tourActive ? noop : handleReject}
          onEditStatement={tourActive ? noop : handleEditStatement}
          onDeleteStatement={tourActive ? noop : handleDeleteStatement}
          onAddStatement={tourActive ? noop : handleAddStatement}
          canAddStatement={canAddStatement}
          statementSubmitted={statementSubmitted}
          onClearStatementSubmitted={() => setStatementSubmitted(false)}
          autoApprove={autoApprove}
          heldIds={heldIds}
          onHold={tourActive ? noop : handleHold}
          voteType={voteType}
          votingActive={tourActive ? true : votingActive}
        />
      )}
      {view === 'results' && (
        <ResultsPanel
          statements={tourActive ? TOUR_STATEMENTS : statements}
          results={tourActive ? TOUR_RESULTS : results}
          isHost={isHost}
          topic={tourActive ? 'Essentials for a fair society' : topic}
          sessionId={sessionId}
          voteType={voteType}
          commonGroundHistory={tourActive ? TOUR_COMMON_GROUND_HISTORY : commonGroundHistory}
          cgPending={tourActive ? false : cgPending}
          cgPendingMode={tourActive ? null : cgPendingMode}
          cgError={tourActive ? null : cgError}
          defaultMode={cgMode}
          onGenerateCommonGround={tourActive ? noop : requestCommonGround}
          onDismissCommonGround={tourActive ? noop : dismissCommonGround}
          onVoteCommonGround={tourActive ? noop : voteCommonGround}
          onEndorseCommonGround={tourActive ? noop : endorseCommonGround}
          recommendationsPending={tourActive ? false : recommendationsPending}
          recommendationsError={tourActive ? null : recommendationsError}
          recommendationDrafts={tourActive ? null : recommendationDrafts}
          onGenerateRecommendations={tourActive ? noop : requestRecommendations}
          onPublishRecommendations={tourActive ? noop : publishRecommendations}
          onClearRecommendationDrafts={tourActive ? noop : clearRecommendationDrafts}
        />
      )}
      {view === 'participants' && isHost && (
        <ParticipantsPanel
          participants={tourActive ? TOUR_PARTICIPANTS : participants}
          currentId={tourActive ? 'you' : participantIdRef.current}
          canManageHosts={isHost}
          onToggleHost={requestToggleHost}
          onSetRecorder={requestSetRecorder}
          onToggleStatementPermission={handleToggleStatementPermission}
        />
      )}
      {view === 'settings' && isHost && (
        <SettingsPanel
          roomLanguage={roomLanguage}
          onLanguageChange={handleLanguageChange}
          cgMode={cgMode}
          onCgModeChange={handleSetCgMode}
          autoApprove={autoApprove}
          onToggleAutoApprove={handleToggleAutoApprove}
          voteType={voteType}
          voteTypeLocked={voteTypeLocked}
          defaultCanAddStatement={defaultCanAddStatement}
          onToggleDefaultStatementPermission={handleSetDefaultStatementPermission}
          votingOpen={votingOpen}
          votingLifetimeHours={votingLifetimeHours}
          votingExpiresAt={votingExpiresAt}
          votingActivity={votingActivity}
          onSetVotingOpen={requestSetVotingOpen}
          onSetVotingLifetime={handleSetVotingLifetime}
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
