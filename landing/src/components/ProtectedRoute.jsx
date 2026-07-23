import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { getSession } from '../lib/supabase.js'
import { fetchEntitlement } from '../lib/api.js'

// Gate for pages that require BOTH login and an active plan.
// - not logged in       -> /login
// - logged in, no plan   -> /pricing
// - logged in + paid     -> render children
//
// Pass requirePaid={false} for pages that only need login (e.g. /account),
// where you still want to let an unpaid user manage their account.
export default function ProtectedRoute({ children, requirePaid = true }) {
  const [state, setState] = useState('checking') // checking | in | login | pricing

  useEffect(() => {
    let cancelled = false

    async function run() {
      const { data } = await getSession()
      if (cancelled) return

      if (!data.session) { setState('login'); return }

      if (!requirePaid) { setState('in'); return }

      const ent = await fetchEntitlement(data.session)
      if (cancelled) return
      setState(ent.hasAccess ? 'in' : 'pricing')
    }

    run()
    return () => { cancelled = true }
  }, [requirePaid])

  if (state === 'checking') return <p style={{ padding: 24 }}>Loading…</p>
  if (state === 'login') return <Navigate to="/login" replace />
  if (state === 'pricing') return <Navigate to="/pricing" replace />
  return <>{children}</>
}