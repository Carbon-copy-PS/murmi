import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const now = Math.floor(Date.now() / 1000)

export const TOUR_TRANSCRIPT = [
  { id: 't1', speaker: 'Amara', timestamp: now - 90, text: 'Clean water is a basic human right, not a privilege.' },
  { id: 't2', speaker: 'Daniel', timestamp: now - 60, text: 'Agreed — but who funds the pipes that deliver it?' },
  { id: 't3', speaker: 'Lena', timestamp: now - 30, text: 'Communities can co-own it; that keeps it accountable.' },
]

export const TOUR_STATEMENTS = [
  { id: 'd1', text: 'Everyone deserves access to clean drinking water.', approved: true, hasVoted: false, custom: false, agrees: 7, disagrees: 1 },
  { id: 'd2', text: 'Education should be free for every child.', approved: true, hasVoted: false, custom: false, agrees: 6, disagrees: 2 },
  { id: 'd3', text: 'We must protect the planet for future generations.', approved: true, hasVoted: false, custom: false, agrees: 8, disagrees: 1 },
]

export const TOUR_RESULTS = {
  statements: [
    { id: 'd1', text: 'Everyone deserves access to clean drinking water.', custom: false },
    { id: 'd2', text: 'Education should be free for every child.', custom: false },
    { id: 'd3', text: 'We must protect the planet for future generations.', custom: false },
    { id: 'd4', text: 'Fund it through shared public infrastructure.', custom: false },
  ],
  voters: [
    { key: 'you', isYou: true, votes: { d1: 'agree', d2: 'agree', d3: 'agree', d4: 'disagree' } },
    { key: 'p1', isYou: false, votes: { d1: 'agree', d2: 'agree', d3: 'agree', d4: 'agree' } },
    { key: 'p2', isYou: false, votes: { d1: 'agree', d2: 'agree', d3: 'agree', d4: 'disagree' } },
    { key: 'p3', isYou: false, votes: { d1: 'agree', d2: 'disagree', d3: 'agree', d4: 'agree' } },
    { key: 'p4', isYou: false, votes: { d1: 'agree', d2: 'agree', d3: 'disagree', d4: 'disagree' } },
    { key: 'p5', isYou: false, votes: { d1: 'disagree', d2: 'disagree', d3: 'agree', d4: 'disagree' } },
    { key: 'p6', isYou: false, votes: { d1: 'agree', d2: 'agree', d3: 'agree', d4: 'agree' } },
    { key: 'p7', isYou: false, votes: { d1: 'agree', d2: 'disagree', d3: 'agree', d4: 'disagree' } },
  ],
}

export const TOUR_COMMON_GROUND_HISTORY = [{
  id: 'tour-cg-1',
  depth: 'basic',
  generatedAt: Date.now() / 1000 - 3600,
  generatedByName: 'You',
  voterCountAtGeneration: 8,
  statementCountAtGeneration: 4,
  groupStatement: 'The room broadly agrees that access to water, education, and a healthy planet are shared priorities, while differing on how they should be funded.',
  bridgingProposal: 'Pilot community-owned funding for one essential service and review the results together.',
  commonGround: ['Essentials like water and education matter to everyone.', 'Future generations deserve protection.'],
  divides: ['How to pay for it — public vs shared funding.'],
  votes: { agree: 6, disagree: 2, total: 8 },
  myVote: null,
  myReason: '',
}]

export const TOUR_PARTICIPANTS = [
  { id: 'you', name: 'You', isHost: true, isRecorder: true, language: 'en', votesRequired: 3, votesCast: 3 },
  { id: 'p1', name: 'Amara Okafor', isHost: false, isRecorder: false, language: 'en', votesRequired: 3, votesCast: 3 },
  { id: 'p2', name: 'Daniel Roth', isHost: false, isRecorder: false, language: 'de', votesRequired: 3, votesCast: 1 },
  { id: 'p3', name: 'Lena Meier', isHost: false, isRecorder: false, language: 'fr', votesRequired: 3, votesCast: 0 },
]

