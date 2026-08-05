// ============================================================================
//  Legal.jsx — Terms, Privacy, and Refunds
// ============================================================================
//  Stripe requires an accessible refund policy and business contact details
//  before an account can accept live payments, and we collect names and emails
//  from visitors who may be in the EU/UK, which needs a privacy notice. Until
//  these existed the landing app had no legal routes at all.
//
//  ONE FILE, THREE ROUTES. The pages share a layout, a type scale, and a
//  last-updated date; splitting them into three files would triplicate all of
//  that and let the date drift apart. Each page is a data structure of
//  sections, rendered by <LegalPage>.
//
//  WRITING RULES FOR THIS FILE
//  ---------------------------
//  1. Only claim what is true of the running system. Every third party named
//     under "Who we share data with" is one the code actually calls — checked
//     against backend/aiProvider.js, server.js (Open-Meteo, OSRM) and
//     frontend/src/lib/mapStyles.ts (MapTiler). Do not add a plausible-sounding
//     processor that isn't wired up, and add one here the moment it is.
//  2. The refund terms are a promise a customer can hold us to. They are
//     deliberately stated in terms of USAGE, which we can observe, rather than
//     the reason a trip fell through, which we cannot verify and should not
//     ask people to prove.
//  3. Plain language over legalese. A traveler reading this on a phone at a
//     ferry terminal should be able to tell in ten seconds whether they get
//     their money back.
//
//  NOT LEGAL ADVICE: reviewed by no lawyer. Have these read before relying on
//  them in a dispute.
// ============================================================================

import { Link } from 'react-router-dom'

/** Bump when the substance changes — the pages display it. */
const LAST_UPDATED = '4 August 2026'
const CONTACT = 'hello@explorevieques.org'

