import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'motion/react'
import { StatementTags } from './statement-tags'

const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 500
const STRONG_DISTANCE = 215
const STRONG_VELOCITY = 1100
const VISIBLE = 3

function SwipeAction({ tone, strong = false, lit, btnScale, onClick, glyph, label, lines, testId }) {
  const highlight = useTransform(lit, (v) => v * 0.9)

  return (
    <motion.div
      className={`swipe-action ${tone}${strong ? ' strong' : ''}`}
      data-testid={`${testId}-action`}
    >
      <div className={`swipe-action-btn-wrap ${tone}${strong ? ' strong' : ''}`}>
        <motion.span className="swipe-action-highlight" style={{ opacity: highlight }} aria-hidden="true" />
        <button
          type="button"
          className={`swipe-circle ${tone}${strong ? ' strong' : ''}`}
          onClick={onClick}
          aria-label={lines ? `${lines[0]} ${lines[1]}` : label}
          data-testid={testId}
        >
          <motion.span className="swipe-circle-glyph" style={{ scale: btnScale }} aria-hidden="true">
            {glyph}
          </motion.span>
        </button>
      </div>
      {lines ? (
        <span className={`swipe-action-label ${tone} two-line`}>
          {lines.map((line) => <span key={line}>{line}</span>)}
        </span>
      ) : (
        <span className={`swipe-action-label ${tone}`}>{label}</span>
      )}
    </motion.div>
  )
}

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

