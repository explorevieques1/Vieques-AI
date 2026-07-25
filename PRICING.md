# Explore Vieques — Pricing Model

**Status:** Proposal / working document
**Last updated:** 2026-07-25
**Owner:** Giancarlo

---

## 1. TL;DR — Recommended Ladder

### Travelers (one-time purchases, no subscription)

| Tier | Price | Duration | AI messages | Position |
|---|---|---|---|---|
| **Free / Preview** | $0 | Forever | 3 lifetime | Trust builder + conversion funnel |
| **Day Trip** | **$6.99** | 48 hours | 0 | Ferry day-trippers from Fajardo |
| **Vacation** | **$12.99** | 7 days | 25 | **The volume tier — most people land here** |
| **Exploration** | **$24.99** | 30 days | 150 ("unlimited," fair use) | Anchor + power users, long stays, repeat visitors |

### Businesses (recurring)

| Tier | Price | Annual | Position |
|---|---|---|---|
| **Claimed** | **$0** | — | Land-grab. You need supply density before you can charge. |
| **Basic** | **$19/mo** | $190/yr | Small operators, kiosks, food trucks |
| **Featured** | **$59/mo** | $590/yr | Restaurants, dive shops, tour operators |
| **Island Partner** | **$149/mo** | $1,490/yr | Hotels, multi-location, ferry-adjacent, big operators |

### Add-ons

| Add-on | Price | Notes |
|---|---|---|
| AI Credit Pack | **$4.99** | +30 messages, never expire |
| Extend Trip | **$4.99** | +7 days on an active Vacation pass |
| Group Pass | **+$5.99** | Share one purchase across up to 5 devices |

**Headline change from today:** the current `$9 / 30 days / unlimited AI` plan is both underpriced *and* a COGS risk. Replacing it with a three-tier ladder raises blended ARPU while capping AI exposure.

---

## 2. What Is This Service Actually Worth?

Two different numbers, and the gap between them is the whole pricing problem.

### 2.1 Value delivered (high)

A 4-night Vieques trip for a couple costs **$1,500–$3,000** all-in — flights or ferry, lodging, jeep rental at $75–120/day, Bio Bay tour at $50–70/person, snorkel trips at $75–125.

Against that, the app prevents specific, expensive failures:

| Failure it prevents | What it costs the traveler |
|---|---|
| Driving to a beach that needs 4×4 in a sedan | A half-day, possibly a tow |
| Showing up at a restaurant that's closed (Vieques hours are famously erratic) | A ruined dinner, a 25-min drive each way |
| Booking Bio Bay on a full moon | A $60/person dud |
| Missing that a beach is sargassum-choked | A wasted beach day |
| Not knowing which beaches have zero facilities | Genuinely miserable afternoon |

Preventing **one** of these is worth $50–150. Value delivered is comfortably in the low hundreds.

### 2.2 Willingness to pay (much lower)

Perceived value of a travel app is anchored to App Store norms — **$0–15** — not to trip cost. Free alternatives (Google Maps, TripAdvisor, r/PuertoRico, Facebook groups) are weak on Vieques specifically but they're *free and familiar*.

**Conclusion: the price ceiling is perception-bound, not value-bound.** That's why the sweet spot is $10–15 for the main tier, and why Exploration at $24.99 exists mostly to make Vacation look reasonable. Don't try to price to value here — you'll price yourself out.

### 2.3 The anchoring line to use in copy

> "Less than one Bio Bay tour. Less than half a day of jeep rental."

---

## 3. Cost Floor — Unit Economics

You cannot price below these numbers. Two costs matter: Claude API and Stripe.

### 3.1 AI cost per message

Current Claude API pricing (per million tokens):

| Model | Input | Output |
|---|---|---|
| Opus 5 | $5.00 | $25.00 |
| Sonnet 5 | $3.00 ($2.00 intro through 2026-08-31) | $15.00 ($10.00 intro) |
| Haiku 4.5 | $1.00 | $5.00 |

The chat endpoint in [`backend/server.js`](backend/server.js) runs a **tool-use loop** — typically 2–3 model calls per user question (initial → tool call → final answer), with tool results (beach rows, restaurant rows) pushed back into context. Realistic shape: **~8–12k input tokens, ~700 output tokens** across the whole loop.

