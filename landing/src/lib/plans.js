// ============================================================================
//  plans.js — the pricing catalog the marketing site renders from
// ============================================================================
//
//  SINGLE SOURCE OF TRUTH FOR *DISPLAY*. The authoritative prices live in
//  backend/payments.js → PLANS, which is what actually charges the card. The
//  browser can only ever send a plan KEY to /api/checkout; the amount comes
//  from the server, so a tampered price here cannot cheat the checkout.
//
//  Keep `key` in sync with backend/payments.js. A key that doesn't exist there
//  gets a 400 "Unknown plan" from /api/checkout.
//
//  See PRICING.md for the reasoning behind every number in this file.
//
//  FEATURE VALUES
//  --------------
//    true     → included          (renders as a ✓)
//    false    → not included      (renders as a ✗, dimmed)
//    null     → not applicable    (renders as an em dash)
//    'string' → a qualified value ("25", "3 preview", "Names only")
// ============================================================================

/** Feature rows, grouped, in render order. Every plan answers every row. */
export const TRAVELER_FEATURE_GROUPS = [
  {
    group: 'Map & discovery',
    rows: [
      { label: 'Island map with all pins',        values: { free: true,         day_trip: true,  vacation: true,      exploration: true } },
      { label: 'Beach names & photos',            values: { free: 'Names only',  day_trip: true,  vacation: true,      exploration: true } },
      { label: 'Full beach profiles',             hint: 'Facilities, 4×4 access, shade, surf', values: { free: false, day_trip: true, vacation: true, exploration: true } },
      { label: 'Restaurant profiles',             hint: 'Hours, price range, contact',         values: { free: '3 preview', day_trip: true, vacation: true, exploration: true } },
      { label: 'Essentials',                      hint: 'Groceries, pharmacy, gas, ATM, medical', values: { free: false, day_trip: true, vacation: true, exploration: true } },
      { label: 'Transport',                       hint: 'Ferry, taxi, car & jeep rental',      values: { free: false, day_trip: true, vacation: true, exploration: true } },
      { label: 'Activities & tour operators',     values: { free: false,        day_trip: true,  vacation: true,      exploration: true } },
      { label: 'Smart filters',                   hint: 'By amenity, distance, vibe',          values: { free: false, day_trip: true, vacation: true, exploration: true } },
      { label: 'Search across all categories',    values: { free: true,         day_trip: true,  vacation: true,      exploration: true } },
    ],
  },
  {
    group: 'Navigation',
    rows: [
      { label: 'Turn-by-turn directions',         values: { free: false,        day_trip: true,  vacation: true,      exploration: true } },
      { label: 'Road-condition warnings',         hint: 'Which beaches need 4×4', values: { free: false, day_trip: true, vacation: true, exploration: true } },
    ],
  },
  {
    group: 'Water',
    rows: [
      { label: 'Snorkeling zone maps',            values: { free: false,        day_trip: '1 zone',  vacation: 'All zones', exploration: 'All zones' } },
      { label: 'Snorkel spot detail',             hint: 'Entry points, depth, difficulty', values: { free: false, day_trip: false, vacation: true, exploration: true } },
      { label: 'Bio Bay moon-phase guide',        values: { free: false,        day_trip: false, vacation: true,      exploration: true } },
    ],
  },
  {
    group: 'Ask AI',
    rows: [
      { label: 'AI messages',                     values: { free: '3 lifetime', day_trip: false, vacation: '25',      exploration: '150' } },
      { label: 'Tool-grounded answers',           hint: 'Searches your real listings, not guesses', values: { free: true, day_trip: null, vacation: true, exploration: true } },
      { label: 'Conversation history saved',      values: { free: false,        day_trip: null,  vacation: true,      exploration: true } },
    ],
  },
  {
    group: 'Planning',
    rows: [
      { label: 'Save favorites',                  values: { free: false,        day_trip: true,  vacation: true,      exploration: true } },
      { label: 'Multi-day itinerary builder',     values: { free: false,        day_trip: false, vacation: false,     exploration: true } },
      { label: 'Export itinerary',                hint: 'PDF or share link',    values: { free: false, day_trip: false, vacation: false, exploration: true } },
      { label: 'Offline map pack',                values: { free: false,        day_trip: false, vacation: false,     exploration: true } },
    ],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Email support',                   values: { free: false,        day_trip: false, vacation: true,      exploration: 'Priority' } },
      { label: 'Devices',                         values: { free: '1',          day_trip: '1',   vacation: '2',       exploration: '5' } },
    ],
  },
]

