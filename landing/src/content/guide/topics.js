// ============================================================================
//  topics.js — the four cluster pages: keyword map, <head> copy and FAQs
// ============================================================================
//  ONE SOURCE for each page's title, meta description and FAQ. The FAQ array
//  renders visibly on the page AND becomes its FAQPage JSON-LD (lib/guide.js)
//  — Google requires the two to match, so never answer a question in one
//  place and not the other.
//
//  KEYWORD MAP (research 2026-11-14: Google autocomplete + live SERPs; see the
//  vault's SEO note). Each page owns ONE head term; the rest are phrasings of
//  the same intent, placed in the H1, the H2s and the FAQ questions verbatim,
//  because that is how searchers type them. Don't target a head term on two
//  pages — they would compete with each other.
//
//   /bio-bay         head: vieques bio bay · mosquito bay
//                    + bio bay calendar, best time to see the bio bay,
//                      can you swim in mosquito bay, mosquito bay tours,
//                      bio bay vieques vs fajardo, is mosquito bay worth it
//   /ferry           head: vieques ferry
//                    + how to get to vieques, ferry schedule, ceiba ferry
//                      terminal, how much / how long is the ferry, ferry
//                      from san juan, can you take a car to vieques,
//                      flights to vieques (cape air, vieques air link)
//   /getting-around  head: vieques car rental
//                    + golf cart rental, jeep rental, vieques taxi,
//                      do you need a car in vieques, does vieques have uber,
//                      públicos, car rental near ferry, gas station
//   /restaurants     head: vieques restaurants
//                    + best restaurants esperanza, isabel segunda restaurants,
//                      where to eat in vieques, vieques breakfast,
//                      restaurants near the ferry, vieques dinner
//
//  FACTS: anything that changes (fares, prices, schedules) carries a "checked"
//  date in the copy and links the official source. A wrong ferry fare costs
//  more trust than having no page. Re-check them when FACTS_CHECKED moves.
//
//  {year} in a title/description becomes the build year (lib/guide.js), so
//  "2026" searches match and the page never shows last year.
//
//  Plain strings only (no JSX) — imported by the build for JSON-LD.
// ============================================================================

export const FACTS_CHECKED = 'November 2026'

export const FERRY_OFFICIAL = 'https://www.puertoricoferry.com/'