| Model | Cost / message (uncached) | With prompt caching |
|---|---|---|
| Haiku 4.5 | ~$0.013 | ~$0.005 |
| **Sonnet 5** | **~$0.040** | **~$0.015** |
| Opus 5 | ~$0.075 | ~$0.030 |

> **Action item:** the system prompt + tool definitions are identical on every request. Adding `cache_control` to that prefix cuts AI COGS roughly **60%**. Do this before launch — it's a one-line change with the largest single margin impact in this document.

**Model recommendation:** Sonnet 5 for the chat endpoint. Haiku 4.5 is tempting at 1/3 the cost, but the product's differentiator *is* the quality of local reasoning — a cheap-feeling AI undermines the entire value prop. Reserve Haiku for any future non-chat classification work.

### 3.2 Stripe fees — why cheap tiers bleed

Stripe takes **2.9% + $0.30**. The fixed $0.30 dominates at low price points:

| Price | Stripe fee | Effective rate |
|---|---|---|
| $2.99 | $0.39 | **13.0%** |
| $4.99 | $0.44 | **8.9%** |
| $6.99 | $0.50 | 7.2% |
| $9.00 | $0.56 | 6.2% |
| $12.99 | $0.68 | 5.2% |
| $24.99 | $1.02 | 4.1% |
| $59.00 | $2.01 | 3.4% |

**This is the argument against a $2.99 or $3.99 entry tier and against the current $3 credit pack** — you'd hand Stripe 11–13% of it. Nothing below ~$5. It's also a quiet argument for annual business billing: $190 once beats $19 × 12 (you save ~$3 in fixed fees plus 11 chances to churn).

### 3.3 Gross margin per tier

| Tier | Price | Stripe | AI COGS (typical) | AI COGS (worst) | Margin (typical) |
|---|---|---|---|---|---|
| Day Trip | $6.99 | $0.50 | $0.00 | $0.00 | **93%** |
| Vacation | $12.99 | $0.68 | $0.30 (avg ~10 of 25 used) | $0.75 | **90%** |
| Exploration | $24.99 | $1.02 | $1.20 (avg ~40 of 150) | $4.50 | **91%** (worst case 78%) |
| Credit Pack | $4.99 | $0.44 | $0.45 | $0.90 | **82%** |
| Business Basic | $19.00 | $0.85 | $0.00 | $0.00 | **96%** |
| Business Featured | $59.00 | $2.01 | $0.00 | $0.00 | **97%** |

**Key insight: metered AI is not really your cost problem.** Even the worst-case Exploration user leaves 78% margin. The cap exists to prevent a pathological outlier (someone scripting 2,000 queries), not to protect typical margin. This means you can be **generous** with message counts — generosity is cheap and converts well.

**Corollary: the true cost driver is Supabase + hosting + your time, not tokens.** Price for adoption, not for COGS.

---

## 4. Traveler Tiers — Full Feature Matrix

Current content inventory: **18 beaches, 35 restaurants, 23 essentials, 12 transport options**, snorkel spots + zones, PostGIS/OSRM routing. Activity and service listings are not yet populated — see §9.

