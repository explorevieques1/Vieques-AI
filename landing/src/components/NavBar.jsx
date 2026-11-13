import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSession, signOut, supabase } from '../lib/supabase.js'
import { mapUrlWithSession, launchMapApp } from '../lib/mapApp.js'
import { UserIcon } from './icons.jsx'

// Landing banner: a floating iOS-style capsule with the brand, section links,
// the one orange action, and a profile menu reflecting the Supabase session.
// Section links are absolute (/#map) so they also work from inner pages.
//
// `action` ({ to, label }) swaps the orange button + profile menu for a single
// quiet link. The auth pages use it: on /signup the form's own button is the
// one orange action, so the banner offers "Log in" instead of competing.
export default function NavBar({ action } = {}) {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)

  // Load the current session and keep it live (login/logout in another tab
  // or on another page updates the banner without a refresh).
  useEffect(() => {
    let active = true
    getSession().then(({ data }) => { if (active) setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // Signed in -> open the map app (handing off the session). Not signed in ->
  // start the traveler flow.
  function launchApp() {
    if (session) { launchMapApp(); return }
    try { sessionStorage.setItem('vq_plan', 'vacation') } catch (_) {}
    navigate('/signup?plan=vacation')
  }

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  return (
    <header className={action ? "nav nav-simple" : "nav"}>
      <div className="nav-bar">
        <a href="/#top" className="brand-mark" aria-label="Explore Vieques home">
          <img src="/logo.svg" className="brand-tile" alt="" width="30" height="30" />
          <span className="brand-name">Explore Vieques</span>
        </a>

        <nav className="nav-center" aria-label="Sections">
          <a href="/#map">The map</a>
          {/* "Island guide" replaced "How it works" (2026-11-13): the guide
              pages are what Google ranks, and the nav link tells crawlers
              they matter. How it works is still the next scroll down. */}
          <Link to="/guide">Island guide</Link>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
        </nav>

        <div className="nav-actions">
          {action ? (
            <Link to={action.to} className="btn btn-ghost launch-btn">{action.label}</Link>
          ) : (
            <>
              <button className="btn btn-primary launch-btn" onClick={launchApp}>Open the map</button>
              <ProfileCard session={session} onLogout={handleLogout} />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function ProfileCard({ session, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close the menu when clicking outside of it.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const email = session?.user?.email || ''
  const initial = email ? email.charAt(0).toUpperCase() : ''

  return (
    <div className="profile" ref={ref}>
      <button className="profile-trigger" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open}>
        {session ? <span className="profile-avatar on">{initial}</span> : <UserIcon />}
      </button>

      {open && (
        <div className="profile-menu">
          {session ? (
            <>
              <div className="profile-head">
                <span className="profile-avatar on lg">{initial}</span>
                <div className="profile-id">
                  <span className="profile-email">{email}</span>
                </div>
              </div>
              <Link to="/account" className="profile-item" onClick={() => setOpen(false)}>Account settings</Link>
              <a href={mapUrlWithSession(session)} className="profile-item">Open the map</a>
              <div className="profile-div" />
              <button className="profile-item" onClick={() => { setOpen(false); onLogout() }}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="profile-item bold" onClick={() => setOpen(false)}>Sign in</Link>
              <Link to="/signup" className="profile-item" onClick={() => setOpen(false)}>Create account</Link>
              <div className="profile-div" />
              <Link to="/pricing?for=business" className="profile-item" onClick={() => setOpen(false)}>List your business</Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
