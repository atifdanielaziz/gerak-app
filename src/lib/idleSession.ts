const LAST_ACTIVITY_KEY = 'gerak_last_activity';
const SESSION_MSG_KEY = 'gerak_session_msg';
const ACTIVITY_WRITE_THROTTLE_MS = 60_000;

export const INACTIVITY_LIMIT_MS = 5 * 24 * 60 * 60 * 1000;

let lastWrite = 0;

// Throttled so a generic activity listener (pointerdown/keydown) can call
// this on every event without hammering localStorage.
export function touchActivity() {
  const now = Date.now();
  if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
  lastWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
}

export function isSessionExpired(maxIdleMs: number): boolean {
  const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!stored) {
    touchActivity();
    return false;
  }
  return Date.now() - Number(stored) > maxIdleMs;
}

export function setSessionExpiredMessage() {
  sessionStorage.setItem(SESSION_MSG_KEY, 'expired');
}

export function consumeSessionExpiredMessage(): boolean {
  const flagged = sessionStorage.getItem(SESSION_MSG_KEY) !== null;
  if (flagged) sessionStorage.removeItem(SESSION_MSG_KEY);
  return flagged;
}