function buildSteps({ isHost, isRecorder, baseView }) {
  const steps = []

  steps.push({
    view: baseView,
    element: '[data-testid="code-pill"]',
    popover: {
      title: 'Your room code',
      description: 'Anyone with this 6-character code can join your session. Tap it any time to share.',
    },
  })

  steps.push({
    view: baseView,
    element: '[data-testid="share-btn"]',
    popover: {
      title: 'Invite the room',
      description: 'Share a link or QR code so people can hop in from their own phone or laptop.',
    },
  })

  const tabNames = [isRecorder && 'Record', 'Vote', 'Results', isHost && 'Participants'].filter(Boolean)
  const tabList =
    tabNames.length > 1
      ? `${tabNames.slice(0, -1).join(', ')} and ${tabNames[tabNames.length - 1]}`
      : tabNames[0]
  steps.push({
    view: baseView,
    element: '.tabs',
    popover: {
      title: 'Move around',
      description: `Switch between ${tabList} here. We’ll walk through each one.`,
    },
  })

  if (isRecorder) {
    steps.push({
      view: 'record',
      element: '.record-btn',
      popover: {
        title: 'Capture the room',
        description: 'Press Record and only your device streams audio. Live captions show up below as people speak.',
      },
    })
    steps.push({
      view: 'record',
      element: '.transcript',
      popover: {
        title: 'Live transcript',
        description: 'Completed turns are transcribed here — and the AI turns them into claims to vote on.',
      },
    })
  }

  if (isHost) {
    steps.push({
      view: 'statements',
      element: '[data-testid="host-composer"]',
      popover: {
        title: 'Add & curate claims',
        description: 'Write your own statements, or approve and reject the ones AI suggests before they go live.',
      },
    })
  }

  steps.push({
    view: 'statements',
    element: '.swipe-area',
    popover: {
      title: 'Cast your vote',
      description: 'Your turn — swipe right to agree, left to disagree, down for neutral. Try it now! Buttons and arrow keys work too.',
    },
  })

  steps.push({
    view: 'results',
    element: '.results-panel',
    popover: {
      title: 'Where the room stands',
      description: 'Opinion clusters and vote splits update live, so you can see what unites or divides the room.',
    },
  })

  steps.push({
    view: 'results',
    element: '[data-testid="common-ground"]',
    popover: {
      title: 'Find common ground',
      description: 'An AI mediator drafts a statement the whole room could share — and everyone can vote on it.',
    },
  })

  if (isHost) {
    steps.push({
      view: 'participants',
      element: '.participants-panel',
      popover: {
        title: 'Manage the room',
        description: 'Track who has voted, hand over the mic, or promote a co-host.',
      },
    })
  }

  return steps
}

export function startRoomTour({ isHost = false, isRecorder = false, setView, onDone }) {
  const baseView = isRecorder ? 'record' : 'statements'
  const steps = buildSteps({ isHost, isRecorder, baseView })
  const baseViewRef = { current: baseView }
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    onDone?.()
  }

  const driverObj = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.65,
    stagePadding: 6,
    stageRadius: 12,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it!',
    progressText: 'Step {{current}} of {{total}}',
    steps,
    onPopoverRender: (popover) => {
      const skip = document.createElement('button')
      skip.innerText = 'Skip tour'
      skip.className = 'driver-skip-btn'
      skip.addEventListener('click', () => driverObj.destroy())
      popover.footerButtons.prepend(skip)
    },
    onNextClick: (_el, _step, { state }) => {
      const idx = state.activeIndex ?? 0
      if (idx >= steps.length - 1) {
        driverObj.destroy()
        return
      }
      const nextView = steps[idx + 1]?.view
      if (nextView && nextView !== baseViewRef.current) {
        baseViewRef.current = nextView
        setView(nextView)
        setTimeout(() => driverObj.moveNext(), 160)
      } else {
        driverObj.moveNext()
      }
    },
    onPrevClick: (_el, _step, { state }) => {
      const idx = state.activeIndex ?? 0
      if (idx <= 0) return
      const prevView = steps[idx - 1]?.view
      if (prevView && prevView !== baseViewRef.current) {
        baseViewRef.current = prevView
        setView(prevView)
        setTimeout(() => driverObj.movePrevious(), 160)
      } else {
        driverObj.movePrevious()
      }
    },
    onDestroyed: finish,
  })

  setView(baseView)
  setTimeout(() => driverObj.drive(), 80)

  return driverObj
}
