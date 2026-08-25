import { supabase } from './supabase';

export interface SignedUrlResult {
  url: string | null;
  error: string | null;
  // True when the underlying object is actually gone (Storage's "not
  // found" style error) rather than some transient/network failure — lets
  // callers show "This file no longer exists" instead of "please try
  // again" on something retrying can never fix.
  notFound: boolean;
}

// Bucket-agnostic core used by every "fetch a fresh Storage signed URL,
// then open it" call site in the app. Stored signed URLs (saved once at
// upload time) expire and, once they do, are permanently dead links — so
// every viewer regenerates one on demand from the stable storage path
// instead of trusting a saved URL.
//
// Callers previously did `const signed = await createSignedUrl(...)`
// with no try/catch around it. supabase-js's createSignedUrl REJECTS
// (throws) on a network-level failure (fetch error, CORS, timeout) rather
// than returning it in `error` the way an API-level failure does — so a
// blank `_blank` tab opened right before the call would silently stay
// blank forever, with the calling code's own "close the tab on failure"
// branch never reached. Wrapping the whole thing here so this function
// itself can never throw — every caller's failure branch now actually
// runs, and the real reason (whatever it was) is always returned to log
// or show, instead of vanishing into an unhandled promise rejection.
export async function getSignedUrl(bucket: string, path: string | null | undefined, expiresIn = 3600, download = false): Promise<SignedUrlResult> {
  if (!path) return { url: null, error: 'Invalid document path.', notFound: false };

  try {
    // A request that's neither erroring nor resolving (blocked by a browser
    // extension, VPN, or a network stack that drops it silently instead of
    // refusing it) would otherwise hang this await forever — the exact
    // "blank tab stays blank, nothing ever happens" symptom this is guarding
    // against. Race it against a timeout so it always settles one way or another.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out — check your internet connection or a browser extension blocking supabase.co.')), 10000)
    );
    const { data, error } = await Promise.race([
      supabase.storage.from(bucket).createSignedUrl(path, expiresIn, { download }),
      timeout,
    ]);
    if (error || !data) {
      console.error(`[GERAK] Could not sign ${bucket} URL:`, error);
      // Storage returns a "not found" style error (statusCode '404', a
      // message like "Object not found") when the file was actually
      // deleted — distinct from a permission/network hiccup.
      const notFound = !!error && (
        (error as { statusCode?: string }).statusCode === '404' ||
        /not.?found/i.test(error.message ?? '')
      );
      return { url: null, error: notFound ? 'This file no longer exists.' : (error?.message ?? 'Signing failed.'), notFound };
    }
    return { url: data.signedUrl, error: null, notFound: false };
  } catch (err) {
    console.error(`[GERAK] ${bucket} signing threw:`, err);
    return { url: null, error: err instanceof Error ? err.message : 'Network error while signing.', notFound: false };
  }
}

// jubah-docs is a private bucket — stored values are either a raw storage
// path (new bookings, foldered as `{reference}/{label}.{ext}`) or, for
// bookings made before this bucket was locked down, a full public-style
// URL like `.../storage/v1/object/public/jubah-docs/{path}`. This extracts
// the path either way, then generates a fresh signed URL on demand for
// whoever is actually authorized to view it (admin/superadmin or the
// assigned rider — enforced by the bucket's RLS policies, not by this
// function itself).
export async function getJubahDocSignedUrl(stored: string | null | undefined, download = false): Promise<{ url: string | null; error: string | null }> {
  if (!stored) return { url: null, error: null };
  const marker = '/jubah-docs/';
  const path = stored.startsWith('http')
    ? stored.slice(stored.indexOf(marker) + marker.length)
    : stored;
  if (!path) return { url: null, error: 'Invalid document path.' };

  const { url, error } = await getSignedUrl('jubah-docs', path, 3600, download);
  return { url, error };
}

// Opens a URL in a new tab via a synthetic <a> click instead of
// window.open(). Callers here always resolve the URL asynchronously first
// (it comes from the signing call above), so the "open a blank tab, then
// navigate it once the URL is ready" dance was needed to keep window.open()
// inside the click's user-gesture window — but some browsers/extensions
// block window.open() even when called synchronously from a real click
// (confirmed live: "Popup blocked" firing on a direct, unmodified click).
// A real <a> element's own .click() triggers normal browser navigation,
// which isn't gated by the popup blocker the way window.open() is — so
// this works even after the async signing call has already finished,
// with no blank placeholder tab needed at all.
export function openInNewTab(url: string) {
  // This runs after the async signed-URL request. iOS Safari/PWA commonly
  // rejects a synthetic target=_blank click once the original user gesture
  // has crossed that async boundary, making View/Download appear to do
  // nothing. Try a real new browsing context first; when the browser blocks
  // it, navigate the current view instead. The latter is not popup-gated and
  // the user can return to Gerak with Back after viewing/saving the file.
  const opened = window.open(url, '_blank');
  if (opened) opened.opener = null;
  else window.location.assign(url);
}
