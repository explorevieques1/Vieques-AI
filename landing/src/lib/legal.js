// Facts shared by the legal pages and the sign-up consent checkbox. Kept out of
// pages/Legal.jsx so SignUp can import TERMS_VERSION without pulling the whole
// legal text into its chunk.

/** Bump (to the date it takes effect) whenever the substance of the Terms or
 *  Privacy policy changes. Sign-up stores the version the user agreed to in
 *  public.terms_acceptances (db/migrations/0051). */
export const TERMS_VERSION = '2026-11-16'

/** Shown at the top of every legal page. */
export const LAST_UPDATED = '16 November 2026'

export const COMPANY = 'Red Oak LLC'
export const ADDRESS = '7821 Carter Rd, Northfield, OH 44067, United States'
export const CONTACT = 'hello@explorevieques.org'