export const TOPICS = {
  '/bio-bay': {
    nav: 'Bio Bay',
    title: 'Vieques Bio Bay (Mosquito Bay): {year} Moon Calendar & Tours',
    description:
      'The best nights to see Mosquito Bay, the world\u2019s brightest bio bay, by date for the next 12 months. Full-moon closures, tours and prices.',
    blurb: 'Best nights by date, full-moon closures, tours',
    faq: [
      {
        q: 'When is the best time to see the bio bay in Vieques?',
        a: 'On the darkest nights, from about three nights before to three nights after the new moon. Moonlight washes out the glow, so the closer to the new moon the brighter it looks. Most tour operators do not run on the night of the full moon or the nights either side of it.',
      },
      {
        q: 'Can you swim in Mosquito Bay?',
        a: 'No. Swimming has been banned to protect the microorganisms that make the water glow. You see it from a kayak, a clear-bottom kayak or an electric boat, with a licensed tour. Running your hand through the water from the kayak is how you see it light up.',
      },
      {
        q: 'Is Mosquito Bay bioluminescent all year round?',
        a: 'Yes. The glow is there every night of the year. What changes is how well you can see it: moonlight, clouds and heavy rain all affect how bright it looks.',
      },
      {
        q: 'How much is a bio bay tour in Vieques?',
        a: 'Kayak tours from the operators we list start at around $65 per person, and electric-boat tours at around $85. Private tours cost more. Prices are set by each operator and change, so check when you book.',
      },
      {
        q: 'Is the Vieques bio bay better than Fajardo?',
        a: 'Mosquito Bay in Vieques was named the brightest bioluminescent bay in the world by Guinness World Records. Laguna Grande in Fajardo is easier to reach from San Juan as a day trip, but it is smaller. Puerto Rico’s third bio bay is La Parguera, on the southwest coast.',
      },
      {
        q: 'Can I do the Vieques bio bay as a day trip from San Juan?',
        a: 'It is hard. Tours start after dark, and getting back to the main island the same night depends on a late ferry or flight. Most people spend at least one night in Vieques.',
      },
      {
        q: 'Should I wear bug spray or sunscreen on a bio bay tour?',
        a: 'Skip spray-on bug repellent and sunscreen before the tour. Chemicals in the water harm the dinoflagellates. Wear long sleeves if you are worried about bugs, and follow what your guide asks.',
      },
    ],
  },

  '/ferry': {
    nav: 'Getting there',
    title: 'Vieques Ferry {year}: Fares, Tickets, Ceiba Terminal & Flights',
    description:
      'How to get to Vieques: the ferry from Ceiba (fare, crossing time, tickets, parking) or a 30-minute flight from San Juan, checked for {year}.',
    blurb: 'Ferry from Ceiba, fares, tickets, flights',
    faq: [
      {
        q: 'How much is the ferry to Vieques?',
        a: 'The adult fare from Ceiba to Vieques is $2 each way as of November 2026. A rise to $11.25 for non-residents was announced in 2026 and then postponed, most recently to December 31, 2026, so check puertoricoferry.com before you go.',
      },
      {
        q: 'How long is the ferry to Vieques?',
        a: 'The crossing from Ceiba to Vieques takes about an hour. Arrive at the terminal at least an hour before departure; boarding closes 10 minutes before the boat leaves.',
      },
      {
        q: 'Is there a ferry from San Juan to Vieques?',
        a: 'No. Ferries to Vieques leave from Ceiba, on the east coast of Puerto Rico, about 1 to 1.5 hours’ drive from San Juan airport. From San Juan you can also fly straight to Vieques in about 30 minutes.',
      },
      {
        q: 'Where do I buy Vieques ferry tickets?',
        a: 'Online at puertoricoferry.com or in the operator’s app, or at the ticket window at the Ceiba terminal. Only part of each sailing is sold online, so "sold out" online does not always mean the boat is full. Weekends and holidays sell out first.',
      },
      {
        q: 'Can you take a car to Vieques?',
        a: 'Generally no. There is a cargo ferry that carries vehicles, but space goes mainly to residents, and most rental companies on the main island do not allow their cars on it. Rent a car, jeep or golf cart in Vieques instead and book it before you arrive.',
      },
      {
        q: 'Where do I park at the Ceiba ferry terminal?',
        a: 'There is a paid parking lot by the terminal at the former Roosevelt Roads base. Bring cash and leave extra time on weekends and holidays.',
      },
      {
        q: 'What airlines fly to Vieques?',
        a: 'Cape Air and Vieques Air Link fly small planes to Vieques airport (VQS) from San Juan, and there are short hops from Ceiba. The flight from San Juan takes about 30 minutes.',
      },
    ],
  },

  '/getting-around': {
    nav: 'Getting around',
    title: 'Vieques Car Rental, Golf Carts & Taxis: Getting Around',
    description:
      'Do you need a car in Vieques? Rental companies with phone numbers, golf cart vs jeep, taxis and públicos, Uber, gas and refuge roads, from someone who lived there.',
    blurb: 'Car, jeep and golf cart rentals, taxis, públicos',
    faq: [
      {
        q: 'Do you need a car in Vieques?',
        a: 'For most visitors, yes. Taxis and públicos cover the road between Isabel Segunda, the airport and Esperanza, but many of the best beaches are inside the wildlife refuge on dirt roads, and some of them need a 4x4.',
      },
      {
        q: 'Does Vieques have Uber?',
        a: 'Not in any way you can rely on. Use the local taxis and públicos instead. Most do not use meters, so agree on the price before you get in.',
      },
      {
        q: 'Golf cart or jeep in Vieques?',
        a: 'A golf cart is fine for getting around Esperanza and Isabel Segunda. For the refuge beaches on the south and east coast, a jeep or other high-clearance car is safer: some of those roads are rough dirt tracks, and golf carts are slow on the hills and open to the rain.',
      },
      {
        q: 'Can I rent a car near the Vieques ferry?',
        a: 'Yes. Rental companies are based on the island, and many meet you at the ferry dock or the airport if you book ahead. In high season, book weeks before your trip; the island runs out of cars.',
      },
      {
        q: 'Are there gas stations in Vieques?',
        a: 'Only three, all Total stations: in Isabel Segunda, Monte Santo and Marisol. Fuel arrives by boat and stations can run dry in busy weeks, so fill up when you can, especially before a day on the refuge beaches.',
      },
    ],
  },

  '/restaurants': {
    nav: 'Restaurants',
    title: 'Vieques Restaurants: Esperanza & Isabel Segunda, Town by Town',
    description:
      'Every restaurant in Vieques by town: waterfront spots on the Esperanza malecón, local Puerto Rican food in Isabel Segunda, breakfast, pizza, Italian and fine dining.',
    blurb: 'By town: Esperanza, Isabel Segunda, breakfast',
    faq: [
      {
        q: 'Where are the restaurants in Vieques?',
        a: 'In two towns. Esperanza, on the south coast, has the waterfront strip along the malecón. Isabel Segunda, on the north coast where the ferry docks, has most of the local Puerto Rican food, bakeries and breakfast places.',
      },
      {
        q: 'Are Vieques restaurants open every day?',
        a: 'Many are not. Hours change with the season and a lot of places close one or two days a week, so check before you drive across the island for dinner.',
      },
      {
        q: 'Do I need dinner reservations in Vieques?',
        a: 'For the fine-dining restaurants, yes, especially in high season and on weekends. Casual spots and the malecón bars are walk-in.',
      },
      {
        q: 'Where can I eat near the Vieques ferry?',
        a: 'The ferry docks in Isabel Segunda, so the restaurants and bakeries in town are a short walk or taxi ride from the terminal.',
      },
    ],
  },
}