| Feature | Free | Day Trip $6.99 | Vacation $12.99 | Exploration $24.99 |
|---|:---:|:---:|:---:|:---:|
| **Duration** | Forever | 48 hours | 7 days | 30 days |
| **Map & Discovery** | | | | |
| Island map with all pins | ✅ | ✅ | ✅ | ✅ |
| Beach names + photos | Names only | ✅ | ✅ | ✅ |
| Full beach profiles (facilities, 4×4 needed, shade, surf) | ❌ | ✅ | ✅ | ✅ |
| Restaurant profiles (hours, price range, contact) | 3 preview | ✅ | ✅ | ✅ |
| Essentials (groceries, pharmacy, gas, ATM, medical) | ❌ | ✅ | ✅ | ✅ |
| Transport (ferry, taxi, car & jeep rental) | ❌ | ✅ | ✅ | ✅ |
| Activities & tour operators | ❌ | ✅ | ✅ | ✅ |
| Smart filters (by amenity, distance, vibe) | ❌ | ✅ | ✅ | ✅ |
| Search across all categories | ✅ | ✅ | ✅ | ✅ |
| **Navigation** | | | | |
| Turn-by-turn directions (OSRM routing) | ❌ | ✅ | ✅ | ✅ |
| Road-condition warnings (which beaches need 4×4) | ❌ | ✅ | ✅ | ✅ |
| **Water** | | | | |
| Snorkeling zone maps | ❌ | Preview (1 zone) | ✅ All zones | ✅ All zones |
| Snorkel spot detail (entry points, depth, difficulty) | ❌ | ❌ | ✅ | ✅ |
| Bio Bay moon-phase timing guide | ❌ | ❌ | ✅ | ✅ |
| **Ask AI** | | | | |
| AI messages | 3 lifetime | ❌ | **25** | **150** (fair use) |
| Tool-grounded answers (searches real listings) | ✅ | — | ✅ | ✅ |
| Conversation history saved | ❌ | — | ✅ | ✅ |
| **Planning** | | | | |
| Save favorites | ❌ | ✅ | ✅ | ✅ |
| Multi-day itinerary builder | ❌ | ❌ | ❌ | ✅ |
| Export itinerary (PDF / share link) | ❌ | ❌ | ❌ | ✅ |
| Offline map pack | ❌ | ❌ | ❌ | ✅ |
| **Support** | | | | |
| Email support | ❌ | ❌ | ✅ | ✅ Priority |
| Devices | 1 | 1 | 2 | 5 |

### 4.1 Why each tier exists

**Free / Preview — non-negotiable.** Right now the map app is behind a hard paywall ([`AccessGate.tsx`](frontend/src/components/AccessGate.tsx)). **This is the single biggest conversion risk in the product.** Nobody pays $13 for an app they've never seen, from a brand they've never heard of, for an island they're visiting once. The free tier isn't charity — it's the top of the funnel. Show the map, show pins with names, give 3 AI messages, then gate the detail.

**Day Trip $6.99 / 48h / no AI.** Vieques gets substantial ferry day-trip traffic from Fajardo — people who arrive at 9am and leave at 4pm. They don't need AI; they need "which beach, how do I get there, where do I eat, when's the ferry back." Low price, near-100% margin, and it's an upsell surface: *"Staying longer? Upgrade to Vacation for $6 more."*

**Vacation $12.99 / 7 days / 25 AI.** The volume tier. Typical Vieques stay is 3–5 nights, so 7 days covers it with slack. 25 messages is generous against observed behavior (most users will use 8–12) — the number is there to feel abundant, not to ration.

**Exploration $24.99 / 30 days / 150 AI.** Two jobs. First, real value for long stays, repeat visitors, snowbirds, and people planning a group trip. Second — and mostly — it's a **decoy anchor**: with $24.99 on the right, $12.99 reads as the sensible middle rather than the expensive option. Classic center-stage effect. The itinerary builder and offline pack are what justify it rather than "more AI."

### 4.2 Alternative: conservative launch ladder

If $24.99 feels aggressive against a $9 incumbent price, launch at:

| Tier | Conservative | Recommended |
|---|---|---|
| Day Trip | $4.99 | $6.99 |
| Vacation | $9.99 | $12.99 |
| Exploration | $19.99 | $24.99 |

**I'd still start at the recommended numbers.** Raising prices later on a live product is harder than discounting — you can always run a launch promo (`LAUNCH30`) off the higher list price, which also gives you a real reference price for anchoring. Discounting down is easy; ratcheting up annoys early adopters.

---

## 5. Business Tiers — Full Feature Matrix