// ============================================================================
//  BUSINESS — NOT FOR SALE YET
// ============================================================================
//  The priced business ladder (BUSINESS_PLANS + BUSINESS_FEATURE_GROUPS) was
//  removed from this file deliberately. It advertised four tiers and 30+
//  features against a product that does not exist: there is no claim flow, no
//  business dashboard, and no analytics anywhere in the codebase.
//
//  It was also broken in a way that would have gone unnoticed until a refund
//  request. The plans in backend/payments.js declare tiers 'basic', 'featured'
//  and 'partner', and NONE of those have an entry in FEATURES — so bestTier()
//  resolves a paying business subscriber all the way down to 'free'. A $149/mo
//  Island Partner would have been charged monthly and received the free tier.
//
//  So the pricing page collects an email instead of a card. What is below is a
//  PREVIEW: deliberately unpriced and marked as upcoming, because publishing a
//  price we have not validated against a real product is how you end up honour-
//  bound to a number that does not work.
//
//  TO RE-INTRODUCE PAID BUSINESS PLANS, all of these must be true:
//    1. FEATURES in backend/payments.js has entries for basic/featured/partner,
//       and bestTier()'s rank map includes them.
//    2. A business can actually claim and edit a listing.
//    3. The analytics those tiers promise are real.
//  Until then this stays a waitlist. See PLATFORM.md §8 Phase 5.
// ============================================================================

/** What we tell business owners is coming, with no prices attached. */
export const BUSINESS_PREVIEW = {
  headline: 'Get found by people already on the island',
  blurb:
    'We are building a way for Vieques businesses to claim their listing, keep their ' +
    'hours and photos current, and see how many travelers found them through the app. ' +
    'It is not ready yet — leave your email and we will come to you first.',
  // Phrased as intentions, not entitlements. No ✓/✗ matrix, because a matrix
  // implies tiers you can buy today.
  planned: [
    'Claim your listing and keep it accurate yourself',
    'Photos, menu, hours, and booking links',
    'A verified badge travelers can trust',
    'See how many people viewed you and tapped for directions',
    'Event and seasonal promotion slots',
  ],
  // The honesty line. Keep it: it is the reason a business owner trusts the
  // rest of the page, and it is the commitment the AI assistant already keeps.
  promise:
    'Paid placement will never buy its way into an AI recommendation. When ranking ' +
    'is influenced by payment we will label it, every time.',
}

/**
 * The traveler ladder. `key: 'free'` is the only entry with no backend plan —
 * its CTA routes to signup instead of Stripe.
 */
export const TRAVELER_PLANS = [
  {
    key: 'free',
    name: 'Free',
    tagline: 'See the island before you buy',
    price: '$0',
    unit: 'forever',
    cta: 'Start free',
    checkout: false,
  },
  {
    key: 'day_trip',
    name: 'Day Trip',
    tagline: 'Off the ferry and back by dark',
    price: '$7.99',
    unit: 'one-time · 24 hours',
    cta: 'Get Day Trip',
    checkout: true,
  },
  {
    key: 'vacation',
    name: 'Vacation',
    tagline: 'Everything you need for your stay',
    price: '$13.99',
    unit: 'one-time · 7 days',
    cta: 'Get Vacation',
    checkout: true,
    featured: true,
    badge: 'Most popular',
  },
  {
    key: 'exploration',
    name: 'Exploration',
    tagline: 'Long stays and repeat visitors',
    price: '$24.99',
    unit: 'one-time · 30 days',
    cta: 'Get Exploration',
    checkout: true,
  },
]

/** Add-ons, sold after purchase rather than on the main ladder. */
export const ADDONS = [
  { key: 'credits', name: 'AI Credit Pack', price: '$4.99', blurb: '+30 Ask AI messages. Never expire.' },
  { key: 'extend',  name: 'Extend Trip',    price: '$4.99', blurb: '+7 days on an active Vacation pass.' },
]

/**
 * Human labels for every plan key, for the success + account pages.
 *
 * The business_* keys stay here even though those plans are no longer sold.
 * They are not dead code: backend/payments.js still defines them and the
 * subscriptions CHECK constraint (0021) still accepts them, so any row created
 * while they were purchasable must still render with a name rather than a raw
 * slug on someone's account page.
 */
export const PLAN_LABELS = {
  free: 'Free',
  day_trip: 'Day Trip',
  vacation: 'Vacation',
  exploration: 'Exploration',
  // Retired from the catalog before the three-tier ladder (0021 keeps it in the
  // CHECK constraint for exactly this reason). Production still holds an active
  // row on this key, and without a label the account page prints the raw slug.
  traveler: 'Traveler',
  credits: 'AI Credit Pack',
  extend: 'Trip Extension',
  business_claimed: 'Claimed Listing',
  business_basic: 'Basic',
  business_featured: 'Featured',
  business_partner: 'Island Partner',
}
