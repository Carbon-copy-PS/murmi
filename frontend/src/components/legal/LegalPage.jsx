import { APP_NAME } from '../../constants/app'
import privacyContent from './privacy-content.json'
import termsContent from './terms-content.json'

const DOCS = {
  privacy: privacyContent,
  terms: termsContent,
}

function MurmiMark({ className = 'legal-brand-mark' }) {
  return (
    <img
      className={className}
      src="/favicon.svg"
      alt=""
      width={28}
      height={28}
      decoding="async"
    />
  )
}

function renderInline(text) {
  // Turn bare emails into mailto links without changing surrounding copy.
  const parts = text.split(/(hi@carbon-copy\.org)/g)
  if (parts.length === 1) return text
  return parts.map((part, index) => (
    part === 'hi@carbon-copy.org' ? (
      <a key={index} href="mailto:hi@carbon-copy.org">{part}</a>
    ) : (
      <span key={index}>{part}</span>
    )
  ))
}

function Block({ block }) {
  if (block.type === 'h3') {
    return <h3>{block.text}</h3>
  }
  if (block.type === 'ul') {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{renderInline(item)}</li>
        ))}
      </ul>
    )
  }
  if (block.type === 'address') {
    return (
      <address className="legal-address">
        {block.lines.map((line) => {
          if (line.startsWith('Email: ')) {
            const email = line.slice('Email: '.length)
            return (
              <span key={line}>
                Email: <a href={`mailto:${email}`}>{email}</a>
              </span>
            )
          }
          if (line.includes('@') && !line.includes(' ')) {
            return (
              <span key={line}>
                <a href={`mailto:${line}`}>{line}</a>
              </span>
            )
          }
          return <span key={line}>{line}</span>
        })}
      </address>
    )
  }
  return <p>{renderInline(block.text)}</p>
}

export default function LegalPage({ doc }) {
  const page = DOCS[doc] || DOCS.privacy

  return (
    <div className="legal-page" data-testid={`legal-${doc}`}>
      <header className="legal-top">
        <div className="legal-top-start">
          <a className="legal-back" href="/" data-testid="legal-back">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </a>
          <a className="legal-brand" href="/">
            <MurmiMark />
            <span>{APP_NAME}</span>
          </a>
        </div>
        <nav className="legal-top-nav" aria-label="Legal">
          <a href="/privacy-policy" className={doc === 'privacy' ? 'active' : undefined}>Privacy Policy</a>
          <a href="/terms-and-conditions" className={doc === 'terms' ? 'active' : undefined}>Terms of Service</a>
        </nav>
      </header>

      <main className="legal-main">
        <p className="legal-kicker">Legal</p>
        <h1>{page.title}</h1>
        {page.updated && (
          <p className="legal-meta">Last updated: {page.updated}</p>
        )}

        {page.sections.map((section) => (
          <section key={section.heading} className="legal-section" id={section.heading.split('.')[0]}>
            <h2>{section.heading}</h2>
            {section.blocks.map((block, index) => (
              <Block key={`${section.heading}-${index}`} block={block} />
            ))}
          </section>
        ))}
      </main>

      <footer className="legal-footer">
        <a href="/">← Back to Murmi</a>
        <div className="legal-footer-links">
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms-and-conditions">Terms of Service</a>
        </div>
      </footer>
    </div>
  )
}
