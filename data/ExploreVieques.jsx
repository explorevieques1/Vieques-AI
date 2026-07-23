// ExploreVieques.jsx — standalone React marketing page for Explore Vieques.
// Drop-in single-file component. No CSS framework required; uses inline styles
// plus a small <style> tag for keyframes and hover states.
//
// ────────────────────────────────────────────────────────────────────────────
// HAND-OFF NOTE (Claude Code / real React project):
//   In this preview, React is loaded as a global. When moving this file into a
//   real bundled React project, replace the two marked lines at the top and
//   bottom of the file:
//
//     TOP:    const { useEffect, useRef, useState } = React;
//         →   import React, { useEffect, useRef, useState } from 'react';
//
//     BOTTOM: window.ExploreVieques = ExploreVieques;
//         →   export default ExploreVieques;
//
// ────────────────────────────────────────────────────────────────────────────
// Usage:
//   <ExploreVieques apiBase="https://your-api.example.com" mapSrc="/vieques_map.svg" />
//
// Props:
//   apiBase   backend base URL; CTAs POST to `${apiBase}/api/checkout` { plan }
//   mapSrc    path to a Vieques coastline SVG (transparent background)

// [PREVIEW-ONLY IMPORT — see hand-off note above]
const { useEffect, useRef, useState } = React;

const CYAN = '#06b6d4';
const CYAN_LIGHT = '#67e8f9';
const CYAN_DEEP = '#0891b2';
const SLATE_900 = '#0f172a';
const SLATE_950 = '#0b1120';
const SLATE_800 = '#1e293b';
const SLATE_500 = '#64748b';
const SLATE_400 = '#94a3b8';
const SLATE_300 = '#cbd5e1';
const SLATE_100 = '#f1f5f9';

// ────────────────────────────────────────────────────────────────────────────
// keyframes + hover (single injected sheet)
// ────────────────────────────────────────────────────────────────────────────
const CSS = `
  .ev * { box-sizing: border-box; }
  .ev { font-family: 'Manrope', system-ui, -apple-system, sans-serif; color: ${SLATE_100}; background: ${SLATE_950}; line-height: 1.6; }
  .ev-display { font-family: 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; }
  .ev a { color: inherit; }
  .ev button { font-family: inherit; }
  .ev ::selection { background: rgba(6,182,212,.35); }

  /* subtle grain overlay */
  .ev-grain { position: absolute; inset: 0; pointer-events: none; opacity: .35; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4  0 0 0 0 0.9  0 0 0 0 1  0 0 0 0.08 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  }

  /* section aurora blob */
  .ev-aurora { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; z-index: 0; }

  .ev-btn-primary { background: linear-gradient(180deg, #22d3ee, ${CYAN} 60%, ${CYAN_DEEP}); color: ${SLATE_950}; border: none; font-weight: 700; border-radius: 12px; padding: 13px 22px; cursor: pointer; transition: box-shadow .25s, transform .25s, filter .25s; white-space: nowrap; box-shadow: 0 8px 24px rgba(6,182,212,.35), inset 0 1px 0 rgba(255,255,255,.35); }
  .ev-btn-primary:hover { box-shadow: 0 12px 40px rgba(6,182,212,.55), inset 0 1px 0 rgba(255,255,255,.4); transform: translateY(-2px); filter: brightness(1.05); }
  .ev-btn-ghost { background: rgba(15,23,42,.5); color: ${SLATE_100}; border: 1px solid rgba(148,163,184,.24); font-weight: 600; border-radius: 12px; padding: 13px 22px; cursor: pointer; transition: border-color .25s, background .25s, box-shadow .25s; white-space: nowrap; backdrop-filter: blur(8px); }
  .ev-btn-ghost:hover { border-color: rgba(6,182,212,.6); background: rgba(6,182,212,.1); box-shadow: 0 0 24px rgba(6,182,212,.2); }

  .ev-navlink { color: ${SLATE_400}; text-decoration: none; font-size: 14.5px; font-weight: 600; white-space: nowrap; transition: color .2s; }
  .ev-navlink:hover { color: ${SLATE_100}; }

  .ev-cat { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px 12px; min-width: 68px; color: ${SLATE_400}; cursor: pointer; border: none; background: none; border-bottom: 2px solid transparent; transition: color .2s, border-color .2s; font-family: inherit; flex-shrink: 0; }
  .ev-cat:hover { color: ${SLATE_100}; }
  .ev-cat[data-active="true"] { color: ${SLATE_100}; border-bottom-color: ${CYAN}; }
  .ev-cat-icon { font-size: 20px; line-height: 1; filter: grayscale(15%); }
  .ev-cat-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.02em; }

  .ev-panel { position: relative; border: 1px solid rgba(148,163,184,.14); background: linear-gradient(160deg, rgba(30,41,59,.55), rgba(15,23,42,.5)); border-radius: 22px; transition: transform .3s, border-color .3s, box-shadow .3s; box-shadow: 0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px rgba(2,8,23,.35); }
  .ev-panel::before { content: ""; position: absolute; inset: 0; border-radius: 22px; padding: 1px; background: linear-gradient(160deg, rgba(103,232,249,.25), transparent 40%, transparent 60%, rgba(6,182,212,.15)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; opacity: .6; }
  .ev-panel:hover { transform: translateY(-4px); border-color: rgba(6,182,212,.45); box-shadow: 0 24px 60px rgba(2,8,23,.55), 0 0 40px rgba(6,182,212,.14); }

  .ev-input { width: 100%; background: rgba(15,23,42,.9); border: 1px solid rgba(148,163,184,.22); border-radius: 11px; padding: 12px 14px; color: ${SLATE_100}; font-family: inherit; font-size: 14px; outline: none; transition: border-color .2s; }
  .ev-input:focus { border-color: rgba(6,182,212,.6); }

  .ev-section-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(6,182,212,.35), transparent); }

  @keyframes ev-pinDrop { 0% { opacity: 0; transform: translateY(-28px) scale(.5); } 60% { opacity: 1; transform: translateY(3px) scale(1.05); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes ev-pulseRing { 0% { transform: scale(.5); opacity: .8; } 100% { transform: scale(2); opacity: 0; } }
  @keyframes ev-chatIn { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes ev-floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes ev-blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
  @keyframes ev-dot { 0%,60%,100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-3px); opacity: 1; } }
  @keyframes ev-dashMove { to { background-position: 24px 0; } }
  @keyframes ev-glowPulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
  @keyframes ev-fadeUp { 0% { opacity: 0; transform: translateY(30px); } 100% { opacity: 1; transform: none; } }
  @keyframes ev-auroraShift { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-30px) scale(1.1); } }

  @media (max-width: 640px) {
    .ev-nav-links { display: none !important; }
    .ev-cat { min-width: 60px; padding: 8px 3px 10px; }
    .ev-cat-icon { font-size: 22px; }
    .ev-cat-label { font-size: 10.5px; }
    .ev-brand-sub { display: none; }
  }
`;

