// IOSPhoneFrame.jsx — production-quality iPhone bezel for React.
// Drop-in single file, no dependencies beyond React.
//
// Usage:
//   import IOSPhoneFrame from './IOSPhoneFrame';
//   <IOSPhoneFrame time="9:41">
//     <YourAppScreen />
//   </IOSPhoneFrame>
//
// Props:
//   children   ReactNode  — the app UI drawn on the phone screen
//   time       string     — status-bar time (default "9:41")
//   width      number     — physical width in px (default 320, scale up/down freely)
//   theme      'dark' | 'light' (default 'dark') — status-bar icon color
//   className  string     — passes through to outer wrapper
//   style      object     — extra outer wrapper styles
//
// Notes:
//   • Renders at any size — pass `width` (aspect is locked to 9:19.5,
//     matching iPhone 15). Height auto-computes.
//   • Bezel, screen, notch/Dynamic Island, home indicator, and shadow are
//     part of the frame. Everything you render inside sits inside the
//     screen safe area (top/bottom padded for status bar and indicator).
//   • Includes a `.screen` scroll container; put the app UI you'd like
//     scrollable inside `children` and it'll clip within the bezel.
//
// ────────────────────────────────────────────────────────────────────────

import React from 'react';

export default function IOSPhoneFrame({
  children,
  time = '9:41',
  width = 320,
  theme = 'dark',
  className,
  style,
}) {
  // iPhone 15 physical aspect ratio: 9 : 19.5
  const aspect = 19.5 / 9;
  const height = width * aspect;

  // scale everything from `width` so a 200px phone still looks correct
  const s = width / 320;
  const bezelWidth = 12 * s;
  const cornerRadius = 54 * s;
  const screenRadius = cornerRadius - bezelWidth;

  const iconColor = theme === 'dark' ? '#f1f5f9' : '#0b1120';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width,
        height,
        display: 'inline-block',
        ...style,
      }}
    >
      {/* soft ambient glow behind the phone */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -width * 0.15,
          background:
            'radial-gradient(closest-side, rgba(6,182,212,0.22), rgba(6,182,212,0.06) 55%, transparent 75%)',
          filter: `blur(${width * 0.09}px)`,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* bezel */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: cornerRadius,
          background:
            'linear-gradient(160deg, #1a1f2e 0%, #0a0f1e 45%, #0a0f1e 55%, #1a1f2e 100%)',
          padding: bezelWidth,
          boxSizing: 'border-box',
          boxShadow: [
            // main drop shadow
            `0 ${40 * s}px ${80 * s}px rgba(2,8,23,0.75)`,
            // secondary short shadow
            `0 ${10 * s}px ${25 * s}px rgba(2,8,23,0.6)`,
            // cyan ambient
            `0 0 ${60 * s}px rgba(6,182,212,0.15)`,
            // subtle top highlight
            'inset 0 1px 0 rgba(255,255,255,0.08)',
            // hairline rim
            'inset 0 0 0 1px rgba(148,163,184,0.14)',
          ].join(', '),
          zIndex: 1,
        }}
      >
        {/* side buttons (visual only) */}
        <SideButton s={s} side="left"  top={95}  length={30} />
        <SideButton s={s} side="left"  top={155} length={55} />
        <SideButton s={s} side="left"  top={225} length={55} />
        <SideButton s={s} side="right" top={165} length={90} />

        {/* screen */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: screenRadius,
            overflow: 'hidden',
            background: '#000',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* status bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 44 * s,
              padding: `0 ${28 * s}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontFamily:
                  '-apple-system, "SF Pro Text", system-ui, sans-serif',
                fontSize: 15 * s,
                fontWeight: 600,
                color: iconColor,
                letterSpacing: -0.2,
                lineHeight: 1,
              }}
            >
              {time}
            </span>

            {/* Dynamic Island */}
            <div
              style={{
                width: 118 * s,
                height: 34 * s,
                background: '#000',
                borderRadius: 999,
                position: 'absolute',
                left: '50%',
                top: 10 * s,
                transform: 'translateX(-50%)',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.04)',
              }}
            />

            {/* right icons: signal, wifi, battery */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 * s }}>
              <SignalIcon size={17 * s} color={iconColor} />
              <WifiIcon size={16 * s} color={iconColor} />
              <BatteryIcon width={26 * s} height={12 * s} color={iconColor} />
            </div>
          </div>

          {/* app content — screen safe area (below status bar, above home indicator) */}
          <div
            className="ios-screen"
            style={{
              flex: 1,
              paddingTop: 54 * s,
              paddingBottom: 34 * s,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {children}
          </div>

          {/* home indicator */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 8 * s,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 134 * s,
              height: 5 * s,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.75)',
              zIndex: 20,
            }}
          />

          {/* glossy screen highlight (very subtle) */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: screenRadius,
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.04) 100%)',
              pointerEvents: 'none',
              zIndex: 15,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Bits
// ────────────────────────────────────────────────────────────────────────

function SideButton({ s, side, top, length }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        [side]: -1.5 * s,
        top: top * s,
        width: 3 * s,
        height: length * s,
        borderRadius: 2 * s,
        background:
          side === 'left'
            ? 'linear-gradient(90deg, #2a3040, #12161f)'
            : 'linear-gradient(90deg, #12161f, #2a3040)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    />
  );
}

function SignalIcon({ size, color }) {
  return (
    <svg width={size} height={size * 0.65} viewBox="0 0 17 11" fill="none">
      {[3, 5, 7, 9].map((h, i) => (
        <rect
          key={i}
          x={i * 4}
          y={11 - h}
          width="3"
          height={h}
          rx="0.7"
          fill={color}
        />
      ))}
    </svg>
  );
}

function WifiIcon({ size, color }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 16 11" fill="none">
      <path
        d="M8 11a1.3 1.3 0 100-2.6A1.3 1.3 0 008 11z"
        fill={color}
      />
      <path
        d="M3.6 6.7a6.2 6.2 0 018.8 0l-1.2 1.2a4.5 4.5 0 00-6.4 0L3.6 6.7z"
        fill={color}
      />
      <path
        d="M.9 4a10 10 0 0114.2 0l-1.2 1.2a8.3 8.3 0 00-11.8 0L.9 4z"
        fill={color}
      />
    </svg>
  );
}

function BatteryIcon({ width, height, color }) {
  const bodyRadius = height * 0.28;
  return (
    <svg width={width} height={height} viewBox="0 0 26 12" fill="none">
      <rect
        x="0.5"
        y="0.5"
        width="22"
        height="11"
        rx={bodyRadius}
        stroke={color}
        strokeOpacity="0.4"
        fill="none"
      />
      <rect x="24" y="4" width="1.5" height="4" rx="0.75" fill={color} fillOpacity="0.4" />
      <rect x="2" y="2" width="18" height="8" rx={bodyRadius * 0.6} fill={color} />
    </svg>
  );
}
