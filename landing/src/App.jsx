import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'

// Home ships in the main bundle (it is the page people land on and the one
// search engines rank). Everything else is fetched only when visited, so the
// homepage doesn't pay for Account, Legal and the password-reset flow.
const SignUp = lazy(() => import('./pages/SignUp.jsx'))
const LogIn = lazy(() => import('./pages/LogIn.jsx'))
const Pricing = lazy(() => import('./pages/Pricing.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const Success = lazy(() => import('./pages/Success.jsx'))
const Welcome = lazy(() => import('./pages/Welcome.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'))
const Terms = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Privacy })))
const Refunds = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.Refunds })))
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { guideRoutes } from './guideRoutes.jsx'

// index.html ships one canonical (the homepage) for every route, because
// Vercel rewrites all paths to that one file. Without this, /pricing, /terms
// etc. would each tell Google they are duplicates of the homepage.
function useCanonical() {
  const { pathname } = useLocation()
  useEffect(() => {
    const url = 'https://explorevieques.org' + (pathname === '/' ? '/' : pathname.replace(/\/$/, ''))
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url)
  }, [pathname])
}

export default function App() {
  useCanonical()
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--pearl)' }} />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<LogIn />} />
      <Route path="/pricing" element={<Pricing />} />

      {/* Island guide (SEO): /guide, /beaches, /beaches/:slug. Pre-rendered
          to static HTML at build time by scripts/prerender.mjs. */}
      {guideRoutes}
      <Route path="/success" element={<Success />} />

      {/* Where every emailed auth link lands. Supabase appends the tokens to
          this URL; Welcome exchanges them and forwards on. */}
      <Route path="/welcome" element={<Welcome />} />

      {/* Password recovery: request the email, then set the new password on
          the page the emailed link lands on. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Legal. Stripe requires the refund policy and contact details to be
          reachable before live mode; /privacy is needed because we collect
          names and emails from visitors who may be in the EU/UK. */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/refunds" element={<Refunds />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
    </Routes>
    </Suspense>
  )
}