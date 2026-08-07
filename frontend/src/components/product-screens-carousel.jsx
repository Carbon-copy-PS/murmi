import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  {
    src: '/brand/screens/ss-vote.jpg',
    label: 'Vote',
    title: 'React to claims together',
    caption: 'Everyone weighs in anonymously as claims emerge from the conversation.',
    alt: 'Murmi Vote view for the session Essentials for a fair society, showing a claim about clean water',
  },
  {
    src: '/brand/screens/ss-record.jpg',
    label: 'Record',
    title: 'Live conversation flow',
    caption: 'Contributions become clear claims while the group stays with the topic.',
    alt: 'Murmi Record view with a live transcript discussing fair society essentials',
  },
  {
    src: '/brand/screens/ss-clusters.jpg',
    label: 'Clusters',
    title: 'See the shape of disagreement',
    caption: 'Opinion clusters map where people align — without singling anyone out.',
    alt: 'Murmi Opinion Clusters map with three groups on a fair society topic',
  },
  {
    src: '/brand/screens/ss-commonground.jpg',
    label: 'Common ground',
    title: 'Find a path forward',
    caption: 'AI drafts shared ground and open tensions the group can react to.',
    alt: 'Murmi AI common ground draft bridging views on protecting the planet and fair funding',
  },
]

const AUTO_MS = 4500

export default function ProductScreensCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (paused || reduceMotionRef.current) return undefined
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length)
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [paused, index])

  const go = (next) => {
    setIndex((next + SLIDES.length) % SLIDES.length)
  }

  const slide = SLIDES[index]

  return (
    <section className="ls-section ls-screens" id="in-action" data-testid="product-screens">
      <div className="ls-section-head ls-screens-head">
        <span className="ls-kicker">In a session</span>
        <h2 className="ls-h2">See Murmi at work</h2>
        <p className="ls-lead compact">
          A civic workshop on{' '}
          <span className="ls-screens-topic">Essentials for a fair society</span>
          {' '}— from conversation to votes, clusters, and common ground.
        </p>
      </div>

      <div
        className="ls-carousel"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false)
        }}
      >
        <div className="ls-carousel-stage">
          <div className="ls-carousel-frame">
            {SLIDES.map((s, i) => (
              <figure
                key={s.src}
                className={`ls-carousel-slide${i === index ? ' active' : ''}`}
                aria-hidden={i !== index}
              >
                <img src={s.src} alt={s.alt} width={900} height={1200} loading={i === 0 ? 'eager' : 'lazy'} />
              </figure>
            ))}
          </div>

          <button
            type="button"
            className="ls-carousel-nav prev"
            onClick={() => go(index - 1)}
            aria-label="Previous screenshot"
            data-testid="carousel-prev"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="ls-carousel-nav next"
            onClick={() => go(index + 1)}
            aria-label="Next screenshot"
            data-testid="carousel-next"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="ls-carousel-meta" aria-live="polite">
          <span className="ls-carousel-label">{slide.label}</span>
          <h3 className="ls-carousel-title">{slide.title}</h3>
          <p className="ls-carousel-caption">{slide.caption}</p>
        </div>

        <div className="ls-carousel-dots" role="tablist" aria-label="Screenshots">
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show ${s.label}`}
              className={`ls-carousel-dot${i === index ? ' active' : ''}`}
              onClick={() => setIndex(i)}
              data-testid={`carousel-dot-${i}`}
            />
          ))}
        </div>

        <div className="ls-carousel-progress" aria-hidden="true">
          <span
            key={index}
            className={`ls-carousel-progress-bar${paused ? ' paused' : ''}`}
            style={{ animationDuration: `${AUTO_MS}ms` }}
          />
        </div>
      </div>
    </section>
  )
}
