import { useState } from 'react';

// Minimal, auth-free reproduction of a real bug: a plain React
// conditional-className toggle (background-color: red when active, none
// when inactive) that sometimes doesn't repaint on Android/iOS when this
// page is installed as a standalone PWA — confirmed live via
// chrome://inspect that the DOM/className/computed-style are always
// correct immediately after a tap, yet the physical screen sometimes
// shows the wrong colour until an unrelated later touch. Not reproducible
// in a normal browser tab, only standalone display mode. No other logic,
// no dependencies beyond React itself, so this is safe to point a
// Chromium bug report at directly.
const TABS = ['Orders', 'Invite', 'Staff', 'Verify', 'Jubah'];

export const RepaintRepro: React.FC = () => {
  const [active, setActive] = useState(TABS[0]);

  return (
    <div style={{ minHeight: '100dvh', padding: '24px 16px', fontFamily: '-apple-system, sans-serif', background: '#f8fafc' }}>
      <h1 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Repaint bug — minimal repro</h1>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
        Install this page to your home screen (Chrome menu → Add to Home Screen), open it from the
        icon, then tap between the tabs below. Expected: the tapped tab turns solid red immediately.
        Bug: it sometimes stays uncoloured until you tap a different tab afterward — at which point the
        <i> previous</i> tab retroactively turns red. Not reproducible in a normal browser tab, only once
        installed/standalone.
      </p>
      <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 4 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            style={{
              flex: 1,
              padding: '10px 4px',
              borderRadius: 10,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              backgroundColor: active === tab ? '#EF4444' : 'transparent',
              color: active === tab ? '#ffffff' : '#94a3b8',
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 20 }}>
        Source: a single onClick handler calling setState, and a plain inline-style conditional on
        backgroundColor/color. No CSS framework, no animation, no transition, no third-party code.
      </p>
    </div>
  );
};
