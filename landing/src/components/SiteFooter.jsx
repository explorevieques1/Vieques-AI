import { Link } from 'react-router-dom'

// Site footer, shared by the homepage and the Island guide pages.
//
// "The island" column is the guide's main entry point on phones, where the
// nav capsule's section links are hidden (< 760px). Search engines follow
// these links too, so every guide page is reachable from every page.
//
// Legal links stay here because that is where Stripe looks for them.
export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <h4>Explore Vieques</h4>
          <p style={{ margin: 0, maxWidth: '28em' }}>
            The interactive map and AI travel guide for Vieques, Puerto Rico. Made on the island.
          </p>
        </div>
        <nav aria-label="Island guide">
          <h4>The island</h4>
          <ul>
            <li><Link to="/guide">Island guide</Link></li>
            <li><Link to="/beaches">Vieques beaches</Link></li>
            <li><a href="/#faq">Mosquito Bay timing</a></li>
            <li><a href="/#faq">Getting to Vieques</a></li>
          </ul>
        </nav>
        <nav aria-label="Product">
          <h4>Explore Vieques</h4>
          <ul>
            <li><a href="/#pricing">Pricing</a></li>
            <li><Link to="/pricing?for=business">For businesses</Link></li>
            <li><Link to="/login">Sign in</Link></li>
            <li><a href="mailto:hello@explorevieques.org">Contact</a></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h4>Legal</h4>
          <ul>
            <li><Link to="/terms">Terms</Link></li>
            <li><Link to="/privacy">Privacy</Link></li>
            <li><Link to="/refunds">Refunds</Link></li>
          </ul>
        </nav>
      </div>
      <div className="footer-base">
        <span>© 2026 Explore Vieques</span>
        <span>Vieques, Puerto Rico</span>
      </div>
    </footer>
  )
}
