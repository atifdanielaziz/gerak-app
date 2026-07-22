// navigator.clipboard only exists in a "secure context" — HTTPS, or the
// special localhost exception. A LAN IP like 192.168.1.18 over plain HTTP
// (common while testing on a phone during dev) doesn't qualify, so the API
// is undefined there and a raw writeText() call throws immediately. Falls
// back to the legacy execCommand-via-hidden-textarea trick, which still
// works without a secure context.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
