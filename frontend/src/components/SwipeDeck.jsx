import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 500
const VISIBLE = 3

function vibrate(ms) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms)
  }
}

function isTypingTarget() {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

export default function SwipeDeck({ statements, onVote, votedCount = 0 }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 0, 240], [-14, 0, 14])

  const clamp = (v) => Math.min(Math.max(v, 0), 1)
  const ramp = (v) => clamp((Math.abs(v) - 16) / 60)
  const horizActive = ([xv, yv]) => Math.abs(xv) >= Math.abs(yv)

  const agreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv > 0 ? ramp(xv) : 0))
  const disagreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv < 0 ? ramp(xv) : 0))
  const passOpacity = useTransform([x, y], ([xv, yv]) => (!horizActive([xv, yv]) && yv > 0 ? ramp(yv) : 0))

  const agreeStampScale = useTransform(agreeOpacity, [0, 1], [0.6, 1.1])
  const disagreeStampScale = useTransform(disagreeOpacity, [0, 1], [0.6, 1.1])
  const passStampScale = useTransform(passOpacity, [0, 1], [0.6, 1.1])

  const agreeBtnScale = useTransform(agreeOpacity, [0, 1], [1, 1.22])
  const disagreeBtnScale = useTransform(disagreeOpacity, [0, 1], [1, 1.22])
  const passBtnScale = useTransform(passOpacity, [0, 1], [1, 1.22])

  const flinging = useRef(false)
  const hinted = useRef(false)
  const hintAnim = useRef(null)

  const top = statements[0]
  const total = votedCount + statements.length
  const current = Math.min(votedCount + 1, total)
  const progressPct = total ? (votedCount / total) * 100 : 0

  useEffect(() => {
    flinging.current = false
    x.set(0)
    y.set(0)
  }, [top?.id, x, y])

  useEffect(() => {
    if (!top || hinted.current) return
    hinted.current = true
    hintAnim.current = animate(x, [0, -46, 46, -26, 0], {
      duration: 1.15,
      ease: 'easeInOut',
      delay: 0.45,
    })
    return () => hintAnim.current?.stop()
  }, [top, x])

  const stopHint = () => hintAnim.current?.stop()

  const flyOut = (choice) => {
    if (!top || flinging.current) return
    flinging.current = true
    stopHint()
    vibrate(choice === 'pass' ? 8 : 16)
    if (choice === 'pass') {
      const distance = (typeof window !== 'undefined' ? window.innerHeight : 800) * 1.1
      animate(y, distance, {
        type: 'spring',
        stiffness: 260,
        damping: 30,
        onComplete: () => onVote(top.id, 'pass'),
      })
    } else {
      const dir = choice === 'agree' ? 1 : -1
      const distance = (typeof window !== 'undefined' ? window.innerWidth : 600) * 1.35
      animate(x, dir * distance, {
        type: 'spring',
        stiffness: 260,
        damping: 30,
        onComplete: () => onVote(top.id, choice),
      })
    }
  }

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info
    const downSwipe = offset.y > SWIPE_DISTANCE || velocity.y > SWIPE_VELOCITY
    if (downSwipe && offset.y > Math.abs(offset.x)) {
      flyOut('pass')
      return
    }
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) flyOut('agree')
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) flyOut('disagree')
    else {
      animate(x, 0, { type: 'spring', stiffness: 340, damping: 32 })
      animate(y, 0, { type: 'spring', stiffness: 340, damping: 32 })
    }
  }

  useEffect(() => {
    if (!top) return
    const onKey = (e) => {
      if (isTypingTarget()) return
      if (e.key === 'ArrowRight') { e.preventDefault(); flyOut('agree') }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); flyOut('disagree') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); flyOut('pass') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top?.id])

  if (!top) return null

  const behind = statements.slice(1, VISIBLE)

  return (
    <div className="swipe-area" data-testid="swipe-deck">
      <div className="swipe-progress-head">
        <span className="swipe-counter"><strong>{current}</strong> of {total}</span>
        <span className="swipe-progress-text" data-testid="swipe-remaining">{statements.length} left</span>
      </div>
      <div className="swipe-progress-bar" aria-hidden="true">
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <div className="swipe-stack">
        {behind.map((s, i) => {
          const pos = i + 1
          return (
            <motion.div
              key={s.id}
              className="swipe-card behind"
              initial={false}
              animate={{ scale: 1 - pos * 0.06, y: pos * 18, opacity: 1 - pos * 0.18 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              style={{ zIndex: VISIBLE - pos }}
            >
              <p className="swipe-text">{s.text}</p>
            </motion.div>
          )
        })}

        <motion.div
          key={top.id}
          className="swipe-card top"
          style={{ x, y, rotate, zIndex: VISIBLE }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.65}
          onDragStart={stopHint}
          onDragEnd={handleDragEnd}
          initial={{ scale: 0.94, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          whileTap={{ cursor: 'grabbing' }}
          data-testid="swipe-card-top"
        >
          <motion.span className="swipe-tint agree" style={{ opacity: agreeOpacity }} aria-hidden="true" />
          <motion.span className="swipe-tint disagree" style={{ opacity: disagreeOpacity }} aria-hidden="true" />
          <motion.span className="swipe-tint pass" style={{ opacity: passOpacity }} aria-hidden="true" />
          <motion.span className="swipe-stamp agree" style={{ opacity: agreeOpacity, scale: agreeStampScale }}>AGREE</motion.span>
          <motion.span className="swipe-stamp disagree" style={{ opacity: disagreeOpacity, scale: disagreeStampScale }}>DISAGREE</motion.span>
          <motion.span className="swipe-stamp pass" style={{ opacity: passOpacity, scale: passStampScale }}>PASS</motion.span>
          {top.custom && <span className="card-tag">Custom</span>}
          <p className="swipe-text">{top.text}</p>
          <span className="swipe-hint-row" aria-hidden="true">
            <span className="swipe-grip"><span /><span /><span /></span>
            <span className="swipe-hint-text">Drag, tap, or use arrow keys</span>
          </span>
        </motion.div>
      </div>

      <div className="swipe-controls">
        <div className="swipe-action">
          <motion.button
            type="button"
            className="swipe-circle disagree"
            style={{ scale: disagreeBtnScale }}
            onClick={() => flyOut('disagree')}
            aria-label="Disagree"
            data-testid="swipe-disagree"
          >
            ✕
          </motion.button>
          <span className="swipe-action-label disagree">Disagree</span>
        </div>

        <div className="swipe-action">
          <motion.button
            type="button"
            className="swipe-circle pass"
            style={{ scale: passBtnScale }}
            onClick={() => flyOut('pass')}
            aria-label="Pass"
            data-testid="swipe-pass"
          >
            ↓
          </motion.button>
          <span className="swipe-action-label pass">Pass</span>
        </div>

        <div className="swipe-action">
          <motion.button
            type="button"
            className="swipe-circle agree"
            style={{ scale: agreeBtnScale }}
            onClick={() => flyOut('agree')}
            aria-label="Agree"
            data-testid="swipe-agree"
          >
            ✓
          </motion.button>
          <span className="swipe-action-label agree">Agree</span>
        </div>
      </div>
    </div>
  )
}
