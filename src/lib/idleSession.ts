const SESSION_MSG_KEY = 'gerak_session_msg';
const DEVICE_MSG_KEY = 'gerak_device_session_msg';

// No custom inactivity-based auto-logout — removed entirely (was already
// dialed up to ~10 years, functionally never firing, after an earlier
// "why does it keep logging out" complaint; "just make it never log out"
// removed the mechanism outright instead of tuning it further). A session
// now only ends on an explicit Log Out, or when Supabase itself genuinely
// can't refresh the token anymore — that path is handled in AppContext.tsx
// and still uses setSessionExpiredMessage/consumeSessionExpiredMessage below.

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
