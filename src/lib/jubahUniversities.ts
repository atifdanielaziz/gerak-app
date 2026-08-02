// Single source of truth for the 5 universities Jubah delivery supports.
// Previously duplicated (and drifting) across JubahLanding.tsx, Jubah.tsx,
// JubahPriceSubTab.tsx, and JubahBannerSubTab.tsx — each kept its own
// hardcoded key/label list, with no shared campus/live-status data at all.
export interface JubahUniversity {
  key: string;
  /** Full display label with abbreviation, e.g. shown in the customer's university picker. */
  label: string;
  /** Short label, e.g. for compact admin UI (tab chips, badges). */
  shortLabel: string;
  /** Full name without the parenthetical abbreviation — used in receipts/labels that spell it out. */
  fullName: string;
  /** Campus/location values this university's bookings and riders are scoped by.
   *  UMPSA is the only one with a real sub-campus split (Pekan/Gambang);
   *  every other university is a single "campus" equal to itself. */
  campuses: string[];
  /** Whether the customer-facing booking form is actually open — false shows "Coming Soon". */
  live: boolean;
}

export const JUBAH_UNIVERSITIES: JubahUniversity[] = [
  {
    key: 'umpsa', label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)',
    shortLabel: 'UMPSA', fullName: 'Universiti Malaysia Pahang Al-Sultan Abdullah',
    campuses: ['Pekan', 'Gambang'], live: true,
  },
  {
    key: 'uitm', label: 'Universiti Teknologi MARA (UiTM)',
    shortLabel: 'UiTM', fullName: 'Universiti Teknologi MARA',
    campuses: ['UiTM'], live: false,
  },
  {
    key: 'umk', label: 'Universiti Malaysia Kelantan (UMK)',
    shortLabel: 'UMK', fullName: 'Universiti Malaysia Kelantan',
    campuses: ['UMK'], live: false,
  },
  {
    key: 'ukm', label: 'Universiti Kebangsaan Malaysia (UKM)',
    shortLabel: 'UKM', fullName: 'Universiti Kebangsaan Malaysia',
    campuses: ['UKM'], live: true,
  },
  {
    key: 'uiam', label: 'Universiti Islam Antarabangsa Malaysia (UIA)',
    shortLabel: 'UIAM', fullName: 'Universiti Islam Antarabangsa Malaysia',
    campuses: ['UIAM'], live: false,
  },
];

export const JUBAH_UNIVERSITY_MAP: Record<string, JubahUniversity> =
  Object.fromEntries(JUBAH_UNIVERSITIES.map(u => [u.key, u]));

/** The campus/location value a booking should be scoped by. UMPSA is the only
 *  university with a real sub-campus split, encoded as a "(Pekan)"/"(Gambang)"
 *  suffix on the free-text university string — every other university has
 *  exactly one campus value (itself), so no text-parsing is needed for them. */
export const deriveJubahCampus = (universityKey: string, universityText: string): string => {
  const campuses = JUBAH_UNIVERSITY_MAP[universityKey]?.campuses ?? [];
  if (campuses.length <= 1) return campuses[0] ?? universityKey;
  return campuses.find(c => universityText.includes(c)) ?? campuses[0];
};

/** "UMPSA Pekan" for UMPSA's real sub-campus split; just "UKM" (not "UKM UKM")
 *  for every other university, where campus is already just the university's
 *  own name — was previously hardcoded to "UMPSA {campus}" everywhere. */
export const jubahLocationLabel = (universityKey: string, campus: string): string => {
  const uni = JUBAH_UNIVERSITY_MAP[universityKey];
  if (!uni) return campus;
  return uni.campuses.length > 1 ? `${uni.shortLabel} ${campus}` : uni.shortLabel;
};

/** Riders/assignments only ever store a raw `campus` string (no university_key
 *  column exists on profiles) — but campus values are unique per university
 *  except UMPSA's Pekan/Gambang split, so the university is recoverable. */
export const universityKeyFromCampus = (campus: string): string | null =>
  JUBAH_UNIVERSITIES.find(u => u.campuses.includes(campus))?.key ?? null;

/** Best-effort university key lookup from a booking's free-text `university` column
 *  (e.g. "Universiti Malaysia Pahang Al-Sultan Abdullah (Pekan)") for rows saved
 *  before university_key existed, or wherever only the text is available. */
export const jubahUniversityKeyFromText = (universityText: string | null | undefined): string | null => {
  if (!universityText) return null;
  const found = JUBAH_UNIVERSITIES.find(u => universityText.startsWith(u.fullName));
  return found?.key ?? null;
};