// ---------------------------------------------------------------------------
//  REFUNDS
// ---------------------------------------------------------------------------
//  The awkward case this policy exists to answer: someone buys a 24-hour Day
//  Trip pass, the Ceiba ferry is cancelled, and they never set foot on the
//  island. Refusing that refund earns a chargeback, a Stripe dispute fee, and a
//  review that costs more than the $7.99.
//
//  So the test is USAGE, not cause. We do not ask anyone to prove a ferry was
//  cancelled — we look at whether the pass was actually used. That is
//  observable (credit_transactions rows, and access logs), objective, and it
//  cannot be gamed by someone with a better story.
// ---------------------------------------------------------------------------
const REFUNDS = {
  title: 'Refund policy',
  intro:
    'Short version: if your trip fell through and you did not really use your pass, ' +
    'email us within 7 days and we will refund it in full. No proof of a cancelled ferry required.',
  sections: [
    {
      h: 'Passes you have not used',
      p: [
        'Every traveler pass — Day Trip, Vacation, and Exploration — can be refunded in full ' +
          `within 7 days of purchase, provided you have not made significant use of it. Email ${CONTACT} ` +
          'with the email address you bought it under and we will process it.',
        'Looking at the map a few times while planning does not count against you. We are checking ' +
          'whether the pass was genuinely used, not whether you opened the app.',
      ],
    },
    {
      h: 'If your trip is cancelled',
      p: [
        'Ferries get cancelled, flights get delayed, and plans change. If that happens to you, the ' +
          'clause above is the one that applies: an unused pass gets refunded within 7 days, and we ' +
          'will not ask you to prove why the trip did not happen.',
        'If you would rather keep the pass for a later trip, say so and we will move its expiry to ' +
          'your new dates instead. Whichever you prefer.',
      ],
    },
    {
      h: 'After 7 days, or after real use',
      p: [
        'Passes are short and time-boxed, so once a pass has been meaningfully used, or the 7 days ' +
          'have gone by, we do not refund it as a matter of course. Write to us anyway if you think ' +
          'your situation warrants it — this is a small operation and we would rather sort it out ' +
          'directly than have you dispute the charge.',
      ],
    },
    {
      h: 'Ask AI message packs',
      p: [
        'Unused message packs are refundable on the same 7-day terms. Once messages have been spent ' +
          'they cannot be refunded, because the cost of answering them has already been incurred.',
      ],
    },
    {
      h: 'How long it takes',
      p: [
        'We action refunds within 3 business days of your email. Once sent, the money takes a further ' +
          '5–10 business days to appear, depending on your bank — that part is outside our control.',
        'Refunds always go back to the original payment method. We cannot send them anywhere else.',
      ],
    },
    {
      h: 'Before you dispute a charge',
      p: [
        `Please email ${CONTACT} first. A dispute takes weeks and costs us a fee even when we refund ` +
          'you anyway; an email usually settles it the same day.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
//  PRIVACY
// ---------------------------------------------------------------------------
//  The subprocessor list is the part that must stay true. Every name below is
//  called by code in this repo. If you add a provider — analytics, email,
//  error tracking — it goes in this list in the same commit.
// ---------------------------------------------------------------------------
const PRIVACY = {
  title: 'Privacy policy',
  intro:
    'We collect the minimum needed to sell you a pass and show you a map. We do not sell your data, ' +
    'and we do not run advertising or third-party tracking.',
  sections: [
    {
      h: 'What we collect',
      p: [
        'When you create an account: your email address, and your name if you choose to give it. ' +
          'You can optionally add your trip dates so the app can tailor suggestions.',
        'When you buy a pass: which plan you bought, when, and whether it is still active. Card ' +
          'details are entered on Stripe’s own checkout page and are never sent to or stored on our servers.',
        'When you use Ask AI: the messages you send, so the assistant can answer them, along with a ' +
          'count of how many messages you have used.',
        'We do not track your location. The map centres on Vieques whether you are on the island or not.',
      ],
    },
    {
      h: 'Who we share it with',
      p: [
        'Only the services needed to run the product:',
      ],
      list: [
        'Supabase — stores your account, and hosts the database. Located in the United States.',
        'Stripe — processes payments. They receive your email and the amount charged; we never see your full card number.',
        'Google (Gemini) — receives the text of your Ask AI messages in order to answer them. It does not receive your name or email.',
        'MapTiler and OpenStreetMap — serve the map tiles your browser draws.',
        'OSRM and Open-Meteo — return driving directions and the island weather forecast.',
        'Railway and Vercel — host the API and the websites.',
      ],
      after: [
        'That is the complete list. We do not use advertising networks, analytics trackers, or ' +
          'data brokers, and we do not sell or rent your information to anyone.',
      ],
    },
    {
      h: 'Cookies',
      p: [
        'We use one kind of browser storage: the token that keeps you signed in. There are no ' +
          'advertising or analytics cookies, which is why you are not being asked to dismiss a cookie banner.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Your account and purchase records stay until you ask us to delete them. We keep records of ' +
          'completed payments for as long as tax and accounting rules require, even after account deletion.',
      ],
    },
    {
      h: 'Your rights',
      p: [
        `Email ${CONTACT} and we will get you a copy of your data, correct it, or delete your account ` +
          'entirely. We aim to respond within 30 days.',
        'If you are in the EU or UK, you also have the right to complain to your local data protection ' +
          'authority. We would rather you came to us first.',
      ],
    },
    {
      h: 'Children',
      p: [
        'Explore Vieques is not intended for children under 13, and we do not knowingly collect their ' +
          'information. If you believe a child has created an account, tell us and we will remove it.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
//  TERMS
// ---------------------------------------------------------------------------
//  The "what this is not" section matters more than the boilerplate. This app
//  tells people which beaches need a 4x4 and where the snorkelling is — advice
//  that carries real physical risk if treated as a guarantee.
// ---------------------------------------------------------------------------
const TERMS = {
  title: 'Terms of service',
  intro:
    'Explore Vieques is a travel guide for the island of Vieques, Puerto Rico. These terms cover ' +
    'what you can expect from us, and what we expect from you.',
  sections: [
    {
      h: 'Who runs this',
      p: [
        'Explore Vieques is operated as a sole proprietorship based in Puerto Rico, United States. ' +
          `You can reach us at ${CONTACT}.`,
        'These terms are governed by the laws of the Commonwealth of Puerto Rico.',
      ],
    },
    {
      h: 'Your account',
      p: [
        'You need an account to buy a pass. Keep your password to yourself — you are responsible for ' +
          'what happens under your account.',
        'Passes are personal. Each plan allows a set number of devices, listed on the pricing page. ' +
          'Sharing a pass more widely than that, or reselling access, is not permitted.',
      ],
    },
    {
      h: 'Passes and billing',
      p: [
        'Traveler passes are one-time purchases, not subscriptions. Nothing recurring is charged, and ' +
          'there is nothing to cancel — a pass simply expires at the end of its window.',
        'Prices are in US dollars and shown before you pay. The price you see at checkout is the price ' +
          'charged. Refunds are covered by our refund policy.',
      ],
    },
    {
      h: 'What this app is, and is not',
      p: [
        'We work hard to keep the island information accurate, and much of it is verified by hand. ' +
          'Even so, it is a guide, not a guarantee. Beaches erode, restaurants close, road conditions ' +
          'change after storms, and ferry schedules move without notice.',
        'Use your own judgement, especially about anything with physical risk: swimming and snorkelling ' +
          'conditions, unpaved roads, whether a vehicle can make it somewhere, and going into the ' +
          'wildlife refuge. Conditions on the ground beat anything on your phone. You travel at your own risk.',
        'The Ask AI assistant answers from our listings and can still be wrong. Treat it as a helpful ' +
          'starting point rather than the final word, and check anything that matters.',
      ],
    },
    {
      h: 'Availability',
      p: [
        'We aim to keep the app running at all times but cannot promise uninterrupted service. Some ' +
          'features depend on third parties — maps, routing, weather, and the AI provider — and those ' +
          'can fail independently of us.',
        'If a serious outage stops you using a pass you paid for, tell us and we will extend it or ' +
          'refund it.',
      ],
    },
    {
      h: 'Acceptable use',
      p: [
        'Please do not scrape or bulk-download our listings, resell the content, attempt to bypass the ' +
          'paywall, or use the AI assistant to generate abusive material. We may suspend accounts that do.',
        'The island content, written descriptions, and design are ours. Personal use of the app is what ' +
          'you are buying; republishing the data is not.',
      ],
    },
    {
      h: 'Liability',
      p: [
        'To the extent the law allows, our total liability to you is limited to what you paid us in the ' +
          'past 12 months. We are not liable for indirect losses such as missed ferries, cancelled ' +
          'bookings, or ruined plans.',
        'Nothing here limits liability that cannot legally be limited.',
      ],
    },
    {
      h: 'Changes',
      p: [
        'We may update these terms as the product changes. The date at the top tells you when they last ' +
          'changed, and material changes will be announced by email to registered users.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
//  Shared renderer
// ---------------------------------------------------------------------------
function LegalPage({ doc }) {
  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.inner}>
        <Link to="/" style={styles.brand}>Explore<span style={{ color: '#06b6d4' }}> Vieques</span></Link>

        <h1 style={styles.h1}>{doc.title}</h1>
        <p style={styles.updated}>Last updated {LAST_UPDATED}</p>
        <p style={styles.intro}>{doc.intro}</p>

        {doc.sections.map((s) => (
          <section key={s.h} style={styles.section}>
            <h2 style={styles.h2}>{s.h}</h2>
            {s.p?.map((para, i) => <p key={i} style={styles.p}>{para}</p>)}
            {s.list && (
              <ul style={styles.ul}>
                {s.list.map((item) => <li key={item} style={styles.li}>{item}</li>)}
              </ul>
            )}
            {s.after?.map((para, i) => <p key={`a${i}`} style={styles.p}>{para}</p>)}
          </section>
        ))}

        <div style={styles.crossLinks}>
          <Link to="/terms" style={styles.link}>Terms</Link>
          <Link to="/privacy" style={styles.link}>Privacy</Link>
          <Link to="/refunds" style={styles.link}>Refunds</Link>
          <a href={`mailto:${CONTACT}`} style={styles.link}>Contact</a>
        </div>
      </div>
    </main>
  )
}

export function Terms()   { return <LegalPage doc={TERMS} /> }
export function Privacy() { return <LegalPage doc={PRIVACY} /> }
export function Refunds() { return <LegalPage doc={REFUNDS} /> }

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', background: '#0f172a', padding: '48px 24px 80px', fontFamily: 'Manrope, system-ui, sans-serif', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(800px 420px at 50% -10%, rgba(6,182,212,.10), transparent 60%)' },
  // ~68ch of running text. Legal prose is read, not scanned, and a full-width
  // column of it on a desktop monitor is genuinely hard to follow.
  inner: { position: 'relative', maxWidth: 720, margin: '0 auto' },
  brand: { fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2e8f0', textDecoration: 'none' },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 'clamp(26px,3.4vw,36px)', margin: '28px 0 8px' },
  updated: { color: '#64748b', fontSize: 12.5, margin: '0 0 22px' },
  // The intro carries the answer most people came for, so it gets the emphasis
  // treatment rather than being just another paragraph.
  intro: { color: '#cbd5e1', fontSize: 15.5, lineHeight: 1.65, margin: '0 0 8px', padding: '16px 18px', borderRadius: 12, background: 'rgba(6,182,212,.07)', border: '1px solid rgba(6,182,212,.22)' },
  section: { marginTop: 30 },
  h2: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 17, margin: '0 0 10px' },
  p: { color: '#94a3b8', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 12px' },
  ul: { margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  li: { color: '#94a3b8', fontSize: 14.5, lineHeight: 1.6 },
  crossLinks: { display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 44, paddingTop: 22, borderTop: '1px solid rgba(148,163,184,.14)' },
  link: { color: '#67e8f9', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' },
}
