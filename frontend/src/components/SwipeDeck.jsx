import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 500
const VISIBLE = 3

export default function SwipeDeck({ statements, onVote }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-220, 0, 220], [-13, 0, 13])

  const clamp = (v) => Math.min(Math.max(v, 0), 1)
  const ramp = (v) => clamp((Math.abs(v) - 20) / 55)
  const horizActive = ([xv, yv]) => Math.abs(xv) >= Math.abs(yv)

  const agreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv > 0 ? ramp(xv) : 0))
  const disagreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv < 0 ? ramp(xv) : 0))
  const passOpacity = useTransform([x, y], ([xv, yv]) => (!horizActive([xv, yv]) && yv > 0 ? ramp(yv) : 0))
  const tintAgree = agreeOpacity
  const tintDisagree = disagreeOpacity
  const flinging = useRef(false)
  const hinted = useRef(false)
  const hintAnim = useRef(null)

  const top = statements[0]

  useEffect(() => {
    flinging.current = false
    x.set(0)
    y.set(0)
  }, [top?.id, x, y])

  useEffect(() => {
    if (!top || hinted.current) return
    hinted.current = true
    hintAnim.current = animate(x, [0, -52, 52, -30, 0], {
      duration: 1.2,
      ease: 'easeInOut',
      delay: 0.45,
    })
    return () => hintAnim.current?.stop()
  }, [top, x])

  const stopHint = () => hintAnim.current?.stop()

  const vote = (choice) => {
    if (!top || flinging.current) return
    flinging.current = true
    const dir = choice === 'agree' ? 1 : -1
    const distance = (typeof window !== 'undefined' ? window.innerWidth : 600) * 1.3
    animate(x, dir * distance, {
      type: 'spring',
      stiffness: 240,
      damping: 30,
      onComplete: () => onVote(top.id, choice),
    })
  }

  const pass = () => {
    if (!top || flinging.current) return
    flinging.current = true
    stopHint()
    const distance = (typeof window !== 'undefined' ? window.innerHeight : 800) * 1.1
    animate(y, distance, {
      type: 'spring',
      stiffness: 240,
      damping: 30,
      onComplete: () => onVote(top.id, 'pass'),
    })
  }

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info
    const downSwipe = offset.y > SWIPE_DISTANCE || velocity.y > SWIPE_VELOCITY
    if (downSwipe && offset.y > Math.abs(offset.x)) {
      pass()
      return
    }
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) vote('agree')
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) vote('disagree')
    else {
      animate(x, 0, { type: 'spring', stiffness: 320, damping: 32 })
      animate(y, 0, { type: 'spring', stiffness: 320, damping: 32 })
    }
  }

  if (!top) return null

  const behind = statements.slice(1, VISIBLE)

  return (
    <div className="swipe-area" data-testid="swipe-deck">
      <div className="swipe-guide">
        <span className="swipe-guide-side disagree">
          <span className="swipe-arrow" aria-hidden="true">←</span> Disagree
        </span>
        <span className="swipe-guide-mid">Swipe to vote</span>
        <span className="swipe-guide-side agree">
          Agree <span className="swipe-arrow" aria-hidden="true">→</span>
        </span>
      </div>

      <div className="swipe-stack">
        {behind.map((s, i) => {
          const pos = i + 1
          return (
            <div
              key={s.id}
              className="swipe-card behind"
              style={{
                transform: `scale(${1 - pos * 0.05}) translateY(${pos * 16}px)`,
                zIndex: VISIBLE - pos,
              }}
            >
              <p className="swipe-text">{s.text}</p>
            </div>
          )
        })}

        <motion.div
          key={top.id}
          className="swipe-card top"
          style={{ x, y, rotate, zIndex: VISIBLE }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.7}
          onDragStart={stopHint}
          onDragEnd={handleDragEnd}
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          whileTap={{ cursor: 'grabbing' }}
          data-testid="swipe-card-top"
        >
          <motion.span className="swipe-tint agree" style={{ opacity: tintAgree }} aria-hidden="true" />
          <motion.span className="swipe-tint disagree" style={{ opacity: tintDisagree }} aria-hidden="true" />
          <motion.span className="swipe-tint pass" style={{ opacity: passOpacity }} aria-hidden="true" />
          <motion.span className="swipe-stamp agree" style={{ opacity: agreeOpacity }}>AGREE</motion.span>
          <motion.span className="swipe-stamp disagree" style={{ opacity: disagreeOpacity }}>DISAGREE</motion.span>
          <motion.span className="swipe-stamp pass" style={{ opacity: passOpacity }}>PASS</motion.span>
          {top.custom && <span className="card-tag">Custom</span>}
          <p className="swipe-text">{top.text}</p>
          <span className="swipe-grip" aria-hidden="true">
            <span /><span /><span />
          </span>
        </motion.div>
      </div>

      <div className="swipe-controls">
        <div className="swipe-action">
          <button
            type="button"
            className="swipe-circle disagree"
            onClick={() => vote('disagree')}
            aria-label="Disagree"
            data-testid="swipe-disagree"
          >
            ✕
          </button>
          <span className="swipe-action-label disagree">Disagree</span>
        </div>

        <div className="swipe-action">
          <button
            type="button"
            className="swipe-circle pass"
            onClick={pass}
            aria-label="Pass"
            data-testid="swipe-pass"
          >
            ↓
          </button>
          <span className="swipe-action-label pass">Pass</span>
        </div>

        <div className="swipe-action">
          <button
            type="button"
            className="swipe-circle agree"
            onClick={() => vote('agree')}
            aria-label="Agree"
            data-testid="swipe-agree"
          >
            ✓
          </button>
          <span className="swipe-action-label agree">Agree</span>
        </div>
      </div>

      <span className="swipe-progress" data-testid="swipe-remaining">{statements.length} left</span>
    </div>
  )
}
