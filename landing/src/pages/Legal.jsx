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
// LAST_UPDATED, the operator details and TERMS_VERSION live in lib/legal.js,
// shared with the sign-up consent checkbox. Bump both dates together.
import { LAST_UPDATED, CONTACT, COMPANY, ADDRESS } from '../lib/legal.js'

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
//  Derived from Red Oak LLC's Termly-generated notice (Nov 2026), then audited
//  against the code. Removed because the app does not do them: social login,
//  SMS, push notifications, offer walls, "business partner" promotions,
//  testimonials, marketing-campaign analysis, phone numbers, card numbers,
//  Google API Limited Use, and the mobile-app framing. Corrected: Termly's
//  US-state table answered NO to every category, including identifiers and
//  purchase history, which we plainly collect.
//
//  The subprocessor list is the part that must stay true. Every name below is
//  called by code in this repo. If you add a provider — analytics, email,
//  error tracking — it goes in this list in the same commit.
//
//  Google Ads (landing/src/lib/ads.js): measurement only — restricted data
//  processing on, ad personalization off, EEA/UK/CH consent denied by default.
//  The "not sold or shared" statement below depends on those three settings.
//
//  Location: MapView.tsx uses navigator.geolocation.watchPosition for the blue
//  dot and "miles away" labels only. The coordinates never leave the browser.
//  If that ever changes (e.g. sending position to /api/directions), category
//  G below flips to YES in the same commit.
// ---------------------------------------------------------------------------
const PRIVACY = {
  title: 'Privacy policy',
  intro:
    'We collect the minimum needed to sell you a pass and show you a map. We do not sell your data or ' +
    'use it to target you with ads. The one measurement tool on our website tells us which of our own ' +
    'Google ads led to a purchase, and nothing more. You can delete your account yourself at any time.',
  sections: [
    {
      h: 'Who we are',
      p: [
        `Explore Vieques is a service of ${COMPANY} (“we”, “us”). This notice explains what personal ` +
          'information we collect when you use explorevieques.org and app.explorevieques.org (the ' +
          '“Services”), why, who we share it with, and the choices you have.',
        `Questions? Email ${CONTACT}, or write to ${COMPANY}, ${ADDRESS}.`,
      ],
    },
    {
      h: 'What we collect',
      p: ['Information you give us:'],
      list: [
        'Account details: your email address, a password, and your name if you choose to give it. ' +
          'Passwords are stored hashed by our authentication provider; we never see them.',
        'Trip dates, if you choose to add them, so the app can tailor suggestions.',
        'Purchases: which pass or message pack you bought, the amount, and when. Card details are ' +
          'entered on Stripe’s checkout page and never reach our servers.',
        'Ask AI: the questions you ask and the answers given, saved as conversations in your account ' +
          'so you can return to them, plus a count of messages used.',
        'Places you save and trips you plan in the app.',
        'Anything you send us when you email us.',
      ],
      after: [
        'Information collected automatically: like almost every website, the companies that host our ' +
          'Services keep standard server logs — IP address, browser type, the page or API requested, and ' +
          'the time — which we use only to keep the Services secure and working.',
        'Ad measurement: on explorevieques.org (not the map app), a Google Ads tag notes whether you ' +
          'arrived by clicking one of our ads and, if you then buy a pass, reports that purchase, its ' +
          'amount and an order number to Google, so we can tell which ads are worth paying for. See ' +
          '“Cookies and browser storage” below.',
        'We do not collect phone numbers, social media profiles, or any sensitive information such as ' +
          'health, ethnicity, religion, or sexual orientation.',
      ],
    },
    {
      h: 'Your location',
      p: [
        'If you allow it, the map app uses your device’s location to show where you are and how far ' +
          'away each place is. This happens entirely in your browser: your location is never sent to ' +
          'our servers, stored, or shared. You can refuse or turn it off in your browser or device ' +
          'settings and everything else keeps working.',
      ],
    },
    {
      h: 'How we use it',
      list: [
        'To create and run your account and let you sign in.',
        'To process payments and give you the pass you bought.',
        'To answer your Ask AI questions.',
        'To send emails your account needs: sign-up confirmation, password resets, and receipts. We do ' +
          'not currently send marketing email; if we ever do, you will be able to unsubscribe from it.',
        'To keep the Services secure, prevent fraud and abuse, and fix problems.',
        'To comply with the law, and to establish or defend legal claims.',
      ],
    },
    {
      h: 'Who we share it with',
      p: ['Only the service providers needed to run the product, each under its own terms:'],
      list: [
        'Supabase — hosts our database and accounts, and sends account emails. United States.',
        'Stripe — processes payments. Receives your email and the amount charged.',
        'Google (Gemini API) — receives the text of your Ask AI messages in order to answer them. It ' +
          'does not receive your name or email.',
        'MapTiler and OpenStreetMap — serve the map tiles your browser draws.',
        'OSRM and Open-Meteo — return driving directions and the island weather forecast. They receive ' +
          'place coordinates, not your location or identity.',
        'Railway and Vercel — host the API and the websites.',
        'Google (Google Ads) — measures which of our ads lead to purchases. Receives the ad-click ' +
          'identifier, the pages of explorevieques.org you visit, your IP address and browser details, ' +
          'and for a purchase its amount and order number. It does not receive your name or email. We ' +
          'run it with Google’s restricted data processing and ad personalization turned off, so Google ' +
          'acts as our service provider and does not use it to build advertising profiles of you.',
      ],
      after: [
        'That is the complete list. We do not use remarketing, analytics trackers or data brokers, and ' +
          'we do not sell or rent your information to anyone.',
        'If Red Oak LLC or the Explore Vieques business is ever sold or merged, your information may ' +
          'transfer to the new owner, who would remain bound by this notice for the data already collected. ' +
          'We may also disclose information when the law requires it.',
      ],
    },
    {
      h: 'The AI assistant',
      p: [
        'Ask AI is powered by Google’s Gemini API. Your questions are sent to Google to generate an ' +
          'answer. Messages already sent to Google cannot be recalled from them, even if you later delete ' +
          'the conversation or your account, so please do not type personal details you would not want ' +
          'processed by a third party.',
      ],
    },
    {
      h: 'Cookies and browser storage',
      p: [
        'We store the token that keeps you signed in and, if you arrived from a link or ad of ours, a ' +
          'note of which one (kept for 30 days and attached to your account if you sign up).',
        'On explorevieques.org, Google Ads also sets first-party cookies (named _gcl_…) that hold the ' +
          'ad-click identifier for up to 90 days, so a later purchase can be matched to the ad. They are ' +
          'used only to measure our own ads, never for remarketing or personalised advertising, and they ' +
          'are not set in the map app. If you are in the EEA, the UK or Switzerland, the tag runs without ' +
          'cookies by default. You can block or delete these cookies in your browser, or use an ad ' +
          'blocker; everything on the site keeps working.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Your account and everything in it stays until you delete it. You can do that yourself at any ' +
          'time from your account page; it takes effect immediately and erases your profile, saved ' +
          'places, trips and Ask AI history.',
        'Two things outlive a deleted account. We keep an anonymous record of each completed payment ' +
          '(amount, plan and date, with no name or email attached) for as long as tax and accounting ' +
          'rules require, and Stripe keeps its own record of the charge. Server logs held by our hosting ' +
          'providers expire on their own schedules.',
      ],
    },
    {
      h: 'How we protect it',
      p: [
        'Everything travels over encrypted connections, card data never touches our servers, and ' +
          'access to the database is restricted to our own backend. No system is perfectly secure, so ' +
          'we cannot guarantee that information will never be accessed without authorisation, but we ' +
          'will tell affected users promptly if it ever is.',
      ],
    },
    {
      h: 'Children',
      p: [
        'The Services are for adults. You must be 18 or older to create an account, and we do not ' +
          'knowingly collect information from anyone under 18. If you believe a minor has created an ' +
          `account, email ${CONTACT} and we will delete it.`,
      ],
    },
    {
      h: 'Your rights and choices',
      list: [
        'Delete your account and data yourself, at any time, from your account page at ' +
          'explorevieques.org/account.',
        'See the name and email on your account on that same page. To correct them, email us.',
        `Ask for a copy of your data, or for anything else in this notice, by emailing ${CONTACT}. ` +
          'We respond within 30 days.',
        'Withdraw consent you have given us, for example by turning off location in your browser.',
      ],
      after: [
        'To protect your account, we may need to confirm that a request comes from you — normally by ' +
          'replying from the email address on the account.',
        'If you are in the EU or UK, you may also complain to your local data protection authority. ' +
          'We would rather you came to us first.',
      ],
    },
    {
      h: 'Additional rights for US residents',
      p: [
        'Residents of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, ' +
          'Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, ' +
          'Tennessee, Texas, Utah and Virginia have specific rights under state privacy laws. In the past ' +
          '12 months we have collected these categories of personal information:',
      ],
      list: [
        'Identifiers — YES: name, email address, account ID, IP address in server logs, and the ' +
          'Google ad-click identifier if you arrived from one of our ads.',
        'Customer records (California Civil Code 1798.80) — YES: name and email address.',
        'Commercial information — YES: passes and message packs purchased, amount and date.',
        'Internet or network activity — YES: Ask AI questions and places saved within our app, and ' +
          'whether a visit to explorevieques.org came from one of our ads. Not your browsing on other sites.',
        'Geolocation — NO: your location stays on your device.',
        'Protected characteristics, biometric data, audio or video, professional or education ' +
          'information, inferences or profiles, and sensitive personal information — NO.',
      ],
      after: [
        'We collect these from you directly, use them for the purposes above, and disclose them only ' +
          'to the service providers listed. We have not sold or “shared” personal information for ' +
          'targeted advertising in the past 12 months and will not, and we do not use it for profiling ' +
          'that produces legal or similarly significant effects.',
        'Depending on your state, you have the right to know whether we process your data and to access ' +
          'it, to correct it, to delete it, to receive a portable copy, to obtain the list of third ' +
          'parties we disclose it to (above), and not to be treated differently for using these rights.',
        `To use them, visit explorevieques.org/account or email ${CONTACT}. You may use an authorised ` +
          'agent, who must provide your signed permission; we may still ask you to confirm your identity. ' +
          `If we decline a request you may appeal by emailing ${CONTACT} with “Appeal” in the subject, ` +
          'and if we deny the appeal you may contact your state attorney general.',
        'California “Shine the Light”: we do not disclose personal information to third parties for ' +
          'their direct marketing.',
      ],
    },
    {
      h: 'Changes to this notice',
      p: [
        'We will update this notice when what we do changes. The date at the top shows the latest ' +
          'version, and we will email registered users about material changes before they take effect.',
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
//
//  Bump TERMS_VERSION when the substance of TERMS or PRIVACY changes. Sign-up
//  records the version the user agreed to (public.terms_acceptances, 0051).
// ---------------------------------------------------------------------------
const TERMS = {
  title: 'Terms of service',
  intro:
    'Explore Vieques is a travel guide for the island of Vieques, Puerto Rico. By creating an account ' +
    'or buying a pass you agree to these terms, so here is what you can expect from us and what we ' +
    'expect from you.',
  sections: [
    {
      h: 'Who runs this',
      p: [
        `Explore Vieques is operated by ${COMPANY}, ${ADDRESS}. You can reach us at ${CONTACT}.`,
        'These terms, our privacy policy and our refund policy together form the agreement between you ' +
          `and ${COMPANY}.`,
      ],
    },
    {
      h: 'Who can use it',
      p: [
        'You must be at least 18 years old and able to form a binding contract to create an account or ' +
          'buy a pass.',
      ],
    },
    {
      h: 'Your account',
      p: [
        'You need an account to buy a pass. Give us a real email address and keep your password to ' +
          'yourself — you are responsible for what happens under your account.',
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
          'charged. Payments are processed by Stripe. Refunds are covered by our refund policy.',
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
        'Listings of restaurants, tour operators and other businesses are information, not ' +
          'endorsements. We are not a party to anything you arrange with them.',
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
          'paywall or interfere with the Services, or use the AI assistant to generate abusive or ' +
          'unlawful material. We may suspend or close accounts that do.',
      ],
    },
    {
      h: 'Our content',
      p: [
        `The island content, written descriptions, photos we provide, and design belong to ${COMPANY} ` +
          'or its licensors. A pass gives you a personal, non-transferable right to use the app for its ' +
          'term. Republishing the data is not included. Map data © OpenStreetMap contributors.',
      ],
    },
    {
      h: 'Ending your account',
      p: [
        'You can delete your account at any time from your account page. Deleting it ends any active ' +
          'pass immediately — if you are due a refund, request it before you delete.',
        'We may suspend or close an account that breaks these terms. If we close an account without ' +
          'cause, we will refund the unused part of any active pass.',
      ],
    },
    {
      h: 'Disclaimer',
      p: [
        'TO THE EXTENT THE LAW ALLOWS, THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT ' +
          'WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING ANY WARRANTY OF ACCURACY, ' +
          'MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.',
      ],
    },
    {
      h: 'Liability',
      p: [
        `TO THE EXTENT THE LAW ALLOWS, ${COMPANY.toUpperCase()}’S TOTAL LIABILITY TO YOU FOR ANY CLAIM ` +
          'IS LIMITED TO WHAT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM. WE ARE NOT LIABLE FOR ' +
          'INDIRECT OR CONSEQUENTIAL LOSSES, such as missed ferries, cancelled bookings, or ruined plans, ' +
          'or for injury or loss arising from activities you choose to undertake on the island.',
        'Nothing here limits liability that cannot legally be limited.',
      ],
    },
    {
      h: 'Indemnity',
      p: [
        `If you break these terms or the law while using the Services, and that causes a claim against ${COMPANY}, ` +
          'you agree to cover the reasonable costs of that claim.',
      ],
    },
    {
      h: 'Disputes and governing law',
      p: [
        `If something goes wrong, email ${CONTACT} first and give us 30 days to put it right — most ` +
          'problems are settled that way.',
        'These terms are governed by the laws of the State of Ohio, United States, without regard to its ' +
          'conflict-of-law rules. Any dispute that is not settled informally will be heard in the state or ' +
          'federal courts located in Summit County, Ohio, and both sides consent to their jurisdiction. ' +
          'Either side may instead bring an eligible claim in small-claims court.',
      ],
    },
    {
      h: 'Changes',
      p: [
        'We may update these terms as the product changes. The date at the top tells you when they last ' +
          'changed, material changes will be announced by email to registered users before they take ' +
          'effect, and we may ask you to accept the new version. Continuing to use the Services after ' +
          'that means you accept it.',
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
        <Link to="/" style={styles.brand}>Explore<span style={{ color: 'var(--sea)' }}> Vieques</span></Link>

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
        <p style={styles.operator}>Explore Vieques is operated by {COMPANY}, {ADDRESS}.</p>
      </div>
    </main>
  )
}

export function Terms()   { return <LegalPage doc={TERMS} /> }
export function Privacy() { return <LegalPage doc={PRIVACY} /> }
export function Refunds() { return <LegalPage doc={REFUNDS} /> }

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', background: 'var(--pearl)', padding: '48px 24px 80px', fontFamily: 'var(--font)', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(800px 420px at 50% -10%, rgba(100,219,232,.10), transparent 60%)' },
  // ~68ch of running text. Legal prose is read, not scanned, and a full-width
  // column of it on a desktop monitor is genuinely hard to follow.
  inner: { position: 'relative', maxWidth: 720, margin: '0 auto' },
  brand: { fontFamily: 'var(--font)', fontWeight: 700, fontSize: 18, color: 'var(--text)', textDecoration: 'none' },
  h1: { fontFamily: 'var(--font)', color: 'var(--text)', fontSize: 'clamp(26px,3.4vw,36px)', margin: '28px 0 8px' },
  updated: { color: 'var(--faint)', fontSize: 12.5, margin: '0 0 22px' },
  // The intro carries the answer most people came for, so it gets the emphasis
  // treatment rather than being just another paragraph.
  intro: { color: 'var(--text)', fontSize: 15.5, lineHeight: 1.65, margin: '0 0 8px', padding: '16px 18px', borderRadius: 12, background: 'rgba(100,219,232,.07)', border: '1px solid rgba(100,219,232,.22)' },
  section: { marginTop: 30 },
  h2: { fontFamily: 'var(--font)', color: 'var(--text)', fontSize: 17, margin: '0 0 10px' },
  p: { color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 12px' },
  ul: { margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 },
  li: { color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.6 },
  crossLinks: { display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 44, paddingTop: 22, borderTop: '1px solid rgba(148,163,184,.14)' },
  link: { color: 'var(--sea)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' },
  operator: { color: 'var(--faint)', fontSize: 12.5, lineHeight: 1.6, margin: '16px 0 0' },
}
