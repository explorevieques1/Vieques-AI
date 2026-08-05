import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import SignUp from './pages/SignUp.jsx'
import LogIn from './pages/LogIn.jsx'
import Pricing from './pages/Pricing.jsx'
import Account from './pages/Account.jsx'
import Success from './pages/Success.jsx'
import { Terms, Privacy, Refunds } from './pages/Legal.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/login" element={<LogIn />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/success" element={<Success />} />

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
  )
}