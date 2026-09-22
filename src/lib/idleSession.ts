const LAST_ACTIVITY_KEY = 'gerak_last_activity';
const SESSION_MSG_KEY = 'gerak_session_msg';
const DEVICE_MSG_KEY = 'gerak_device_session_msg';
const ACTIVITY_WRITE_THROTTLE_MS = 60_000;

// Was 5 days — still forced a real logout ("Your session expired due to
// inactivity") for any account not touched in that window, which kept
// interrupting testing across the many accounts this team switches
// between. Set high enough to functionally never trigger day-to-day
// (~10 years) rather than removing the mechanism outright, so it's a
// single number to dial back down later if there's ever a real reason to.
export const INACTIVITY_LIMIT_MS = 3650 * 24 * 60 * 60 * 1000;

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

export function setDeviceSessionReplacedMessage() {
  sessionStorage.setItem(DEVICE_MSG_KEY, 'replaced');
}

export function consumeDeviceSessionReplacedMessage(): boolean {
  const flagged = sessionStorage.getItem(DEVICE_MSG_KEY) !== null;
  if (flagged) sessionStorage.removeItem(DEVICE_MSG_KEY);
  return flagged;
}