// ────────────────────────────────────────────────────────────────────────────
// Reusable: reveal-on-scroll wrapper
// ────────────────────────────────────────────────────────────────────────────
function Reveal({ children, style, className }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return; }
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.85) { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setShown(true); io.unobserve(el); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? 'none' : 'translateY(30px)',
      transition: 'opacity .8s ease, transform .8s cubic-bezier(.22,1,.36,1)',
      willChange: 'opacity, transform',
      ...style,
    }}>{children}</div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Brand: EV tile + EXPLORE VIEQUES wordmark
// ────────────────────────────────────────────────────────────────────────────
function Brandmark({ size = 'md' }) {
  const dims = size === 'lg' ? { tile: 56, font: 22, sub: 11 } : size === 'sm' ? { tile: 34, font: 13, sub: 8 } : { tile: 44, font: 17, sub: 9 };
  return (
    <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}>
      <span aria-hidden style={{
        width: dims.tile, height: dims.tile,
        flexShrink: 0,
        background: CYAN,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 800, fontSize: dims.tile * 0.42, color: SLATE_950,
        letterSpacing: '-0.03em', borderRadius: 3,
        boxShadow: '0 0 24px rgba(6,182,212,.3)',
      }}>EV</span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
        <span className="ev-display" style={{ fontWeight: 800, fontSize: dims.font, color: SLATE_100, whiteSpace: 'nowrap' }}>
          EXPLORE <span style={{ color: CYAN }}>VIEQUES</span>
        </span>
        <span className="ev-brand-sub" style={{ fontSize: dims.sub, letterSpacing: '0.24em', color: SLATE_500, marginTop: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>
          AI ISLAND GUIDE
        </span>
      </span>
    </a>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Category strip (Airbnb-style)
// ────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🌎' },
  { id: 'beaches', label: 'Beaches', icon: '🏖️' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'stays', label: 'Stays', icon: '🏡' },
  { id: 'activities', label: 'Activities', icon: '🏄' },
  { id: 'snorkel', label: 'Snorkel', icon: '🤿' },
  { id: 'transport', label: 'Transport', icon: '🛻' },
  { id: 'essentials', label: 'Essentials', icon: '🧾' },
];

function CategoryStrip({ active, onPick, embedded, style }) {
  if (embedded && style && style.display === 'none') return null;
  return (
    <div style={{
      background: embedded ? 'transparent' : SLATE_950,
      borderBottom: embedded ? 'none' : '1px solid rgba(148,163,184,.08)',
      position: embedded ? 'relative' : 'sticky',
      top: embedded ? 'auto' : 76,
      zIndex: embedded ? 2 : 40,
      backdropFilter: embedded ? 'none' : 'blur(14px)',
      marginTop: embedded ? 'clamp(20px, 3vw, 32px)' : 0,
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: embedded ? '0' : '0 clamp(16px, 4vw, 40px)',
        display: 'flex', gap: 'clamp(2px, 1vw, 8px)',
        overflowX: 'auto', scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        justifyContent: embedded ? 'flex-start' : 'flex-start',
      }}>
        {CATEGORIES.map((c) => (
          <button key={c.id} className="ev-cat" data-active={active === c.id} onClick={() => onPick(c.id)}>
            <span className="ev-cat-icon">{c.icon}</span>
            <span className="ev-cat-label">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Profile card dropdown
// ────────────────────────────────────────────────────────────────────────────
function ProfileCard({ user, onSignIn, onSignUp, onLogout }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(15,23,42,.6)',
        border: '1px solid rgba(148,163,184,.2)',
        borderRadius: 999, padding: '5px 6px 5px 14px',
        cursor: 'pointer', transition: 'border-color .2s, box-shadow .2s',
        color: SLATE_100,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(6,182,212,.4)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,184,.2)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>☰</span>
        <span style={{
          width: 30, height: 30, borderRadius: '50%',
          background: user ? CYAN : SLATE_800,
          color: user ? SLATE_950 : SLATE_400,
          border: user ? 'none' : '1px solid rgba(148,163,184,.25)',
          fontWeight: 800, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {user ? (user.name || user.email).charAt(0).toUpperCase() : '👤'}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: 300, background: SLATE_900,
          border: '1px solid rgba(148,163,184,.16)',
          borderRadius: 16, padding: 8,
          boxShadow: '0 30px 80px rgba(2,8,23,.75), 0 0 0 1px rgba(6,182,212,.04) inset',
          zIndex: 60,
        }}>
          {user ? (
            <>
              <div style={{ padding: '12px 14px 14px', borderBottom: '1px solid rgba(148,163,184,.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', background: CYAN, color: SLATE_950, fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>{(user.name || user.email).charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: SLATE_100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || user.email.split('@')[0]}</div>
                    <div style={{ fontSize: 12, color: SLATE_400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: SLATE_400 }}>
                  <span style={{ padding: '3px 9px', background: 'rgba(6,182,212,.12)', border: '1px solid rgba(6,182,212,.35)', color: CYAN_LIGHT, borderRadius: 999, fontWeight: 700, letterSpacing: '0.04em' }}>{user.plan || 'TRAVELER'}</span>
                  {user.plan !== 'BUSINESS' && <span>· 12 credits</span>}
                </div>
              </div>
              <ProfileItem label="My trip" icon="🗺️" />
              <ProfileItem label="Saved places" icon="💾" />
              <ProfileItem label="Billing" icon="💳" />
              <ProfileItem label="Account settings" icon="⚙️" />
              <div style={{ borderTop: '1px solid rgba(148,163,184,.1)', margin: '6px 0' }} />
              <ProfileItem label="Sign out" icon="↩︎" onClick={() => { onLogout(); setOpen(false); }} />
            </>
          ) : (
            <>
              <ProfileItem bold label="Sign in" onClick={() => { onSignIn(); setOpen(false); }} />
              <ProfileItem label="Create account" onClick={() => { onSignUp(); setOpen(false); }} />
              <div style={{ borderTop: '1px solid rgba(148,163,184,.1)', margin: '6px 0' }} />
              <ProfileItem label="List your business" icon="🏝️" />
              <ProfileItem label="Help center" icon="❔" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
function ProfileItem({ label, icon, onClick, bold }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', textAlign: 'left',
      background: 'none', border: 'none',
      padding: '11px 14px',
      color: SLATE_300, fontWeight: bold ? 700 : 500, fontSize: 14,
      cursor: 'pointer', borderRadius: 10, whiteSpace: 'nowrap',
      transition: 'background .15s',
      fontFamily: 'inherit',
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(148,163,184,.08)'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {icon && <span style={{ width: 20, textAlign: 'center' }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hero phone (real coastline SVG + rotating typed AI prompts)
// ────────────────────────────────────────────────────────────────────────────
const PROMPTS = [
  { q: 'Where can I swim with turtles?', a: 'Try Playa la Chiva — calm water and a mapped snorkeling zone where turtles feed.', place: 'Playa la Chiva', pins: 3 },
  { q: 'Where do I rent a car?', a: 'Head to Isabel II near the ferry — 4 spots rent jeeps and side-by-sides.', place: 'Isabel II', pins: 4 },
  { q: 'Find me a good seafood dinner', a: 'El Blok in Esperanza does fresh local seafood with a sunset view.', place: 'El Blok', pins: 2 },
];

function HeroPhone({ mapSrc }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('typingQ'); // typingQ → thinking → typing → done
  const [qTyped, setQTyped] = useState('');
  const [aTyped, setATyped] = useState('');
  const timersRef = useRef([]);
  const ivRef = useRef(null);

  useEffect(() => {
    let i = idx;
    const clear = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (ivRef.current) { clearInterval(ivRef.current); ivRef.current = null; }
    };
    const run = () => {
      const it = PROMPTS[i];
      setPhase('typingQ'); setQTyped(''); setATyped('');
      let qi = 0;
      ivRef.current = setInterval(() => {
        qi++;
        setQTyped(it.q.slice(0, qi));
        if (qi >= it.q.length) {
          clearInterval(ivRef.current); ivRef.current = null;
          timersRef.current.push(setTimeout(() => {
            setPhase('thinking');
            timersRef.current.push(setTimeout(() => {
              setPhase('typing');
              let ai = 0;
              ivRef.current = setInterval(() => {
                ai++;
                setATyped(it.a.slice(0, ai));
                if (ai >= it.a.length) {
                  clearInterval(ivRef.current); ivRef.current = null;
                  timersRef.current.push(setTimeout(() => setPhase('done'), 400));
                  timersRef.current.push(setTimeout(() => { i = (i + 1) % PROMPTS.length; setIdx(i); run(); }, 4200));
                }
              }, 26);
            }, 850));
          }, 300));
        }
      }, 45);
    };
    timersRef.current.push(setTimeout(run, 2600));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = PROMPTS[idx];

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%' }}>
      {/* glow behind phone */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 520, height: 620, maxWidth: '100%', background: 'radial-gradient(closest-side, rgba(6,182,212,.22), rgba(6,182,212,.07) 55%, transparent 75%)', filter: 'blur(30px)', pointerEvents: 'none' }} />

      <div style={{
        position: 'relative',
        width: 290, aspectRatio: '9 / 19',
        borderRadius: 44,
        background: '#0a0f1e',
        border: '10px solid #0a0f1e',
        boxShadow: '0 50px 90px rgba(2,8,23,.95), 0 12px 30px rgba(2,8,23,.8), 0 0 70px rgba(6,182,212,.28), 0 0 0 2px rgba(148,163,184,.18)',
        overflow: 'hidden',
      }}>
        {/* screen */}
        <div style={{
          position: 'relative', width: '100%', height: '100%',
          background: `linear-gradient(170deg, #0d1830, #0a1226 55%, #0c1e33)`,
          borderRadius: 32, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* dynamic island */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 100, height: 26, background: '#000', borderRadius: 999, zIndex: 10 }} />
          {/* grid */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 45% at 50% 44%, rgba(6,182,212,.12), transparent 70%)' }} />

          {/* header */}
          <div style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 16px 8px' }}>
            <span className="ev-display" style={{ fontWeight: 800, fontSize: 13, color: SLATE_100, whiteSpace: 'nowrap' }}>EXPLORE <span style={{ color: CYAN }}>VIEQUES</span></span>
            <span style={{ display: 'flex', gap: 4, background: 'rgba(11,17,32,.85)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 999, padding: '3px 4px', fontSize: 10, fontWeight: 700 }}>
              <span style={{ background: 'rgba(6,182,212,.18)', color: CYAN_LIGHT, padding: '3px 8px', borderRadius: 999 }}>Street</span>
              <span style={{ color: SLATE_500, padding: '3px 8px' }}>Sat</span>
            </span>
          </div>

          {/* map + pins */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <img src={mapSrc} alt="Map of Vieques" style={{ display: 'block', width: '100%', height: 'auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <Pin x="32%" y="30%" delay=".7s" emoji="🛻" />
              <Pin x="15%" y="56%" delay="1s" pulse emoji="🏖️" />
              <Pin x="42%" y="50%" delay="1.3s" emoji="🍽️" />
              <Pin x="55%" y="58%" delay="1.6s" pulse emoji="🐢" light />
              <Pin x="82%" y="42%" delay="1.9s" emoji="✨" />
            </div>
          </div>

          {/* chat + ask bar */}
          <div style={{ position: 'relative', zIndex: 5, padding: '0 12px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ animation: 'ev-chatIn .7s ease 2.3s both' }}>
              <div style={{ animation: 'ev-floaty 5s ease-in-out 3s infinite' }}>
                <div style={{ background: 'rgba(15,23,42,.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 16, padding: '12px 14px', boxShadow: '0 16px 40px rgba(2,8,23,.6)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: SLATE_100, marginBottom: 8, minHeight: 16 }}>
                    {phase === 'typingQ' ? (<>"{qTyped}<Cursor h={11} /></>) : (<>"{current.q}"</>)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: 'rgba(6,182,212,.16)', border: '1px solid rgba(6,182,212,.4)', color: CYAN_LIGHT, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Grotesk', sans-serif" }}>AI</div>
                    <div style={{ fontSize: 11.5, color: SLATE_400, minHeight: 30, flex: 1 }}>
                      {phase === 'thinking' && (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '3px 0' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: CYAN_LIGHT, animation: 'ev-dot 1.2s ease-in-out infinite' }} />
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: CYAN_LIGHT, animation: 'ev-dot 1.2s ease-in-out .15s infinite' }} />
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: CYAN_LIGHT, animation: 'ev-dot 1.2s ease-in-out .3s infinite' }} />
                        </span>
                      )}
                      {phase === 'typing' && (<>{aTyped}<Cursor h={11} /></>)}
                      {phase === 'done' && (
                        <>
                          {current.a.split(current.place)[0]}
                          <span style={{ color: CYAN_LIGHT, fontWeight: 700 }}>{current.place}</span>
                          {current.a.split(current.place)[1]}{' '}
                          <span style={{ color: CYAN, fontWeight: 700 }}>Showing {current.pins} pins →</span>
                        </>
                      )}
                      {phase === 'typingQ' && <span style={{ opacity: 0 }}>placeholder</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(11,17,32,.9)', border: '1px solid rgba(6,182,212,.3)', borderRadius: 999, padding: '10px 14px' }}>
              <span style={{ color: CYAN_LIGHT, fontSize: 13, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>✦</span>
              <span style={{ fontSize: 12, color: SLATE_500, flex: 1 }}>Ask the island anything…</span>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: CYAN, color: SLATE_950, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pin({ x, y, delay, emoji, pulse, light }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}>
      <div style={{ position: 'relative', animation: `ev-pinDrop .6s cubic-bezier(.34,1.56,.64,1) ${delay} both` }}>
        {pulse && <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(6,182,212,.5)', animation: 'ev-pulseRing 2.6s ease-out 1.3s infinite' }} />}
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: SLATE_900, border: `2px solid ${light ? CYAN_LIGHT : CYAN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, boxShadow: `0 6px 18px rgba(6,182,212,${light ? 0.45 : 0.35})` }}>{emoji}</div>
      </div>
    </div>
  );
}

function Cursor({ h = 12 }) {
  return <span style={{ display: 'inline-block', width: 2, height: h, background: CYAN_LIGHT, marginLeft: 1, verticalAlign: -1, animation: 'ev-blink 1s step-end infinite' }} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
function ExploreVieques({ apiBase = 'http://localhost:3001', mapSrc = '/vieques_map.svg' }) {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null); // 'signin' | 'signup' | null
  const [pendingPlan, setPendingPlan] = useState(null);
  const [authError, setAuthError] = useState('');
  const [audience, setAudience] = useState('travelers');
  const [category, setCategory] = useState('all');
  const [checkoutBanner, setCheckoutBanner] = useState(false);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const pwRef = useRef(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('vieques_user') || 'null');
      if (u) setUser(u);
      const params = new URLSearchParams(window.location.search);
      if (params.get('checkout') === 'success') {
        const pend = JSON.parse(localStorage.getItem('vieques_pending') || 'null');
        if (pend) {
          localStorage.setItem('vieques_user', JSON.stringify(pend));
          localStorage.removeItem('vieques_pending');
          setUser(pend);
        }
        setCheckoutBanner(true);
      }
    } catch (e) {}
  }, []);

  const plans = {
    traveler:          { name: 'Traveler Plan',       price: '$9 one-time' },
    credits:           { name: 'Credit Pack',         price: '$3' },
    business_basic:    { name: 'Basic — Business',    price: '$29/mo' },
    business_featured: { name: 'Featured — Business', price: '$79/mo' },
  };

  const startCheckout = async (plan) => {
    setAuthError('');
    try {
      const base = String(apiBase).replace(/\/$/, '');
      const res = await fetch(base + '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      if (data && data.url) { window.location.href = data.url; return; }
      throw new Error('no url');
    } catch (e) {
      setAuthError(`Couldn't reach checkout. Make sure the API is running at ${apiBase}, then try again.`);
    }
  };

  const openPlan = (plan) => {
    if (user) { startCheckout(plan); return; }
    setPendingPlan(plan);
    setAuthMode('signup');
    setAuthError('');
  };

  const submitAuth = (e) => {
    e.preventDefault();
    const email = (emailRef.current?.value || '').trim();
    const pw = pwRef.current?.value || '';
    if (!email || email.indexOf('@') < 1) return setAuthError('Enter a valid email address.');
    if (pw.length < 6) return setAuthError('Password must be at least 6 characters.');
    if (authMode === 'signin') {
      const u = { email, name: email.split('@')[0] };
      try { localStorage.setItem('vieques_user', JSON.stringify(u)); } catch (e2) {}
      setUser(u); setAuthMode(null); setAuthError('');
      return;
    }
    const name = (nameRef.current?.value || '').trim();
    if (!name) return setAuthError('Enter your name.');
    const account = { name, email };
    if (pendingPlan) {
      try { localStorage.setItem('vieques_pending', JSON.stringify(account)); } catch (e3) {}
      startCheckout(pendingPlan);
    } else {
      try { localStorage.setItem('vieques_user', JSON.stringify(account)); } catch (e4) {}
      setUser(account); setAuthMode(null); setAuthError('');
    }
  };

  const logout = () => { try { localStorage.removeItem('vieques_user'); } catch (e) {} setUser(null); };

  return (
    <div id="top" className="ev" style={{ background: SLATE_950, minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{CSS}</style>

      {/* ─── NAV BANNER (bold) ─── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: `linear-gradient(180deg, ${SLATE_950} 0%, rgba(11,17,32,.92) 100%)`,
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(148,163,184,.1)',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '12px clamp(14px, 4vw, 40px)',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: '0 0 auto' }}>
            <Brandmark size="md" />
          </div>
          <nav className="ev-nav-links" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(20px, 4vw, 40px)' }}>
            <a href="#features" className="ev-navlink">Features</a>
            <a href="#how" className="ev-navlink">How it works</a>
            <a href="#pricing" className="ev-navlink">Pricing</a>
          </nav>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => openPlan('traveler')}
              className="ev-btn-primary"
              style={{ padding: '10px 20px', fontSize: 14, borderRadius: 10 }}
            >Launch Map →</button>
            <ProfileCard
              user={user}
              onSignIn={() => { setAuthMode('signin'); setPendingPlan(null); setAuthError(''); }}
              onSignUp={() => { setAuthMode('signup'); setPendingPlan(null); setAuthError(''); }}
              onLogout={logout}
            />
          </div>
        </div>
      </header>

      {/* ─── HERO (with embedded category strip) ─── */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        padding: 'clamp(48px, 7vw, 100px) clamp(16px, 5vw, 64px) clamp(56px, 8vw, 110px)',
        background: `radial-gradient(1200px 700px at 78% -10%, rgba(6,182,212,.18), transparent 55%), radial-gradient(900px 600px at 5% 100%, rgba(14,165,233,.14), transparent 60%), linear-gradient(180deg, ${SLATE_950}, #050b18 55%, ${SLATE_950})`,
      }}>
        <div className="ev-aurora" style={{ width: 520, height: 520, top: -140, right: -100, background: 'radial-gradient(closest-side, rgba(6,182,212,.35), transparent)', animation: 'ev-auroraShift 14s ease-in-out infinite' }} />
        <div className="ev-aurora" style={{ width: 420, height: 420, bottom: -160, left: -80, background: 'radial-gradient(closest-side, rgba(14,165,233,.22), transparent)' }} />
        <TopoBg />
        <div className="ev-grain" />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto' }}>
          <CategoryStrip active={category} onPick={setCategory} embedded style={{ display: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(28px, 5vw, 80px)', alignItems: 'center', marginTop: 0 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid rgba(6,182,212,.35)', background: 'rgba(6,182,212,.08)', color: CYAN_LIGHT, fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 999, marginBottom: 20, whiteSpace: 'nowrap', maxWidth: '100%' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: CYAN, display: 'inline-block', animation: 'ev-glowPulse 2.4s ease-in-out infinite' }} />
                Live on Vieques Island, PR
              </div>
              <h1 className="ev-display" style={{ fontSize: 'clamp(32px, 6vw, 68px)', fontWeight: 800, lineHeight: 1.02, margin: '0 0 18px', color: SLATE_100 }}>
                Explore Vieques with an <span style={{ color: CYAN }}>AI island guide</span> in your pocket.
              </h1>
              <p style={{ fontSize: 'clamp(15px, 1.6vw, 19px)', color: SLATE_400, maxWidth: 540, margin: '0 0 28px' }}>
                An interactive map of the whole island — beaches, restaurants, activities, stays, and essentials — with an AI that answers your questions and drops the answers right on the map.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button className="ev-btn-primary" style={{ fontSize: 15, padding: '13px 22px' }} onClick={() => openPlan('traveler')}>Launch Map →</button>
                <a href="#features" className="ev-btn-ghost" style={{ fontSize: 15, padding: '13px 22px', textDecoration: 'none', display: 'inline-block' }}>See features</a>
              </div>
            </div>
            <HeroPhone mapSrc={mapSrc} />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 7vw, 90px) clamp(20px, 5vw, 64px)', background: `linear-gradient(180deg, #0a1020, #0e1a2f 50%, #0a1020)` }}>
        <div className="ev-aurora" style={{ width: 500, height: 500, top: -180, left: '40%', background: 'radial-gradient(closest-side, rgba(56,189,248,.12), transparent)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center', marginBottom: 48 }}>
            <SectionKicker>How it works</SectionKicker>
            <SectionTitle>Three taps to your perfect day.</SectionTitle>
          </div>
        </Reveal>
        <Reveal>
          <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { n: 1, title: 'Open the map', body: 'Every beach, restaurant and service on the island, already pinned.' },
              { n: 2, title: 'Ask or explore', body: 'Filter by what you want, or just ask the AI in plain language.' },
              { n: 3, title: 'Go', body: 'Real driving routes and travel times, one tap to Google Maps.' },
            ].map((s) => (
              <div key={s.n} className="ev-panel" style={{ padding: 30, textAlign: 'center' }}>
                <div className="ev-display" style={{ fontFamily: "'Space Grotesk'", width: 44, height: 44, borderRadius: 12, background: 'rgba(6,182,212,.12)', border: '1px solid rgba(6,182,212,.4)', color: CYAN, fontWeight: 800, fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>{s.n}</div>
                <div className="ev-display" style={{ fontWeight: 700, fontSize: 20, color: SLATE_100, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 14.5, color: SLATE_400 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </Reveal>
        </div>
      </section>
      <div className="ev-section-divider" />

      {/* ─── FEATURES ─── */}
      <section id="features" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 110px) clamp(20px, 5vw, 64px)', background: `radial-gradient(1000px 500px at 100% 0%, rgba(6,182,212,.08), transparent 50%), linear-gradient(180deg, #0b1322, #0f172a 60%, #0b1322)` }}>
        <div className="ev-aurora" style={{ width: 600, height: 600, top: '30%', right: -240, background: 'radial-gradient(closest-side, rgba(6,182,212,.14), transparent)' }} />
        <div className="ev-aurora" style={{ width: 480, height: 480, bottom: -160, left: -160, background: 'radial-gradient(closest-side, rgba(14,116,144,.16), transparent)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <SectionKicker>Features</SectionKicker>
            <SectionTitle>The whole island, one map.</SectionTitle>
            <p style={{ color: SLATE_400, fontSize: 16.5, margin: '12px auto 0', maxWidth: 560 }}>Built from the ground up for Vieques — not a generic travel app with three pins on it.</p>
          </div>
        </Reveal>

        {/* Ask AI flagship panel */}
        <Reveal style={{ marginTop: 'clamp(40px, 6vw, 72px)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', borderRadius: 28, border: '1px solid rgba(6,182,212,.25)', background: `radial-gradient(900px 500px at 20% 0%, rgba(6,182,212,.12), transparent 60%), linear-gradient(160deg, #0d1a30, #0b1322)`, padding: 'clamp(28px, 5vw, 64px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'center', boxShadow: '0 40px 100px rgba(2,8,23,.5)' }}>
            <div>
              <div style={{ background: 'rgba(15,23,42,.85)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
                <ChatBubble side="right">Where do I rent a car?</ChatBubble>
                <ChatBubble side="left">There are 4 rental spots near the ferry in Isabel II — most rent jeeps and side-by-sides. I've pinned them all. 🛻</ChatBubble>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Chip active>📍 4 pins on map</Chip>
                  <Chip>Get directions</Chip>
                </div>
                <ChatBubble side="right">Find me a quiet beach</ChatBubble>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: SLATE_500, fontSize: 13 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: CYAN, animation: 'ev-glowPulse 1.2s ease-in-out infinite' }} />
                  Vieques AI is thinking…
                </div>
              </div>
            </div>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: CYAN_LIGHT, fontSize: 13, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 16 }}>✦ Flagship feature</div>
              <h3 className="ev-display" style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, color: SLATE_100, margin: '0 0 14px' }}>Ask AI. Answers become pins.</h3>
              <p style={{ color: SLATE_400, fontSize: 16, margin: '0 0 24px', maxWidth: 460 }}>Ask anything in plain language — "where do I rent a car?", "find me a quiet beach" — and the assistant answers instantly, dropping the results straight onto the map.</p>
              <button className="ev-btn-primary" style={{ fontSize: 15, padding: '13px 24px' }} onClick={() => openPlan('traveler')}>Try Ask AI</button>
            </div>
          </div>
        </Reveal>

        {/* Grid */}
        <Reveal style={{ marginTop: 'clamp(28px, 4vw, 48px)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <FeatureCard icon="🗺️" title="Interactive Island Map" body="Categorized pins across all of Vieques — beaches, restaurants, activities, stays, transport, essentials.">
              <FeatureMap src={mapSrc} />
            </FeatureCard>
            <FeatureCard icon="🎯" title="Smart Filters" body="Beaches by calm water, family-friendly, snorkeling. Restaurants by cuisine. Services by type.">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Chip active>Calm water</Chip><Chip>Snorkel</Chip><Chip>Seafood</Chip><Chip>Vegan</Chip>
              </div>
            </FeatureCard>
            <FeatureCard icon="🤿" title="Snorkeling Zones" body="Hand-mapped zones showing where to go, where to avoid, and where turtles and rays hang out.">
              <div style={{ position: 'relative', height: 84, borderRadius: 12, background: 'linear-gradient(150deg, #0c1c33, #0a1526)', border: '1px solid rgba(148,163,184,.12)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: '8%', top: '20%', width: '38%', height: '60%', borderRadius: '50% 45% 55% 50%', background: 'rgba(34,197,94,.18)', border: '1.5px dashed rgba(74,222,128,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🐢</div>
                <div style={{ position: 'absolute', left: '56%', top: '28%', width: '32%', height: '48%', borderRadius: '45% 55% 50% 50%', background: 'rgba(244,63,94,.14)', border: '1.5px dashed rgba(251,113,133,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fda4af' }}>avoid</div>
              </div>
            </FeatureCard>
            <FeatureCard icon="🧭" title="Directions & Routing" body="Real driving routes and travel times between any two places, with one-tap Google Maps handoff.">
              <div style={{ position: 'relative', height: 84, borderRadius: 12, background: 'linear-gradient(150deg, #0c1c33, #0a1526)', border: '1px solid rgba(148,163,184,.12)', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 20px' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: CYAN, boxShadow: '0 0 12px rgba(6,182,212,.7)', flexShrink: 0 }} />
                <div style={{ flex: 1, height: 3, margin: '0 10px', background: 'repeating-linear-gradient(90deg, #06b6d4 0 10px, transparent 10px 24px)', animation: 'ev-dashMove 1.2s linear infinite', opacity: 0.8 }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', border: `3px solid ${CYAN}`, flexShrink: 0 }} />
                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: CYAN_LIGHT, background: 'rgba(6,182,212,.12)', border: '1px solid rgba(6,182,212,.4)', padding: '3px 10px', borderRadius: 999 }}>🚗 14 min</div>
              </div>
            </FeatureCard>
            <FeatureCard icon="🍽️" title="Restaurant Profiles" body="Rich detail cards for every restaurant — cuisine, price, hours, directions — like Google Maps, but complete for Vieques.">
              <div style={{ borderRadius: 12, background: 'rgba(15,23,42,.8)', border: '1px solid rgba(148,163,184,.14)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: SLATE_100 }}>El Blok Kitchen</span>
                  <span style={{ fontSize: 12, color: CYAN_LIGHT, fontWeight: 700 }}>Open now</span>
                </div>
                <div style={{ fontSize: 12, color: SLATE_400, marginTop: 3 }}>Seafood · $$ · Esperanza · until 10 pm</div>
              </div>
            </FeatureCard>
            <FeatureCard icon="🏖️" title="Locally curated" body="Every pin verified by people who live here — from Isabel II to Esperanza to the eastern beaches.">
              <div style={{ display: 'flex', gap: 8 }}>
                <Avatar bg="#fbbf24">JR</Avatar><Avatar bg="#f472b6">MA</Avatar><Avatar bg="#a78bfa">CL</Avatar><Avatar>+9</Avatar>
              </div>
            </FeatureCard>
          </div>
        </Reveal>
        </div>
      </section>

      {/* ─── TRUST BAND ─── */}
      <section style={{ position: 'relative', padding: 'clamp(40px, 5vw, 64px) clamp(20px, 5vw, 64px)', background: `linear-gradient(90deg, rgba(6,182,212,.12), rgba(14,116,144,.06) 50%, rgba(6,182,212,.12))`, borderTop: '1px solid rgba(6,182,212,.25)', borderBottom: '1px solid rgba(6,182,212,.25)', boxShadow: 'inset 0 20px 40px rgba(2,8,23,.4), inset 0 -20px 40px rgba(2,8,23,.4)' }}>
        <Reveal>
          <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32, textAlign: 'center' }}>
            <TrustItem title="Built by locals" body="Every pin verified by people who live here." />
            <TrustItem title="Whole island" body="Isabel II, Esperanza, the eastern beaches." />
            <TrustItem title="Any phone" body="Nothing to install — open it in your browser." />
          </div>
        </Reveal>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px, 8vw, 110px) clamp(20px, 5vw, 64px)', background: `radial-gradient(900px 500px at 50% 0%, rgba(6,182,212,.1), transparent 55%), linear-gradient(180deg, #050b18, ${SLATE_950} 40%, #050b18)` }}>
        <div className="ev-aurora" style={{ width: 700, height: 700, top: '10%', left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(closest-side, rgba(6,182,212,.12), transparent)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
            <SectionKicker>Pricing</SectionKicker>
            <SectionTitle>Simple pricing for your trip — or your business.</SectionTitle>
            <p style={{ color: SLATE_400, maxWidth: 520, margin: '12px auto 32px', fontSize: 16.5 }}>Visiting the island, or running a business on it? Either way, there's a plan.</p>

            <div style={{ display: 'inline-flex', background: 'rgba(30,41,59,.6)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 12, padding: 4, gap: 4, marginBottom: 'clamp(32px, 5vw, 52px)' }}>
              <ToggleBtn active={audience === 'travelers'} onClick={() => setAudience('travelers')}>For Travelers</ToggleBtn>
              <ToggleBtn active={audience === 'businesses'} onClick={() => setAudience('businesses')}>For Businesses</ToggleBtn>
            </div>

            {audience === 'travelers' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 780, margin: '0 auto', textAlign: 'left' }}>
                <PricingCard highlighted badge="Most popular" title="Traveler Plan" tagline="Everything, for your whole trip" price="$9" priceSuffix="one-time · 30 days"
                  features={['Unlimited Ask AI questions', 'All categories & smart filters', 'Snorkeling zone maps', 'Directions & routing', 'Restaurant profiles']}
                  cta="Get Traveler Access" onClick={() => openPlan('traveler')} />
                <PricingCard title="Credits" tagline="Pay as you go" price="$3" priceSuffix="per credit pack"
                  features={['20 Ask AI queries per pack', 'Map browsing always free', 'Credits never expire', 'Top up anytime']}
                  cta="Buy Credits" onClick={() => openPlan('credits')} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 780, margin: '0 auto', textAlign: 'left' }}>
                <PricingCard title="Basic" tagline="Get your business on the map" price="$29" priceSuffix="/month"
                  features={['Your pin on the island map', 'Full profile: hours, prices, contact', 'Appears in filters & search', 'Update your listing anytime']}
                  cta="List My Business" onClick={() => openPlan('business_basic')} />
                <PricingCard highlighted badge="Recommended" title="Featured" tagline="Be the answer visitors see first" price="$79" priceSuffix="/month"
                  features={['Everything in Basic', 'Priority placement in results', 'Highlighted in AI recommendations', 'Featured badge & custom marker', 'Seasonal promo slots']}
                  cta="Get Featured" onClick={() => openPlan('business_featured')} />
              </div>
            )}
          </div>
        </Reveal>
        </div>
      </section>

      {/* ─── FINAL CTA + FOOTER ─── */}
      <footer style={{ position: 'relative', overflow: 'hidden', background: `radial-gradient(800px 500px at 50% 0%, rgba(6,182,212,.14), transparent 60%), linear-gradient(180deg, #0a1020, ${SLATE_950})`, borderTop: '1px solid rgba(6,182,212,.2)' }}>
        <Reveal>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(56px, 8vw, 100px) clamp(20px, 5vw, 64px) clamp(40px, 5vw, 64px)', textAlign: 'center' }}>
            <h2 className="ev-display" style={{ fontSize: 'clamp(28px, 3.6vw, 46px)', fontWeight: 700, color: SLATE_100, margin: '0 0 14px', lineHeight: 1.12 }}>Your island guide is waiting.</h2>
            <p style={{ color: SLATE_400, fontSize: 16.5, maxWidth: 460, margin: '0 auto 30px' }}>Land on Vieques knowing exactly where to swim, eat, and explore.</p>
            <button className="ev-btn-primary" style={{ fontSize: 16 }} onClick={() => openPlan('traveler')}>Launch Map →</button>
          </div>
        </Reveal>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px clamp(20px, 5vw, 64px) 40px', borderTop: '1px solid rgba(148,163,184,.08)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <Brandmark size="sm" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <a href="#features" style={{ color: SLATE_500, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>Features</a>
            <a href="#pricing" style={{ color: SLATE_500, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>Pricing</a>
            <a href="#pricing" style={{ color: SLATE_500, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>For Businesses</a>
            <a href="#top" style={{ color: SLATE_500, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>Contact</a>
          </div>
          <div style={{ color: '#475569', fontSize: 12.5 }}>© 2026 Explore Vieques · Made on the island 🇵🇷</div>
        </div>
      </footer>

      {/* ─── CHECKOUT SUCCESS BANNER ─── */}
      {checkoutBanner && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 120, maxWidth: 'calc(100% - 32px)', display: 'flex', alignItems: 'center', gap: 12, background: SLATE_900, border: '1px solid rgba(6,182,212,.5)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 20px 60px rgba(2,8,23,.7), 0 0 30px rgba(6,182,212,.2)' }}>
          <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(6,182,212,.18)', border: '1px solid rgba(6,182,212,.5)', color: CYAN_LIGHT, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
          <div style={{ fontSize: 13.5, color: SLATE_100 }}>Payment complete — your login details are on the way to <span style={{ color: CYAN_LIGHT, fontWeight: 700 }}>{user?.email}</span>.</div>
          <button onClick={() => setCheckoutBanner(false)} style={{ background: 'none', border: 'none', color: SLATE_500, fontSize: 16, cursor: 'pointer', padding: '0 2px' }}>✕</button>
        </div>
      )}

      {/* ─── AUTH MODAL ─── */}
      {authMode && (
        <div onClick={() => setAuthMode(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(3,8,20,.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: SLATE_900, border: '1px solid rgba(148,163,184,.16)', borderRadius: 20, padding: 28, boxShadow: '0 40px 100px rgba(2,8,23,.75)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Brandmark size="sm" />
              <button onClick={() => setAuthMode(null)} style={{ background: 'none', border: 'none', color: SLATE_500, fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            <h3 className="ev-display" style={{ fontSize: 22, fontWeight: 700, color: SLATE_100, margin: '0 0 6px' }}>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</h3>
            <p style={{ fontSize: 14, color: SLATE_400, margin: 0 }}>{authMode === 'signin' ? 'Sign in to pick up where you left off.' : (pendingPlan ? "You'll head to secure checkout next." : 'Get set up in seconds.')}</p>

            {pendingPlan && plans[pendingPlan] && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.3)', borderRadius: 12, padding: '12px 14px' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e0f2fe' }}>{plans[pendingPlan].name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: CYAN_LIGHT, whiteSpace: 'nowrap' }}>{plans[pendingPlan].price}</span>
              </div>
            )}

            <form onSubmit={submitAuth} style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18 }}>
              {authMode === 'signup' && <input ref={nameRef} className="ev-input" type="text" placeholder="Full name" autoComplete="name" />}
              <input ref={emailRef} className="ev-input" type="email" placeholder="Email address" autoComplete="email" />
              <input ref={pwRef} className="ev-input" type="password" placeholder="Password" />
              {authError && <div style={{ fontSize: 13, color: '#fda4af', background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.3)', borderRadius: 10, padding: '9px 12px' }}>{authError}</div>}
              <button type="submit" className="ev-btn-primary" style={{ marginTop: 4, fontSize: 15, padding: '13px 20px' }}>{authMode === 'signin' ? 'Sign in' : (pendingPlan ? 'Continue to payment →' : 'Create account')}</button>
            </form>

            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: SLATE_400 }}>
              {authMode === 'signup'
                ? (<>Already have an account? <button onClick={() => setAuthMode('signin')} style={{ background: 'none', border: 'none', color: CYAN_LIGHT, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>Sign in</button></>)
                : (<>New to Explore Vieques? <button onClick={() => setAuthMode('signup')} style={{ background: 'none', border: 'none', color: CYAN_LIGHT, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>Create an account</button></>)}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(148,163,184,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: SLATE_500 }}>
              <span>🔒</span> Secure payments powered by Stripe
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ────────────────────────────────────────────────────────────────────────────
function SectionKicker({ children }) {
  return <div style={{ color: CYAN, fontWeight: 700, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 14 }}>{children}</div>;
}
function SectionTitle({ children }) {
  return <h2 className="ev-display" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 700, color: SLATE_100, margin: 0, lineHeight: 1.15 }}>{children}</h2>;
}
function FeatureCard({ icon, title, body, children }) {
  return (
    <div className="ev-panel" style={{ padding: 'clamp(22px, 3vw, 32px)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(6,182,212,.12)', border: '1px solid rgba(6,182,212,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 18 }}>{icon}</div>
      <h4 className="ev-display" style={{ fontSize: 20, fontWeight: 700, color: SLATE_100, margin: '0 0 8px' }}>{title}</h4>
      <p style={{ color: SLATE_400, fontSize: 14.5, margin: '0 0 18px' }}>{body}</p>
      {children}
    </div>
  );
}
function FeatureMap({ src }) {
  return (
    <div style={{ position: 'relative', borderRadius: 12, background: 'linear-gradient(150deg, #0c1c33, #0a1526)', border: '1px solid rgba(148,163,184,.12)', overflow: 'hidden', padding: 12 }}>
      <img src={src} alt="Vieques" style={{ display: 'block', width: '100%', height: 'auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    </div>
  );
}
function Chip({ children, active }) {
  const st = active
    ? { color: CYAN_LIGHT, background: 'rgba(6,182,212,.14)', border: '1px solid rgba(6,182,212,.4)' }
    : { color: SLATE_400, background: 'transparent', border: '1px solid rgba(148,163,184,.22)' };
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999, ...st }}>{children}</span>;
}
function ChatBubble({ side, children }) {
  const isRight = side === 'right';
  return (
    <div style={{
      alignSelf: isRight ? 'flex-end' : 'flex-start',
      background: isRight ? 'rgba(6,182,212,.16)' : 'rgba(30,41,59,.9)',
      border: `1px solid ${isRight ? 'rgba(6,182,212,.35)' : 'rgba(148,163,184,.14)'}`,
      color: isRight ? '#e0f2fe' : SLATE_300, fontSize: 14,
      padding: '10px 14px',
      borderRadius: isRight ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
      maxWidth: '90%',
    }}>{children}</div>
  );
}
function Avatar({ children, bg }) {
  return <span style={{ width: 34, height: 34, borderRadius: '50%', background: bg || SLATE_800, color: bg ? SLATE_950 : SLATE_400, border: bg ? 'none' : '1px solid rgba(148,163,184,.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif" }}>{children}</span>;
}
function TrustItem({ title, body }) {
  return (
    <div>
      <div className="ev-display" style={{ fontWeight: 700, fontSize: 19, color: SLATE_100, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: SLATE_400 }}>{body}</div>
    </div>
  );
}
function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700,
      padding: '9px 22px', borderRadius: 9, border: 'none', cursor: 'pointer',
      background: active ? CYAN : 'transparent',
      color: active ? SLATE_950 : SLATE_400,
      whiteSpace: 'nowrap', transition: 'background .25s, color .25s',
    }}>{children}</button>
  );
}
function PricingCard({ highlighted, badge, title, tagline, price, priceSuffix, features, cta, onClick }) {
  const base = {
    position: 'relative', borderRadius: 22,
    padding: 'clamp(24px, 3vw, 34px)',
    transition: 'transform .3s, border-color .3s, box-shadow .3s',
  };
  const highl = {
    border: `1.5px solid rgba(6,182,212,.55)`,
    background: `linear-gradient(170deg, rgba(6,182,212,.09), rgba(15,23,42,.6))`,
    boxShadow: '0 24px 60px rgba(2,8,23,.5), 0 0 40px rgba(6,182,212,.1)',
  };
  const norm = {
    border: '1px solid rgba(148,163,184,.16)',
    background: 'rgba(30,41,59,.35)',
  };
  return (
    <div style={{ ...base, ...(highlighted ? highl : norm) }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      {badge && <div style={{ position: 'absolute', top: -12, left: 26, background: CYAN, color: SLATE_950, fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>{badge}</div>}
      <div className="ev-display" style={{ fontWeight: 700, fontSize: 19, color: SLATE_100 }}>{title}</div>
      <div style={{ color: SLATE_400, fontSize: 14, margin: '4px 0 18px' }}>{tagline}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 22 }}>
        <span className="ev-display" style={{ fontSize: 44, fontWeight: 700, color: SLATE_100 }}>{price}</span>
        <span style={{ color: SLATE_400, fontSize: 14, fontWeight: 600 }}>{priceSuffix}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14.5, color: SLATE_300 }}><span style={{ color: CYAN, fontWeight: 800 }}>✓</span>{f}</div>
        ))}
      </div>
      <button onClick={onClick} className={highlighted ? 'ev-btn-primary' : 'ev-btn-ghost'} style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 15, padding: '13px 20px' }}>{cta}</button>
    </div>
  );
}

// Topography contour background for hero
function TopoBg() {
  return (
    <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <g style={{ transform: 'rotate(-8deg)', transformOrigin: '170px 160px' }}>
        {[[70,42,.10],[125,80,.085],[185,124,.07],[250,172,.055],[320,225,.04],[395,282,.03]].map(([rx,ry,o],i)=>(
          <ellipse key={i} cx="172" cy="162" rx={rx} ry={ry} style={{ fill:'none', stroke:`rgba(103,232,249,${o})`, strokeWidth:1.2 }} />
        ))}
      </g>
      <g style={{ transform: 'rotate(6deg)', transformOrigin: '1030px 560px' }}>
        {[[60,38,.10],[112,74,.08],[170,116,.06],[235,164,.045],[305,218,.032]].map(([rx,ry,o],i)=>(
          <ellipse key={i} cx="1030" cy="560" rx={rx} ry={ry} style={{ fill:'none', stroke:`rgba(103,232,249,${o})`, strokeWidth:1.2 }} />
        ))}
      </g>
    </svg>
  );
}

// [PREVIEW-ONLY EXPORT — see hand-off note at top of file]
if (typeof window !== 'undefined') window.ExploreVieques = ExploreVieques;
if (typeof module !== 'undefined') { module.exports = ExploreVieques; module.exports.default = ExploreVieques; module.exports.ExploreVieques = ExploreVieques; }
