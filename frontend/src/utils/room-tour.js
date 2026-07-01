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

function buildSteps({ isHost, isRecorder, baseView, t }) {
  const steps = []
  const roleKey = isHost ? 'host' : 'guest'

  const push = (step) => steps.push(step)
  const pop = (title, description, extra = {}) => ({
    title,
    description,
    ...extra,
  })

  push({
    view: baseView,
    popover: pop(
      t('tour.welcomeTitle'),
      t(`tour.welcomeDesc_${roleKey}`),
    ),
  })

  push({
    view: baseView,
    element: '[data-testid="share-btn"]',
    popover: pop(t('tour.inviteTitle'), t('tour.inviteDesc')),
  })

  const tabNames = [
    isRecorder && t('tabs.record'),
    t('tabs.vote'),
    t('tabs.results'),
    isHost && t('tabs.participants'),
    isHost && t('tabs.settings'),
  ].filter(Boolean)
  const tabList =
    tabNames.length > 1
      ? `${tabNames.slice(0, -1).join(', ')} ${t('tour.and')} ${tabNames[tabNames.length - 1]}`
      : tabNames[0]
  push({
    view: baseView,
    element: '.tabs',
    popover: pop(t('tour.moveTitle'), t('tour.moveDesc', { tabs: tabList })),
  })

  if (isRecorder) {
    push({
      view: 'record',
      element: '.record-btn',
      popover: pop(t('tour.captureTitle'), t('tour.captureDesc')),
    })
    push({
      view: 'record',
      element: '.transcript',
      popover: pop(t('tour.transcriptTitle'), t('tour.transcriptDesc')),
    })
  }

  push({
    view: 'statements',
    element: '[data-testid="host-composer"]',
    popover: isHost
      ? pop(t('tour.curateTitle'), t('tour.curateDesc'))
      : pop(t('tour.addGuestTitle'), t('tour.addGuestDesc')),
  })

  push({
    view: 'statements',
    element: '.swipe-area',
    popover: pop(t('tour.voteTitle'), t('tour.voteDesc')),
  })

  push({
    view: 'results',
    element: '.results-panel',
    popover: pop(t('tour.standsTitle'), t('tour.standsDesc')),
  })

  push({
    view: 'results',
    element: '[data-testid="common-ground"]',
    popover: pop(t('tour.cgTitle'), t('tour.cgDesc')),
  })

  if (isHost) {
    push({
      view: 'participants',
      element: '.participants-panel',
      popover: pop(t('tour.manageTitle'), t('tour.manageDesc')),
    })
  }

  push({
    view: baseView,
    popover: pop(t('tour.finishTitle'), t(`tour.finishDesc_${roleKey}`)),
  })

  return steps
}

export function startRoomTour({ isHost = false, isRecorder = false, setView, onDone, t }) {
  const baseView = isRecorder ? 'record' : 'statements'
  const steps = buildSteps({ isHost, isRecorder, baseView, t })
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
    smoothScroll: true,
    overlayColor: '#0b1220',
    overlayOpacity: 0.72,
    stagePadding: 8,
    stageRadius: 14,
    popoverClass: 'ds-tour-popover',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.back'),
    doneBtnText: t('tour.done'),
    progressText: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
    steps,
    onPopoverRender: (popover) => {
      const skip = document.createElement('button')
      skip.innerText = t('tour.skip')
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
