import { useState } from 'react'
import { startCheckout } from '../lib/api'

type Audience = 'traveler' | 'business'

type Plan = {
  planKey: string
  name: string
  price: string
  cadence: string
  tagline: string
  features: string[]
  cta: string
  highlight?: boolean
}

const TRAVELER_PLANS: Plan[] = [
  {
    planKey: 'traveler',
    name: 'Traveler Plan',
    price: '$9',
    cadence: 'per trip',
    tagline: 'Full island access for your visit',
    features: [
      'Unlimited AI questions about Vieques',
      'Search beaches, food, stays & activities',
      'Interactive HD map with directions',
      'Tap-to-call local businesses',
      'Access for the length of your stay',
    ],
    cta: 'Get Traveler Access',
    highlight: true,
  },
  {
    planKey: 'credits',
    name: 'Pay As You Go',
    price: '$3',
    cadence: 'credit pack',
    tagline: 'Just need a few answers',
    features: [
      'Buy a small pack of AI queries',
      'No subscription',
      'Same map & listings access',
      'Credits never expire during your trip',
    ],
    cta: 'Buy Credits',
  },
]

const BUSINESS_PLANS: Plan[] = [
  {
    planKey: 'business_basic',
    name: 'Basic Plan',
    price: '$29',
    cadence: 'per month',
    tagline: 'Get your business on the map',
    features: [
      'Listing on the Vieques AI map',
      'Appear in AI recommendations',
      'Phone, hours & location displayed',
      'Basic monthly visibility stats',
    ],
    cta: 'List My Business',
    highlight: true,
  },
  {
    planKey: 'business_featured',
    name: 'Featured',
    price: '$79',
    cadence: 'per month',
    tagline: 'Stand out to every visitor',
    features: [
      'Everything in Basic',
      'Priority placement in AI answers',
      'Featured pin styling on the map',
      'Photo gallery & rich profile',
      'Detailed performance analytics',
    ],
    cta: 'Go Featured',
  },
]

function PricingPage() {
  const [audience, setAudience] = useState<Audience>('traveler')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const handleCheckout = async (planKey: string) => {
    setError(null)
    setLoading(planKey)
    try {
      await startCheckout(planKey) // redirects to Stripe on success
    } catch (e) {
      setError((e as Error).message)
      setLoading(null)
    }
  }
  const plans = audience === 'traveler' ? TRAVELER_PLANS : BUSINESS_PLANS

  return (
    <div className="h-full overflow-y-auto bg-slate-900 text-slate-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-2 text-slate-400">
            Whether you're visiting Vieques or running a business here.
          </p>
        </div>

        {/* Audience toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setAudience('traveler')}
              className={`px-6 py-2 text-sm rounded-full transition-colors ${
                audience === 'traveler'
                  ? 'bg-cyan-500 text-slate-900 font-medium'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              I'm a Traveler
            </button>
            <button
              onClick={() => setAudience('business')}
              className={`px-6 py-2 text-sm rounded-full transition-colors ${
                audience === 'business'
                  ? 'bg-cyan-500 text-slate-900 font-medium'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              I own a Business
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-cyan-500 bg-slate-800/80 shadow-lg shadow-cyan-500/10'
                  : 'border-slate-700 bg-slate-800/40'
              }`}
            >
              {plan.highlight && (
                <span className="self-start mb-3 text-xs font-medium px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-300">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-slate-400">{plan.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-slate-400 text-sm">{plan.cadence}</span>
              </div>
              <ul className="mt-6 space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-cyan-400 mt-0.5">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleCheckout(plan.planKey)}
                disabled={loading === plan.planKey}
                className={`mt-6 w-full py-2.5 rounded-lg font-medium transition-colors ${
                  plan.highlight
                    ? 'bg-cyan-500 text-slate-900 hover:bg-cyan-400'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                {loading === plan.planKey ? 'Redirecting…' : plan.cta}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-6 text-center text-sm text-red-300">{error}</p>
        )}
        <p className="mt-8 text-center text-xs text-slate-500">
          Test mode — use Stripe's test card 4242 4242 4242 4242, any future date, any CVC.
        </p>
      </div>
    </div>
  )
}

export default PricingPage