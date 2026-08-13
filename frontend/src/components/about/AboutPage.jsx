import { APP_NAME } from '../../constants/app'

function MurmiMark({ className = 'about-brand-mark' }) {
  return (
    <img
      className={className}
      src="/favicon.svg"
      alt=""
      width={30}
      height={30}
      decoding="async"
    />
  )
}

const SENSEMAKING_STEPS = [
  ['01', 'Discuss', 'People contribute their experience, concerns, and ideas.'],
  ['02', 'Reflect', 'Murmi turns the conversation into an interpretation the room can inspect.'],
  ['03', 'Check', 'Participants question, correct, and add what is missing.'],
  ['04', 'Develop', 'The revised understanding becomes the starting point for what comes next.'],
]

const CONTACTS = [
  ['Carbon Copy', 'pw@carbon-copy.org'],
  ['Joshua C. Yang', 'joyang@ethz.ch'],
  ['vTaiwan', 'info@vtaiwan.tw'],
]

export default function AboutPage() {
  return (
    <div className="about-page" data-testid="about-page">
      <header className="about-top">
        <a className="about-brand" href="/" aria-label={`${APP_NAME} home`}>
          <MurmiMark />
          <span>{APP_NAME}</span>
        </a>
        <nav className="about-top-nav" aria-label="About page">
          <a href="#story">Our story</a>
          <a href="#approach">Our approach</a>
          <a href="#practice">In practice</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="about-home-link" href="/">
          Back to home
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </header>

      <main>
        <section className="about-hero" id="story">
          <div className="about-hero-art" aria-hidden="true">
            <img src="/brand/hero-marmots-lg.jpg" alt="" width={1920} height={1080} />
          </div>
          <div className="about-hero-scrim" aria-hidden="true" />
          <div className="about-hero-copy">
            <p className="about-kicker light">About Murmi</p>
            <h1>Built from real conversations</h1>
            <p className="about-hero-lead">
              Murmi takes its name from the marmot, a social animal at home in the Swiss Alps. Marmots live together and communicate closely.
            </p>
            <p className="about-hero-note">Swiss roots. A line of thinking that reaches from Zurich to Taiwan.</p>
          </div>
        </section>

        <div className="about-sheet">
          <section className="about-intro about-section">
            <p className="about-intro-lead">
              Murmi grew out of a collaboration connecting <a href="https://www.vtaiwan.tw/" target="_blank" rel="noreferrer">vTaiwan</a> in Taiwan, <a href="https://www.atgora.org/unserverein" target="_blank" rel="noreferrer">Carbon Copy</a> in Switzerland, and the Computational Social Science Lab at ETH Zurich.
            </p>
            <p>
              It brings together experience from public deliberation, research into collective intelligence, and the practical work of turning an idea into something people can use together.
            </p>
          </section>

          <section className="about-section about-origin-grid">
            <article className="about-story-block">
              <p className="about-kicker">The beginning</p>
              <h2>It started with people in a room</h2>
              <p>Before Murmi became an app, it began with people trying to make sense of difficult questions together.</p>
              <p>
                Through his work as a process designer with vTaiwan, <a href="https://joshuacyang.com/" target="_blank" rel="noreferrer">Joshua C. Yang</a> helped design and run deliberative workshops on complex public issues. Those experiences revealed a great deal about how groups listen, where discussions get stuck, which voices are easily missed, and what helps people find common ground without brushing their differences aside.
              </p>
              <p>
                They led to <em>Read the Room</em>, a method developed through research with Fynn Bachmann and presented in the paper <a href="https://dl.acm.org/doi/full/10.1145/3715275.3732205" target="_blank" rel="noreferrer"><em>Bridging Voting and Deliberation with Algorithms: Field Insights from vTaiwan and Kultur Komitee Winterthur</em></a>.
              </p>
              <blockquote>
                A meaningful outcome should be more than a vote, a stack of comments, or a summary written by someone outside the room.
              </blockquote>
            </article>

            <article className="about-story-block about-story-card">
              <p className="about-kicker">Building the tool</p>
              <h2>From a method to Murmi</h2>
              <p>Carbon Copy helped turn this idea into a working application.</p>
              <p>
                Carbon Copy is an independent non-profit association based in Zurich. It creates spaces and tools for meaningful dialogue, mutual learning, and public participation. Carbon Copy helped shape and develop Murmi, working to make the experience straightforward for participants and genuinely useful for facilitators.
              </p>
              <p>
                Building the app also changed the method itself. Ideas were tried, questioned, simplified, and tested in real conversations. What worked was kept. What did not was reconsidered.
              </p>
              <p>
                Murmi also benefited from the wider research community in Zurich. Professor Dirk Helbing contributed perspectives on digital democracy and collective intelligence, while Fynn Bachmann and Maurice Flechtner brought related ideas about deliberation, collective reasoning, and the thoughtful use of technology in democratic processes.
              </p>
              <p>
                Murmi carries a connection between Taiwan and Europe. It draws on Taiwan’s experience with digital democracy and combines it with research, design, and civic work in Switzerland.
              </p>
            </article>
          </section>

          <section className="about-approach" id="approach">
            <div className="about-section about-approach-inner">
              <div className="about-approach-copy">
                <p className="about-kicker light">The idea behind Murmi</p>
                <h2>A conversation that can check itself</h2>
                <p>
                  Murmi helps a group move from many individual contributions towards an outcome grounded in what people actually said and supported by mutual agreement. At the same time, it keeps disagreements and less-heard perspectives visible.
                </p>
                <p>
                  The first summary is never treated as the final answer. Participants can read it, question it, correct it, and add whatever is missing. The revised understanding then becomes the starting point for the next round of conversation.
                </p>
                <p>
                  We think of this as <strong>recursive sensemaking</strong>: the conversation returns to itself and becomes clearer each time.
                </p>
              </div>
              <ol className="about-cycle">
                {SENSEMAKING_STEPS.map(([number, title, text]) => (
                  <li key={number}>
                    <span className="about-cycle-number">{number}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="about-principle">
                <p>
                  AI can recognise patterns in what has been said, but it does not understand a conversation in the way its participants do. It only sees what has been expressed and recorded. It cannot know the experience behind a contribution, decide which trade-offs are acceptable, or determine whether a shared formulation is fair. Any interpretation also reflects choices about what to foreground and what to leave out.
                </p>
                <p className="about-principle-line">
                  Common ground should be judged by the people in the room, not declared by AI.
                </p>
                <p>
                  That is why Murmi presents AI-generated common ground as a working interpretation. Participants can trace it back to what was said, identify missing context, and challenge how agreement and disagreement have been framed. We are still learning how best to support this process. The aim is not to hand judgment to AI, but to use it carefully so people can understand and shape the outcome together.
                </p>
              </div>
            </div>
          </section>

          <section className="about-section" id="practice">
            <div className="about-section-head">
              <p className="about-kicker">From idea to practice</p>
              <h2>Tested in Taiwan and Switzerland</h2>
            </div>
            <div className="about-pilot-grid">
              <article className="about-pilot-card">
                <div className="about-pilot-meta">
                  <span>Taiwan</span>
                  <time dateTime="2026-07-17">17 July 2026</time>
                </div>
                <h3>vTaiwan</h3>
                <p>
                  Murmi was piloted with vTaiwan, with around 100 people participating at the same time. Their contributions were brought together into a shared picture of the group’s priorities, agreements, tensions, and less-heard perspectives.
                </p>
                <p>
                  Participants could respond to what emerged and help refine it. The resulting report was then used directly to support policy adjustments. The discussion did not end as a collection of comments. It produced something that could be carried into the next stage of the process.
                </p>
              </article>

              <article className="about-pilot-card featured">
                <div className="about-pilot-meta">
                  <span>Switzerland</span>
                  <time dateTime="2026-08-11">11–12 August 2026</time>
                </div>
                <h3>Swiss AI Futures</h3>
                <p>
                  A later opportunity to test Murmi in Switzerland came through <a href="https://swissaifutures.org/" target="_blank" rel="noreferrer">Swiss AI Futures</a>, a project funded by TA-SWISS that explores how artificial intelligence is affecting work and education in Switzerland.
                </p>
                <p>
                  Murmi was used in citizen workshops in Zurich and Lausanne. Across the two workshops, more than 100 participants tested the app.
                </p>
                <p>
                  The wider project is led by Professors Maud Reveilhac and Aurelia Tamò-Larrieux. They led and facilitated the workshops, creating the real-world setting in which Murmi could be tried and evaluated, while funding from TA-SWISS made this implementation possible.
                </p>
              </article>
            </div>

            <div className="about-outcome">
              <div>
                <p className="about-kicker">What participants experienced</p>
                <h3>A visible outcome</h3>
              </div>
              <div>
                <p>
                  Participants appreciated having some structure in the discussion and knowing that what they said was being recorded and taken seriously. They could see their contributions being organised, reflected back, and brought towards a conclusion that they could review.
                </p>
                <p>
                  This gave the conversations a sense of progress and closure. With Murmi, participants could see where the conversation had arrived, what the group shared, what remained unresolved, and what could be carried forward.
                </p>
              </div>
            </div>
          </section>

          <section className="about-ambition">
            <div className="about-ambition-copy">
              <p className="about-kicker light">What comes next</p>
              <h2>From a table to an entire country</h2>
              <p>
                Our ambition is to support this kind of sensemaking at every scale, from a small group around a table to a public conversation involving an entire country.
              </p>
              <p>
                Murmi is built from real conversations and a shared belief that democracy works better when more people can participate, understand how decisions take shape, and see how their voices contribute to what comes next.
              </p>
              <p>
                Murmi is still evolving. We are looking for people who would like to test it in their own workshops, organisations, research projects, or public processes. We also welcome collaborators and supporters who want to help develop the next stage.
              </p>
              <a className="about-cta" href="#contact">Help shape what comes next</a>
            </div>
          </section>

          <section className="about-contact about-section" id="contact">
            <div className="about-contact-copy">
              <p className="about-kicker">Get in touch</p>
              <h2>If this is relevant to your work, we would be glad to hear from you.</h2>
            </div>
            <div className="about-contact-list">
              {CONTACTS.map(([name, email]) => (
                <a href={`mailto:${email}`} key={email}>
                  <span>{name}</span>
                  <strong>{email}</strong>
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                    <path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="about-footer">
        <a className="about-brand" href="/">
          <MurmiMark />
          <span>{APP_NAME}</span>
        </a>
        <span>Born in the Swiss Alps — built with collective intelligence.</span>
        <nav aria-label="Footer">
          <a href="/">Home</a>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms-and-conditions">Terms of Service</a>
        </nav>
      </footer>
    </div>
  )
}
