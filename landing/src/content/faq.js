// Homepage FAQ — the single source for BOTH the visible FAQ list in Home.jsx
// and the FAQPage JSON-LD that vite.config.js injects into index.html at
// build time. Google requires FAQ structured data to match what is visible on
// the page, so never put an answer in one place and not the other: edit here.
//
// Plain strings only (no JSX) — this file is also imported by the build.

export const FAQ = [
  {
    q: 'How do I get to Vieques?',
    a: 'Take the ferry from Ceiba on the main island of Puerto Rico, or a short flight to Vieques airport (VQS) from San Juan or Ceiba. The map has the ferry terminal, airlines, water taxis and what to do once you land.',
  },
  {
    q: 'Do I need a car in Vieques?',
    a: 'Most visitors rent one. Públicos and taxis cover the towns, but many of the best beaches are inside the wildlife refuge, and some of the roads there need a 4x4. The map shows car, jeep, golf cart and UTV rentals, plus which beaches need high clearance.',
  },
  {
    q: 'When is the best time to see Mosquito Bay?',
    a: 'On the darkest nights, around the new moon. Mosquito Bay is one of the brightest bioluminescent bays in the world, and moonlight washes the glow out. Swimming is not allowed; you see it from a kayak or an electric boat with a licensed tour.',
  },
  {
    q: 'Where is the best snorkeling in Vieques?',
    a: 'Mosquito Pier, Esperanza, La Chiva (Blue Beach), Playa Caracas and Punta Arenas (Green Beach) are the five snorkel spots we map in detail, with zones drawn on the water showing where to enter, where to swim and where to stay out.',
  },
  {
    q: 'Is Explore Vieques a subscription?',
    a: 'No. Every pass is a one-time payment: Day Trip is 24 hours, Vacation is 7 days and Exploration is 30 days. Nothing renews.',
  },
  {
    q: 'Do I need to install an app?',
    a: 'No. Explore Vieques runs in the browser on any phone, tablet or computer. Open it, sign in and the whole island map is there.',
  },
]
