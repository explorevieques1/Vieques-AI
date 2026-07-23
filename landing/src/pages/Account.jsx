import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, signOut, getSession } from '../lib/supabase.js'

export default function Account() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: sessionData } = await getSession()
      const session = sessionData?.session
      if (!session) {
        navigate('/login')
        return
      }
      if (active) setEmail(session.user.email)

      // Read this user's profile. RLS ensures we only get our own row.
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, trip_start, trip_end, created_at')
        .eq('id', session.user.id)
        .single()

      if (active) {
        if (!error) setProfile(data)
        setLoading(false)
      }
    })()
    return () => { active = false }
  }, [navigate])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <main style={styles.wrap}>
      <div style={styles.glow} aria-hidden="true" />
      <div style={styles.card}>
        <Link to="/" style={styles.brand}>
          Explore<span style={{ color: '#06b6d4' }}> Vieques</span>
        </Link>

        <h1 style={styles.h1}>Your account</h1>

        {loading ? (
          <p style={styles.sub}>Loading…</p>
        ) : (
          <>
            <div style={styles.row}><span style={styles.k}>Name</span><span style={styles.v}>{profile?.full_name || '—'}</span></div>
            <div style={styles.row}><span style={styles.k}>Email</span><span style={styles.v}>{profile?.email || email}</span></div>
            <div style={styles.row}><span style={styles.k}>Member since</span><span style={styles.v}>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</span></div>

            <div style={styles.note}>
              {/* Placeholder until subscriptions/credits are wired */}
              No active plan yet. Choose one to unlock the map.
            </div>

            <Link to="/pricing" style={styles.btn}>View plans</Link>
            <button onClick={handleSignOut} style={styles.ghost}>Log out</button>
          </>
        )}
      </div>
    </main>
  )
}

const styles = {
  wrap: { position: 'relative', minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', padding: 24, fontFamily: 'Manrope, system-ui, sans-serif', overflow: 'hidden' },
  glow: { position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(700px 400px at 70% -10%, rgba(6,182,212,.13), transparent 60%)' },
  card: { position: 'relative', width: '100%', maxWidth: 420, background: '#111c33', border: '1px solid rgba(148,163,184,.14)', borderRadius: 16, padding: 32, boxShadow: '0 30px 80px rgba(0,0,0,.4)' },
  brand: { fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2e8f0', textDecoration: 'none', display: 'inline-block', marginBottom: 20 },
  h1: { fontFamily: 'Space Grotesk, sans-serif', color: '#e2e8f0', fontSize: 26, margin: '0 0 20px' },
  sub: { color: '#94a3b8', fontSize: 14 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(148,163,184,.1)' },
  k: { color: '#94a3b8', fontSize: 13 },
  v: { color: '#e2e8f0', fontSize: 14, fontWeight: 600 },
  note: { margin: '20px 0', padding: '12px 14px', borderRadius: 10, background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.25)', color: '#67e8f9', fontSize: 13 },
  btn: { display: 'block', textAlign: 'center', padding: '12px 20px', borderRadius: 10, background: '#06b6d4', color: '#0b1120', fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 10 },
  ghost: { width: '100%', padding: '11px 20px', borderRadius: 10, background: 'transparent', color: '#94a3b8', border: '1px solid rgba(148,163,184,.2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
}