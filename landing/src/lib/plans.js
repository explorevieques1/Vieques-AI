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

export const BUSINESS_FEATURE_GROUPS = [
  {
    group: 'Listing',
    rows: [
      { label: 'Pin on the island map',           values: { business_claimed: true, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Name, category, location',        values: { business_claimed: true, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Verified badge',                  values: { business_claimed: true, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Hours, phone, address',           values: { business_claimed: true, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Self-serve editing',              values: { business_claimed: 'Monthly', business_basic: 'Anytime', business_featured: 'Anytime', business_partner: 'Anytime' } },
      { label: 'Photo gallery',                   values: { business_claimed: '1 photo', business_basic: '8 photos', business_featured: '25 photos', business_partner: 'Unlimited' } },
      { label: 'Full description',                values: { business_claimed: false, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Menu / price list',               values: { business_claimed: false, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Website & social links',          values: { business_claimed: false, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Booking / reservation link',      values: { business_claimed: false, business_basic: true, business_featured: true, business_partner: 'Direct handoff' } },
    ],
  },
  {
    group: 'Visibility',
    rows: [
      { label: 'Appears in search & filters',     values: { business_claimed: true, business_basic: true, business_featured: true, business_partner: true } },
      { label: 'Sort tiebreak priority',          hint: 'Disclosed on every paid placement — ranking is never sold', values: { business_claimed: false, business_basic: false, business_featured: true, business_partner: true } },
      { label: 'Featured badge & custom marker',  values: { business_claimed: false, business_basic: false, business_featured: true, business_partner: true } },
      { label: 'Category spotlight slot',         values: { business_claimed: false, business_basic: false, business_featured: '1/month', business_partner: '4/month' } },
      { label: 'Homepage placement',              values: { business_claimed: false, business_basic: false, business_featured: false, business_partner: true } },
      { label: 'Seasonal promo banners',          values: { business_claimed: false, business_basic: false, business_featured: '2/year', business_partner: 'Unlimited' } },
    ],
  },
  {
    group: 'Data',
    rows: [
      { label: 'Profile views',                   values: { business_claimed: false, business_basic: 'Monthly', business_featured: 'Weekly', business_partner: 'Real-time' } },
      { label: 'Directions, clicks & calls',      values: { business_claimed: false, business_basic: false, business_featured: true, business_partner: true } },
      { label: 'Search terms that surfaced you',  values: { business_claimed: false, business_basic: false, business_featured: false, business_partner: true } },
      { label: 'Quarterly performance report',    values: { business_claimed: false, business_basic: false, business_featured: false, business_partner: true } },
    ],
  },
  {
    group: 'Operations',
    rows: [
      { label: 'Locations included',              values: { business_claimed: '1', business_basic: '1', business_featured: '1', business_partner: 'Up to 5' } },
      { label: 'Event calendar',                  values: { business_claimed: false, business_basic: false, business_featured: '3 active', business_partner: 'Unlimited' } },
      { label: 'Team seats',                      values: { business_claimed: '1', business_basic: '1', business_featured: '2', business_partner: '5' } },
      { label: 'Support',                         values: { business_claimed: 'Email', business_basic: 'Email', business_featured: 'Priority', business_partner: 'Named contact' } },
    ],
  },
]

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

export const BUSINESS_PLANS = [
  {
    key: 'business_claimed',
    name: 'Claimed',
    tagline: 'Claim what we already list',
    price: '$0',
    unit: 'free forever',
    cta: 'Claim my listing',
    checkout: false,
  },
  {
    key: 'business_basic',
    name: 'Basic',
    tagline: 'Kiosks, food trucks, small operators',
    price: '$19',
    unit: '/month · $190/yr',
    cta: 'List my business',
    checkout: true,
  },
  {
    key: 'business_featured',
    name: 'Featured',
    tagline: 'Restaurants, dive shops, tour operators',
    price: '$59',
    unit: '/month · $590/yr',
    cta: 'Get Featured',
    checkout: true,
    featured: true,
    badge: 'Recommended',
  },
  {
    key: 'business_partner',
    name: 'Island Partner',
    tagline: 'Hotels and multi-location operators',
    price: '$149',
    unit: '/month · $1,490/yr',
    cta: 'Become a Partner',
    checkout: true,
  },
]

/** Add-ons, sold after purchase rather than on the main ladder. */
export const ADDONS = [
  { key: 'credits', name: 'AI Credit Pack', price: '$4.99', blurb: '+30 Ask AI messages. Never expire.' },
  { key: 'extend',  name: 'Extend Trip',    price: '$4.99', blurb: '+7 days on an active Vacation pass.' },
]

/** Human labels for every plan key, for the success + account pages. */
export const PLAN_LABELS = {
  free: 'Free',
  day_trip: 'Day Trip',
  vacation: 'Vacation',
  exploration: 'Exploration',
  credits: 'AI Credit Pack',
  extend: 'Trip Extension',
  business_claimed: 'Claimed Listing',
  business_basic: 'Basic',
  business_featured: 'Featured',
  business_partner: 'Island Partner',
}