| Feature | Claimed $0 | Basic $19/mo | Featured $59/mo | Partner $149/mo |
|---|:---:|:---:|:---:|:---:|
| **Listing** | | | | |
| Pin on the island map | ✅ | ✅ | ✅ | ✅ |
| Name, category, location | ✅ | ✅ | ✅ | ✅ |
| Verified badge | ✅ | ✅ | ✅ | ✅ |
| Hours, phone, address | ✅ | ✅ | ✅ | ✅ |
| Self-serve editing | Monthly | ✅ Anytime | ✅ Anytime | ✅ Anytime |
| Photo gallery | 1 photo | 8 photos | 25 photos | Unlimited |
| Full description | ❌ | ✅ | ✅ | ✅ |
| Menu / price list / service list | ❌ | ✅ | ✅ | ✅ |
| Website + social links | ❌ | ✅ | ✅ | ✅ |
| Booking / reservation link | ❌ | ✅ | ✅ | ✅ Direct handoff |
| **Visibility** | | | | |
| Appears in search & filters | ✅ | ✅ | ✅ | ✅ |
| Sort tiebreak priority *(disclosed)* | ❌ | ❌ | ✅ | ✅ |
| Featured badge + custom map marker | ❌ | ❌ | ✅ | ✅ |
| Category spotlight slot | ❌ | ❌ | 1/month | 4/month |
| Homepage / launch-screen placement | ❌ | ❌ | ❌ | ✅ |
| Seasonal promo banners | ❌ | ❌ | 2/year | Unlimited |
| **Data** | | | | |
| Profile views | ❌ | ✅ Monthly | ✅ Weekly | ✅ Real-time |
| Direction requests, link clicks, calls | ❌ | ❌ | ✅ | ✅ |
| Search terms that surfaced you | ❌ | ❌ | ❌ | ✅ |
| Quarterly performance report | ❌ | ❌ | ❌ | ✅ |
| **Ops** | | | | |
| Locations included | 1 | 1 | 1 | Up to 5 |
| Event calendar | ❌ | ❌ | 3 active | Unlimited |
| Team seats | 1 | 1 | 2 | 5 |
| Support | Email | Email | Priority | Named contact |

### 5.1 ⚠️ The AI-recommendation integrity problem — read this

**The current Featured tier promises "Highlighted in AI recommendations." Do not ship that as written.**

The entire value of this product is that a traveler trusts what it tells them. The moment a paid tier can buy its way into an AI answer, you have two failure modes:

1. **You send someone to a mediocre restaurant because it paid.** They have a bad dinner, they don't come back, and they tell people.
2. **A business figures out the recommendations are pay-to-play.** Now it's an ad network with a chatbot, and your defensibility (trusted curation) is gone.

This is not a hypothetical risk — it's the exact mechanism that hollowed out TripAdvisor's and Yelp's credibility.

**Sell visibility, not the answer:**

| ❌ Don't sell | ✅ Do sell |
|---|---|
| Inclusion in AI recommendations | Richer profile data the AI can cite when it's genuinely relevant |
| Ranking override | **Tiebreak** among genuinely equivalent results, clearly labeled |
| Undisclosed placement | A visible "Featured Partner" badge |
| Suppressing competitors | Spotlight slots in a clearly-marked promotional surface |

**Implementation rule:** paid status may only break ties among results the ranker already considers equally relevant, and any paid surface must carry a visible label. Encode this in the ranking layer, not just in policy — and write it into the business ToS so you're not tempted later when a hotel offers you $500 to be "the top recommendation."

Free listings must be genuinely useful. A directory with 12 paying restaurants and nothing else is worthless to travelers, which makes it worthless to the 12 restaurants.

### 5.2 Why the business side is repriced down from $29/$79

The current $29/$79 is priced as if Vieques were a mainland market. It isn't. Realistic addressable market:

| Category | Est. businesses |
|---|---|
| Restaurants, bars, food trucks | ~35–45 |
| Tour & activity operators (Bio Bay, snorkel, kayak, horse) | ~20 |
| Lodging (guesthouses, small hotels, rentals) | ~15–25 |
| Transport (taxi, car/jeep rental, ferry-adjacent) | ~12 |
| Retail, services, wellness | ~20 |
| **Total** | **~100–120** |

Many are small, cash-based, and don't have a website. $29/mo = $348/yr is a real ask for a beach kiosk. $19 clears the "sure, why not" bar.

**But $59 for Featured is defensible and I'd hold that line.** The pitch writes itself for anyone selling a ticketed experience:

> "One extra Bio Bay booking a month covers this three times over."

A dive shop selling $100 trips needs **0.6 incremental bookings/month** to break even on Featured. That's the whole sales conversation.

**The free Claimed tier is the strategic core of the business side.** Sequence:

```
Free listings → directory density → traveler value → traveler volume
      ↑                                                      ↓
      └──────── businesses want in ←── visible referral traffic
```

You cannot skip step one. Give away listings aggressively for the first 6–12 months and monetize once you can show operators a real number for how many people looked at their page.

---

## 6. Pricing Psychology — Why These Numbers

