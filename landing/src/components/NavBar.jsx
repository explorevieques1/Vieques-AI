import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSession, signOut, supabase } from '../lib/supabase.js'
import { mapUrlWithSession, launchMapApp } from '../lib/mapApp.js'

// Redesigned landing banner: EV brand tile, centered links, Launch App
// button, and a profile dropdown reflecting the real Supabase session.
export default function NavBar() {
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
    try { sessionStorage.setItem('vq_plan', 'traveler') } catch (_) {}
    navigate('/signup?plan=traveler')
  }

  async function handleLogout() {
    await signOut()
    navigate('/')
  }

  return (
    <header className="nav">
      <a href="#top" className="brand-mark">
        <span className="brand-tile" aria-hidden="true">EV</span>
        <span className="brand-wrap">
          <span className="brand-name">EXPLORE <span>VIEQUES</span></span>
          <span className="brand-sub">AI ISLAND GUIDE</span>
        </span>
      </a>

      <nav className="nav-center">
        <a href="#features">Features</a>
        <a href="#how">How it works</a>
        <a href="#pricing">Pricing</a>
      </nav>

      <div className="nav-actions">
        <button className="btn btn-primary launch-btn" onClick={launchApp}>Launch App →</button>
        <ProfileCard session={session} onLogout={handleLogout} />
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
      <button className="profile-trigger" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <span className="profile-burger" aria-hidden="true">☰</span>
        <span className={session ? 'profile-avatar on' : 'profile-avatar'}>{session ? initial : '👤'}</span>
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
              <Link to="/account" className="profile-item" onClick={() => setOpen(false)}>⚙️ Account settings</Link>
              <a href={mapUrlWithSession(session)} className="profile-item">🗺️ Open the map</a>
              <div className="profile-div" />
              <button className="profile-item" onClick={() => { setOpen(false); onLogout() }}>↩️ Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="profile-item bold" onClick={() => setOpen(false)}>Sign in</Link>
              <Link to="/signup" className="profile-item" onClick={() => setOpen(false)}>Create account</Link>
              <div className="profile-div" />
              <a href="#pricing" className="profile-item" onClick={() => setOpen(false)}>🏷️ List your business</a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
