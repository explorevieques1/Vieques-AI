import HeroTerrain from './HeroTerrain.jsx'
import NavBar from './NavBar.jsx'
import { CheckIcon } from './icons.jsx'
import StarBorder from './reactbits/StarBorder.jsx'
import AnimatedContent from './reactbits/AnimatedContent.jsx'
import SplitText from './reactbits/SplitText.jsx'

// Shared frame for the account pages (LogIn, SignUp).
//
// Desktop: the island's contour terrain + the reasons to sign up on the left,
// the form on the right, under the site's capsule nav. Mobile: nav + the form, terrain dimmed
// behind it — on a phone the form IS the page.
//
// The card wears the same StarBorder traveling light as the featured pass on
// pricing, so "this is where you commit" looks the same everywhere.
//
// Pages own their forms and logic; this component only owns layout.
export default function AuthLayout({ pitch, navAction, children }) {
  return (
    <main className="auth-page">
      <HeroTerrain />
      <div className="auth-nav"><NavBar action={navAction} /></div>

      <aside className="auth-aside">
        <div className="auth-pitch">
          <SplitText
            tag="h2"
            text={pitch.title}
            splitType="words"
            effect="rise"
            delay={50}
            duration={0.9}
            textAlign="left"
          />
          <ul>
            {pitch.points.map((p) => (
              <li key={p}><CheckIcon />{p}</li>
            ))}
          </ul>
        </div>

        <p className="auth-small">Made on Vieques, Puerto Rico</p>
      </aside>

      <div className="auth-main">
        <AnimatedContent className="auth-card-wrap" distance={28} duration={0.7} blur={6} trigger="mount">
          <StarBorder
            as="div"
            className="auth-star"
            color="#64DBE8"
            radius={28}
            duration={5}
            thickness={1.5}
            glow={1}
            trailLength={0.45}
            stars={2}
            hover="none"
            clickPulse={false}
            backgroundColor="transparent"
          >
            <div className="auth-card">{children}</div>
          </StarBorder>
        </AnimatedContent>
      </div>
    </main>
  )
}

/** The small reassurance row under an auth form. */
export function AuthTrust() {
  return (
    <div className="auth-trust">
      <span><CheckIcon width={14} height={14} />One-time payment</span>
      <span><CheckIcon width={14} height={14} />Nothing to install</span>
      <span><CheckIcon width={14} height={14} />Refundable within 7 days</span>
    </div>
  )
}
