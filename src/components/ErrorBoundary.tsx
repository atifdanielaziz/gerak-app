import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Without this, any uncaught render error anywhere in the tree makes React
// silently unmount everything — a blank white page with zero feedback,
// no way for the user to recover short of guessing to reload, and no trace
// unless someone happens to have devtools open. This turns that into a
// visible, recoverable screen instead, and logs the error either way.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[GERAK] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: 24, textAlign: 'center', fontFamily: '-apple-system, sans-serif',
          background: '#ffffff', color: '#0f172a',
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0, maxWidth: 320 }}>
            Gerak hit an unexpected error. Reloading usually fixes it.
          </p>
          {/* Shown to everyone, not gated behind a dev flag — devtools access
              is often impossible in practice (no Mac for iOS Safari, no PC
              nearby for a quick native-app check), so this is frequently the
              only way anyone can hand back the actual error text at all. */}
          {this.state.error && (
            <pre style={{
              fontSize: 11, color: '#b91c1c', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 8, padding: 12,
              maxWidth: 320, maxHeight: 160, overflow: 'auto',
              textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#EF4444', color: 'white', border: 'none',
              padding: '12px 24px', borderRadius: 16, fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