| Technique | Where it's used |
|---|---|
| **Center-stage / decoy** | Exploration at $24.99 makes Vacation at $12.99 the obvious pick. Most revenue comes from the middle. |
| **Charm pricing** | `.99` throughout. Boring, but it measurably works in consumer travel. |
| **Duration framing** | "7 days" not "1 week" — bigger number, same thing. "48 hours" not "2 days." |
| **Cost anchoring** | Always compare to a trip line item (Bio Bay tour, jeep day) — never to another app. |
| **Abundance framing** | 25 messages when people use 10. Make limits feel like a formality. |
| **Loss aversion** | "Your pass covers your whole stay" beats "7-day access." |
| **Annual discount** | Business annual = 10 months for 12. Cuts churn and Stripe fixed fees. |
| **Risk reversal** | 7-day money-back guarantee. Redemption on a $13 travel purchase will be under 2% — cheap conversion lift. |

**Copy to avoid:** never say "unlimited" for Exploration without a fair-use footnote. Say **"Unlimited Ask AI*"** with `*Fair use: 150 messages/month` in small print. Legally safer, and it's what every competitor does.

---

## 7. Seasonality & Revenue Model

The two sides of this business have opposite revenue shapes, and that's the point.

```
Traveler revenue (spiky, seasonal)     Business revenue (flat, recurring)
Dec ████████████                       Dec ████████
Jan ██████████████                     Jan ████████
Feb ██████████████                     Feb ████████
Mar ████████████████  ← peak           Mar ████████
Apr ████████████                       Apr ████████
May ████████                           May ████████
Jun ███████                            Jun ████████
Jul ████████                           Jul ████████
Aug ████     ← hurricane season        Aug ████████
Sep ███      ← trough                  Sep ████████
Oct ████                               Oct ████████
Nov ███████                            Nov ████████
```

**Strategic read: travelers are the audience; businesses are the revenue.**

Traveler income is seasonal, one-time, and never compounds — every December you start from zero. Business subscriptions are smooth, recurring, and grow. But businesses only pay because travelers are there. So:

- **Price travelers for adoption and reach**, not for margin extraction. Every paid traveler is proof-of-audience you sell to operators.
- **Monetize businesses for margin.** That's the line that turns this into a real business.
- **Use the Aug–Oct trough** for business sales, content work, and data refresh — not for traveler acquisition.

### 7.1 Realistic Year 1 projection

These are deliberately conservative. Treat as an order-of-magnitude sanity check, not a forecast.

| Line | Assumption | Year 1 |
|---|---|---|
| Traveler conversions | ~1,500 paid @ $13 blended | **$19,500** |
| Add-ons (credits, extends, group) | ~12% attach @ $5 | **$900** |
| Business subscriptions | 25 paying @ ~$35 blended/mo | **$10,500** |
| **Gross revenue** | | **~$30,900** |
| Stripe (~5%) | | −$1,550 |
| Claude API | ~15k messages @ $0.02 cached | −$300 |
| Supabase + Vercel + Railway | ~$60/mo | −$720 |
| **Net** | | **~$28,300** |

**Read this honestly:** that's a solid side business, not a venture outcome. The path to $100k+ is (a) business subscriptions growing to 60–80 accounts, and (b) replicating the platform to Culebra, then other Caribbean islands — the codebase is island-agnostic; the *content* is the moat.

---

## 8. Implementation Notes