export default function SwipeDeck({ statements, onVote, votedCount = 0, hideFocus = false, voteType = 'binary' }) {
  const isLikert = voteType === 'likert'
  const [focus, setFocus] = useState(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-240, 0, 240], [-14, 0, 14])

  const clamp = (v) => Math.min(Math.max(v, 0), 1)
  const ramp = (v) => clamp((Math.abs(v) - 16) / 60)
  const strongRamp = (v) => clamp((Math.abs(v) - SWIPE_DISTANCE) / (STRONG_DISTANCE - SWIPE_DISTANCE))
  const horizActive = ([xv, yv]) => Math.abs(xv) >= Math.abs(yv)

  const agreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv > 0 ? ramp(xv) : 0))
  const disagreeOpacity = useTransform([x, y], ([xv, yv]) => (horizActive([xv, yv]) && xv < 0 ? ramp(xv) : 0))
  const passOpacity = useTransform([x, y], ([xv, yv]) => (!horizActive([xv, yv]) && yv > 0 ? ramp(yv) : 0))

  const agreeStrong = useTransform([x, y], ([xv, yv]) => (isLikert && horizActive([xv, yv]) && xv > 0 ? strongRamp(xv) : 0))
  const disagreeStrong = useTransform([x, y], ([xv, yv]) => (isLikert && horizActive([xv, yv]) && xv < 0 ? strongRamp(xv) : 0))

  const agreeStrongStep = useTransform(agreeStrong, (s) => (s > 0 ? 1 : 0))
  const disagreeStrongStep = useTransform(disagreeStrong, (s) => (s > 0 ? 1 : 0))

  const agreeBase = useTransform([agreeOpacity, agreeStrong], ([o, s]) => (s > 0 ? 0 : o))
  const disagreeBase = useTransform([disagreeOpacity, disagreeStrong], ([o, s]) => (s > 0 ? 0 : o))

  const agreeStampScale = useTransform(agreeOpacity, [0, 1], [0.6, 1.1])
  const disagreeStampScale = useTransform(disagreeOpacity, [0, 1], [0.6, 1.1])
  const passStampScale = useTransform(passOpacity, [0, 1], [0.6, 1.1])

  const agreeBtnScale = useTransform(agreeOpacity, [0, 1], [1, 1.22])
  const disagreeBtnScale = useTransform(disagreeOpacity, [0, 1], [1, 1.22])
  const passBtnScale = useTransform(passOpacity, [0, 1], [1, 1.22])
  const agreeStrongBtnScale = useTransform(agreeStrongStep, [0, 1], [1, 1.22])
  const disagreeStrongBtnScale = useTransform(disagreeStrongStep, [0, 1], [1, 1.22])

  const cardStrongScale = useTransform(
    [agreeStrongStep, disagreeStrongStep],
    ([a, d]) => (isLikert && (a > 0 || d > 0) ? 1.018 : 1),
  )
  const cardStrongShadow = useTransform(
    [agreeStrongStep, disagreeStrongStep],
    ([a, d]) => {
      if (!isLikert || (a <= 0 && d <= 0)) {
        return '0 18px 44px rgba(16, 24, 40, 0.12), 0 2px 6px rgba(16, 24, 40, 0.05)'
      }
      if (a > 0) {
        return '0 0 0 2px rgba(52, 211, 153, 0.7), 0 0 32px rgba(4, 90, 60, 0.38), 0 18px 44px rgba(16, 24, 40, 0.14)'
      }
      return '0 0 0 2px rgba(251, 113, 133, 0.7), 0 0 32px rgba(130, 0, 24, 0.38), 0 18px 44px rgba(16, 24, 40, 0.14)'
    },
  )

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
    const strong = choice === 'strongly_agree' || choice === 'strongly_disagree'
    vibrate(choice === 'pass' ? 8 : strong ? 26 : 16)
    if (choice === 'pass') {
      const distance = (typeof window !== 'undefined' ? window.innerHeight : 800) * 1.1
      animate(y, distance, {
        type: 'spring',
        stiffness: 260,
        damping: 30,
        onComplete: () => onVote(top.id, 'pass'),
      })
    } else {
      const dir = choice === 'agree' || choice === 'strongly_agree' ? 1 : -1
      const mult = strong ? 1.6 : 1.35
      const distance = (typeof window !== 'undefined' ? window.innerWidth : 600) * mult
      animate(x, dir * distance, {
        type: 'spring',
        stiffness: strong ? 300 : 260,
        damping: 30,
        onComplete: () => onVote(top.id, choice),
      })
    }
  }

  const handleDragStart = () => stopHint()

  const handleDragEnd = (_, info) => {
    const { offset, velocity } = info
    const downSwipe = offset.y > SWIPE_DISTANCE || velocity.y > SWIPE_VELOCITY
    if (downSwipe && offset.y > Math.abs(offset.x)) {
      flyOut('pass')
      return
    }
    const right = offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY
    const left = offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY
    if (right) {
      const strong = isLikert && (offset.x >= STRONG_DISTANCE || velocity.x >= STRONG_VELOCITY)
      flyOut(strong ? 'strongly_agree' : 'agree')
    } else if (left) {
      const strong = isLikert && (offset.x <= -STRONG_DISTANCE || velocity.x <= -STRONG_VELOCITY)
      flyOut(strong ? 'strongly_disagree' : 'disagree')
    } else {
      animate(x, 0, { type: 'spring', stiffness: 340, damping: 32 })
      animate(y, 0, { type: 'spring', stiffness: 340, damping: 32 })
    }
  }

  useEffect(() => {
    if (!top) return
    const onKey = (e) => {
      if (isTypingTarget()) return
      if (e.key === 'ArrowRight') { e.preventDefault(); flyOut(isLikert && e.shiftKey ? 'strongly_agree' : 'agree') }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); flyOut(isLikert && e.shiftKey ? 'strongly_disagree' : 'disagree') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); flyOut('pass') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top?.id, isLikert])

  useEffect(() => {
    if (!focus) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') setFocus(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [focus])

  if (!top) return null

  const behind = statements.slice(1, VISIBLE)

  const hintText = isLikert
    ? 'Swipe right to agree, further for strongly. ↓ to pass'
    : 'Drag, tap, or use arrow keys'

  const body = (
    <>
      <div className="swipe-progress-head">
        <span className="swipe-counter"><strong>{current}</strong> of {total}</span>
        <div className="swipe-head-right">
          <span className="swipe-progress-text" data-testid="swipe-remaining">{statements.length} left</span>
          {!hideFocus && (
            <button
              type="button"
              className="swipe-focus-btn"
              onClick={() => setFocus((f) => !f)}
              aria-label={focus ? 'Exit focus mode' : 'Focus mode'}
              data-testid="swipe-focus-toggle"
            >
              {focus ? (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 9H4M9 9V4M15 9h5M15 9V4M9 15H4M9 15v5M15 15h5M15 15v5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
              <span>{focus ? 'Exit' : 'Focus'}</span>
            </button>
          )}
        </div>
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
          className={`swipe-card top ${isLikert ? 'likert' : ''}`}
          style={{
            x,
            y,
            rotate,
            zIndex: VISIBLE,
            scale: isLikert ? cardStrongScale : 1,
            boxShadow: isLikert ? cardStrongShadow : undefined,
          }}
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.65}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          initial={{ scale: 0.94, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          whileTap={{ cursor: 'grabbing' }}
          data-testid="swipe-card-top"
        >
          <motion.span className="swipe-tint agree" style={{ opacity: agreeBase }} aria-hidden="true" />
          <motion.span className="swipe-tint disagree" style={{ opacity: disagreeBase }} aria-hidden="true" />
          <motion.span className="swipe-tint pass" style={{ opacity: passOpacity }} aria-hidden="true" />
          {isLikert && (
            <>
              <motion.span className="swipe-tint agree strong" style={{ opacity: agreeStrongStep }} aria-hidden="true" />
              <motion.span className="swipe-tint disagree strong" style={{ opacity: disagreeStrongStep }} aria-hidden="true" />
            </>
          )}
          <motion.span className="swipe-stamp agree" style={{ opacity: agreeBase, scale: agreeStampScale }}>AGREE</motion.span>
          <motion.span className="swipe-stamp disagree" style={{ opacity: disagreeBase, scale: disagreeStampScale }}>DISAGREE</motion.span>
          <motion.span className="swipe-stamp pass" style={{ opacity: passOpacity, scale: passStampScale }}>PASS</motion.span>
          {isLikert && (
            <>
              <motion.span className="swipe-stamp agree strong" style={{ opacity: agreeStrongStep }}>STRONGLY AGREE</motion.span>
              <motion.span className="swipe-stamp disagree strong" style={{ opacity: disagreeStrongStep }}>STRONGLY DISAGREE</motion.span>
            </>
          )}
          <StatementTags statement={top} />
          <p className="swipe-text">{top.text}</p>
          <span className="swipe-hint-row" aria-hidden="true">
            <span className="swipe-grip"><span /><span /><span /></span>
            <span className="swipe-hint-text">{hintText}</span>
          </span>
        </motion.div>
      </div>

      <div className={`swipe-controls ${isLikert ? 'likert' : ''}`}>
        {isLikert && (
          <SwipeAction
            tone="disagree"
            strong
            lit={disagreeStrongStep}
            btnScale={disagreeStrongBtnScale}
            onClick={() => flyOut('strongly_disagree')}
            glyph="⇤"
            lines={['Strongly', 'Disagree']}
            testId="swipe-strongly-disagree"
          />
        )}
        <SwipeAction
          tone="disagree"
          lit={disagreeBase}
          btnScale={disagreeBtnScale}
          onClick={() => flyOut('disagree')}
          glyph="✕"
          label="Disagree"
          testId="swipe-disagree"
        />
        <SwipeAction
          tone="pass"
          lit={passOpacity}
          btnScale={passBtnScale}
          onClick={() => flyOut('pass')}
          glyph="↓"
          label="Pass"
          testId="swipe-pass"
        />
        <SwipeAction
          tone="agree"
          lit={agreeBase}
          btnScale={agreeBtnScale}
          onClick={() => flyOut('agree')}
          glyph="✓"
          label="Agree"
          testId="swipe-agree"
        />
        {isLikert && (
          <SwipeAction
            tone="agree"
            strong
            lit={agreeStrongStep}
            btnScale={agreeStrongBtnScale}
            onClick={() => flyOut('strongly_agree')}
            glyph="⇥"
            lines={['Strongly', 'Agree']}
            testId="swipe-strongly-agree"
          />
        )}
      </div>
    </>
  )

  if (focus) {
    return (
      <div className="swipe-fullscreen" data-testid="swipe-fullscreen" role="dialog" aria-modal="true" aria-label="Focused voting">
        <div className="swipe-fs-frame">
          <div className="swipe-area fs" data-testid="swipe-deck">
            {body}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="swipe-area" data-testid="swipe-deck">
      {body}
    </div>
  )
}
