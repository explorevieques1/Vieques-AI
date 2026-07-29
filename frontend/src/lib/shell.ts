/**
 * Which of the four things the app is doing right now.
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
 */
export type ShellMode = 'explore' | 'ai' | 'saved' | 'profile'