Mapping to the existing plan config in [`backend/payments.js:66-68`](backend/payments.js#L66-L68):

```js
// Replace current PLANS block
export const PLANS = {
  // ── Travelers (one-time) ───────────────────────────────────────────
  day_trip:    { name: 'Day Trip',    amount:  699, mode: 'payment',
                 description: 'Full island access for 48 hours',
                 grants: { type: 'access', days: 2,  aiMessages: 0   } },
  vacation:    { name: 'Vacation',    amount: 1299, mode: 'payment',
                 description: 'Everything you need for your stay',
                 grants: { type: 'access', days: 7,  aiMessages: 25  } },
  exploration: { name: 'Exploration', amount: 2499, mode: 'payment',
                 description: 'Full access, 30 days, all features',
                 grants: { type: 'access', days: 30, aiMessages: 150 } },

  // ── Add-ons ────────────────────────────────────────────────────────
  credits:     { name: 'AI Credit Pack', amount: 499, mode: 'payment',
                 grants: { type: 'credits', amount: 30 } },
  extend:      { name: 'Extend Trip',    amount: 499, mode: 'payment',
                 grants: { type: 'extend',  days: 7 } },

  // ── Businesses (recurring) ─────────────────────────────────────────
  business_basic:    { name: 'Basic',    amount: 1900,  mode: 'subscription',
                       interval: 'month', grants: { type: 'listing', tier: 'basic'    } },
  business_featured: { name: 'Featured', amount: 5900,  mode: 'subscription',
                       interval: 'month', grants: { type: 'listing', tier: 'featured' } },
  business_partner:  { name: 'Partner',  amount: 14900, mode: 'subscription',
                       interval: 'month', grants: { type: 'listing', tier: 'partner'  } },
};
```

### Required changes

| # | Change | Where | Priority |
|---|---|---|---|
| 1 | Grant **AI message allowance at purchase**, not a separate credit purchase | `payments.js → handleWebhook()` | 🔴 Blocker |
| 2 | Deduct 1 credit per `/api/ai/chat` call; return remaining balance in response | `server.js` | 🔴 Blocker |
| 3 | Free tier — let unpaid users see the map + 3 AI messages | `AccessGate.tsx` | 🔴 Blocker |
| 4 | Add `cache_control` to the Claude system prompt + tool definitions | `server.js`, `aiTools.js` | 🟠 High (−60% AI cost) |
| 5 | Show remaining messages + days in the map UI header | `frontend/src/components/` | 🟠 High |
| 6 | Upgrade path: Day Trip → Vacation, prorated | `payments.js` | 🟡 Medium |
| 7 | Annual billing option for business tiers | `payments.js` | 🟡 Medium |
| 8 | Ranking layer: paid status as **disclosed tiebreak only** | AI tool layer | 🔴 Blocker (see §5.1) |
| 9 | Business self-serve dashboard (edit listing, view stats) | New | 🟡 Medium |

The append-only credit ledger already in the schema handles #1 and #2 cleanly — grant `aiMessages` as a positive ledger row on webhook, write a negative row per chat call, balance = `SUM(amount)`.

---

## 9. Open Questions & Risks

| # | Question | Why it matters |
|---|---|---|
| 1 | **Activity and service listings are empty.** | Both are listed as paid features in §4. Either populate before launch or remove from the matrix — shipping an empty category is worse than not having it. |
| 2 | Do we have data rights to publish restaurant hours/menus? | Scraped hours that go stale are a trust liability. Ideally each is operator-confirmed via the free Claimed tier. |
| 3 | Refund policy for weather/hurricane cancellations? | A traveler who buys a pass and then cancels their trip will ask. Suggest: full refund if no AI messages used and <24h since purchase. |
| 4 | Does the 48h Day Trip clock start at purchase or first app open? | **First open.** Someone who buys the night before shouldn't lose half their window. Non-obvious and worth getting right. |
| 5 | Multi-device enforcement mechanism? | Listed as a tier differentiator but currently unenforced. Either enforce it or drop it from the matrix — an unenforced limit is just a lie in the pricing table. |
| 6 | Tax handling — PR sales tax (IVU) on digital goods? | Talk to an accountant before you have revenue, not after. Stripe Tax can automate collection. |
| 7 | Content freshness SLA? | The value prop is "what's actually open." That requires an update cadence you can sustain — decide now whether it's weekly, monthly, or operator-driven. |

---

## 10. Pre-Launch Checklist

- [ ] Free tier ships (map visible, 3 AI messages) — **the single highest-leverage change**
- [ ] Prompt caching enabled on the Claude tool-use loop
- [ ] Credit metering wired end-to-end (grant on webhook → deduct on chat → display in UI)
- [ ] Paid-placement ranking policy encoded in the ranker + written into business ToS
- [ ] Activity/service listings populated *or* removed from the pricing matrix
- [ ] "Unlimited*" fair-use footnote on Exploration
- [ ] 7-day money-back guarantee published
- [ ] Free Claimed listings offered to all ~100 island businesses before charging anyone
- [ ] Pricing page rebuilt for 3 traveler tiers + 4 business tiers ([`landing/src/pages/Pricing.jsx`](landing/src/pages/Pricing.jsx))
