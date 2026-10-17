// Splits a Jubah delivery_address back into the separate fields J&T's
// system asks for. The booking form saves it as (Jubah.tsx fullAddress):
//   [SS - Sabah & Sarawak]      <- only for SS postage
//   line 1
//   line 2 (optional)
//   <postcode> <city>
//   <state>, Malaysia
// Older or hand-edited addresses may not follow that, so every field falls
// back gracefully: the full text always stays available as `address`.

export interface ParsedJubahAddress {
  zone: 'SM' | 'SS';
  address: string;
  postcode: string;
  city: string;
  state: string;
}

const SS_PREFIX = /^\[SS[^\]]*\]\s*/i;
const SS_STATES = /\b(sabah|sarawak|labuan)\b/i;

export function parseJubahAddress(raw: string | null | undefined): ParsedJubahAddress {
  let text = (raw ?? '').trim();
  const hadSsPrefix = SS_PREFIX.test(text);
  text = text.replace(SS_PREFIX, '').trim();

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let postcode: string;
  let city = '';
  let state = '';
  let addressLines = lines;

  const pcIdx = lines.findIndex(l => /^\d{5}\b/.test(l));
  if (pcIdx >= 0) {
    const m = lines[pcIdx].match(/^(\d{5})\s*(.*)$/);
    postcode = m?.[1] ?? '';
    city = (m?.[2] ?? '').replace(/,$/, '').trim();
    state = (lines[pcIdx + 1] ?? '').replace(/,?\s*malaysia$/i, '').trim();
    addressLines = lines.slice(0, pcIdx);
  } else {
    // Single-line or free-form: take the first 5-digit run as the postcode.
    const m = text.match(/\b(\d{5})\b/);
    postcode = m?.[1] ?? '';
  }

  const address = (addressLines.length ? addressLines : lines).join(', ').replace(/\s*,\s*,/g, ',');
  const zone: 'SM' | 'SS' = hadSsPrefix || SS_STATES.test(state || text) ? 'SS' : 'SM';
  return { zone, address, postcode, city, state };
}
