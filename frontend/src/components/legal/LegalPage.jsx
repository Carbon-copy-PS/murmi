import { APP_NAME } from '../../constants/app'

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

const DOCS = {
  privacy: {
    title: 'Privacy Policy',
    updated: '10 August 2026',
    draft: true,
    sections: [
      {
        heading: 'Who we are',
        body: [
          `${APP_NAME} (“we”, “us”) is a group deliberation product. This page describes how we handle information when you use murmi.org and related session tools.`,
          'This draft is provided so the site footer can link here while the final legal text is completed. Replace this content with the approved Privacy Policy before public launch communications.',
        ],
      },
      {
        heading: 'What we collect',
        body: [
          'When you host or join a session, we process the display name you enter, a browser-generated client identifier (stored in session storage), your chosen language preference, session topic, audio captured by the host recorder, transcripts, statements, votes, and related session activity.',
          'We do not operate user accounts, passwords, or a traditional login. Access is by session code plus the name you choose for that session.',
        ],
      },
      {
        heading: 'Where data is hosted',
        body: [
          'The Murmi application and backend currently run on Amazon Web Services (AWS) in the eu-north-1 region (Stockholm, Sweden). Session data may be stored in PostgreSQL on that same environment when persistence is enabled.',
          'We do not currently operate a separate managed backup product. Confirm any snapshot/backup practice on the production host before finalising this section.',
        ],
      },
      {
        heading: 'AI processing',
        body: [
          'We use OpenAI’s API for realtime and final speech transcription (e.g. gpt-4o-transcribe / related transcription models) and for analysis tasks such as claim extraction, common-ground drafting, and related session intelligence (e.g. gpt-4o-mini).',
          'Audio and text needed for those features are sent to OpenAI for processing. OpenAI’s API platform states that API inputs/outputs are not used to train OpenAI models by default, and that abuse-monitoring logs may be retained for up to 30 days unless a zero-data-retention arrangement applies. See OpenAI’s “Your data” documentation for the current terms.',
        ],
      },
      {
        heading: 'Emails, analytics, and tracking',
        body: [
          'We do not currently send transactional emails (no email provider is integrated).',
          'We do not currently use analytics platforms, error-monitoring SaaS, advertising pixels, or cookie-based tracking. The app uses browser local/session storage for preferences and session continuity (for example display name, theme, and rejoining a session).',
          'The marketing pages may load web fonts from Google Fonts, which can receive the requester’s IP address as part of serving the font files.',
        ],
      },
      {
        heading: 'Other processors',
        body: [
          'Amazon Web Services — hosting the app/backend (and database when enabled); region eu-north-1 (Stockholm).',
          'OpenAI — transcription and AI analysis; processing under OpenAI’s API terms (typically US-based service infrastructure).',
          'Let’s Encrypt — TLS certificates for HTTPS (domain validation; no session content).',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'For privacy questions, contact the Murmi operator at the address published in the final policy.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms and Conditions',
    updated: '10 August 2026',
    draft: true,
    sections: [
      {
        heading: 'About these terms',
        body: [
          `These Terms and Conditions govern use of ${APP_NAME} at murmi.org and related session services.`,
          'This page is a placeholder while the final Terms are completed. Replace this content with the approved legal text before relying on it publicly.',
        ],
      },
      {
        heading: 'The service',
        body: [
          `${APP_NAME} helps groups host live deliberation sessions: participants join with a session code, the host may stream room audio for transcription, the service surfaces statements for voting, and AI-assisted summaries or common-ground drafts may be generated.`,
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'You must only use the service for lawful purposes and only share audio/content you are entitled to share. Do not attempt to disrupt sessions, scrape the service abusively, or misuse another group’s session data.',
        ],
      },
      {
        heading: 'No accounts (current prototype)',
        body: [
          'There is currently no registered-user authentication. Hosts and participants identify themselves with a display name inside a session. Session access control is based on knowledge of the session code.',
        ],
      },
      {
        heading: 'AI-generated content',
        body: [
          'Transcripts, extracted statements, common-ground drafts, and related AI outputs can be incomplete or incorrect. Treat them as assistive material for the group, not as definitive legal, medical, or policy advice.',
        ],
      },
      {
        heading: 'Availability and changes',
        body: [
          'The service may change, pause, or be discontinued. We may update these Terms; the date above will be revised when the final version is published.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'For questions about these Terms, contact the Murmi operator at the address published in the final document.',
        ],
      },
    ],
  },
}

export default function LegalPage({ doc }) {
  const page = DOCS[doc] || DOCS.privacy

  return (
    <div className="legal-page" data-testid={`legal-${doc}`}>
      <header className="legal-top">
        <a className="legal-brand" href="/">
          <MurmiMark />
          <span>{APP_NAME}</span>
        </a>
        <nav className="legal-top-nav" aria-label="Legal">
          <a href="/privacy" className={doc === 'privacy' ? 'active' : undefined}>Privacy Policy</a>
          <a href="/terms" className={doc === 'terms' ? 'active' : undefined}>Terms</a>
        </nav>
      </header>

      <main className="legal-main">
        <p className="legal-kicker">Legal</p>
        <h1>{page.title}</h1>
        <p className="legal-meta">Last updated {page.updated}</p>
        {page.draft && (
          <p className="legal-draft" role="status">
            Draft — replace with final counsel-approved text.
          </p>
        )}

        {page.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </section>
        ))}
      </main>

      <footer className="legal-footer">
        <a href="/">← Back to Murmi</a>
        <div className="legal-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms and Conditions</a>
        </div>
      </footer>
    </div>
  )
}
