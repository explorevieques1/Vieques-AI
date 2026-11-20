/**
 * Which of the five things the app is doing right now.
 *
 * On a phone these are not separate screens — they are what the one bottom
 * sheet is currently showing, driven by the bottom nav. That is the whole point
 * of the mobile rebuild: there is a single display surface, and `mode` says
 * what is on it. Desktop has the room for real overlays, so it renders the same
 * bodies inside floating panels instead.
 *
 * Directions is deliberately NOT here. It is a task you start and finish, not a
 * place you are, so it stays a hamburger overlay that can sit on top of any
 * mode.
 *
 * 'menu' is phone-only: the ☰ list (Home, Build Itinerary, Directions, Buy
 * Credits, Log Out) shown in the sheet. Desktop keeps the dropdown in MapTopBar
 * and never enters this mode.
 *
 * 'collection' is Vieques Cards' inventory (docs/CARD_UI_SPEC.md S-6, L-5),
 * reached from Menu / Profile on a phone and the MapTopBar dropdown on desktop.
 * It has no bottom-nav cell of its own.
 */
export type ShellMode = 'explore' | 'ai' | 'saved' | 'profile' | 'menu' | 'collection'
