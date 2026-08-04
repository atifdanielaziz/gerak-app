// Single source of truth for every university Gerak operates across — used
// by Jubah delivery (booking/riders), Staff invite/assignment, and the
// signup form's University → Campus cascade. Started as Jubah-only (hence
// the old filename) but campus assignment now spans Driver/Rider/Admin
// staff too, not just Jubah reps — this file grew into the shared source.
export interface University {
  key: string;
  /** Full display label with abbreviation, e.g. shown in a university picker. */
  label: string;
  /** Short label, e.g. for compact admin UI (tab chips, badges). */
  shortLabel: string;
  /** Full name without the parenthetical abbreviation — used in receipts/labels that spell it out. */
  fullName: string;
  /** Real campus/location values this university has. Every university now
   *  has its actual campus list (previously only UMPSA did; every other
   *  entry was a single placeholder equal to the university's own name). */
  campuses: string[];
  /** Whether Jubah's customer-facing booking form is actually open for this
   *  university — false shows "Coming Soon" there. Unrelated to whether the
   *  university can be selected for Staff invite/assignment or signup,
   *  which is always allowed regardless of this flag. */
  live: boolean;
}

export const UNIVERSITIES: University[] = [
  {
    key: 'umpsa', label: 'Universiti Malaysia Pahang Al-Sultan Abdullah (UMPSA)',
    shortLabel: 'UMPSA', fullName: 'Universiti Malaysia Pahang Al-Sultan Abdullah',
    campuses: ['Pekan', 'Gambang'], live: true,
  },
  {
    key: 'uitm', label: 'Universiti Teknologi MARA (UiTM)',
    shortLabel: 'UiTM', fullName: 'Universiti Teknologi MARA',
    campuses: ['Shah Alam', 'Puncak Alam', 'Machang'], live: false,
  },
  {
    key: 'umk', label: 'Universiti Malaysia Kelantan (UMK)',
    shortLabel: 'UMK', fullName: 'Universiti Malaysia Kelantan',
    campuses: ['Jeli', 'Bachok', 'Kota Bharu'], live: false,
  },
  {
    key: 'ukm', label: 'Universiti Kebangsaan Malaysia (UKM)',
    shortLabel: 'UKM', fullName: 'Universiti Kebangsaan Malaysia',
    campuses: ['Bangi'], live: true,
  },
  {
    // Key stays 'uiam' (not 'uia') — jubah_bookings' CHECK constraint and
    // create_jubah_booking()'s validation both hardcode this literal string.
    key: 'uiam', label: 'Universiti Islam Antarabangsa Malaysia (UIA)',
    shortLabel: 'UIAM', fullName: 'Universiti Islam Antarabangsa Malaysia',
    campuses: ['Gombak', 'Kuantan'], live: false,
  },
  {
    key: 'uum', label: 'Universiti Utara Malaysia (UUM)',
    shortLabel: 'UUM', fullName: 'Universiti Utara Malaysia',
    campuses: ['Sintok'], live: false,
  },
];

export const UNIVERSITY_MAP: Record<string, University> =
  Object.fromEntries(UNIVERSITIES.map(u => [u.key, u]));

/** The campus/location value a Jubah booking should be scoped by. UMPSA/UMK/
 *  UiTM/UIA all have a real sub-campus split, encoded as a suffix on the
 *  free-text university string (e.g. "... (Pekan)"); UKM/UUM have exactly
 *  one campus, so no text-parsing is needed for them. */
export const deriveJubahCampus = (universityKey: string, universityText: string): string => {
  const campuses = UNIVERSITY_MAP[universityKey]?.campuses ?? [];
  if (campuses.length <= 1) return campuses[0] ?? universityKey;
  return campuses.find(c => universityText.includes(c)) ?? campuses[0];
};

/** "UMPSA Pekan" for a university with a real sub-campus split; just "UKM"
 *  (not "UKM Bangi") for a single-campus university, where campus doesn't
 *  need spelling out — was previously hardcoded to "UMPSA {campus}" everywhere. */
export const jubahLocationLabel = (universityKey: string, campus: string): string => {
  const uni = UNIVERSITY_MAP[universityKey];
  if (!uni) return campus;
  return uni.campuses.length > 1 ? `${uni.shortLabel} ${campus}` : uni.shortLabel;
};

/** Riders/staff only ever store a raw `campus` string (no university_key
 *  column exists on profiles) — but campus values are unique across every
 *  university in the list above, so the university is always recoverable. */
export const universityKeyFromCampus = (campus: string): string | null =>
  UNIVERSITIES.find(u => u.campuses.includes(campus))?.key ?? null;
