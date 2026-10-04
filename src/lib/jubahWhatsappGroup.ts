import { supabase } from './supabase';

// Per-university WhatsApp group invite shown after a Jubah booking.
// Written only through the superadmin RPC set_jubah_whatsapp_group
// (migration 20261004110000), which validates the same pattern below.
export const jubahWhatsappGroupKey = (university: string) => `jubah_wa_group_${university}`;

// Re-checked client-side before it's ever used as an href — even though
// the RPC already validates, the button must never render a non-WhatsApp
// or javascript: URL if a bad value somehow reached app_settings.
const INVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;
export const isValidWhatsappInvite = (url: string | null | undefined): url is string =>
  !!url && INVITE_RE.test(url);

export async function getJubahWhatsappGroup(university: string): Promise<string | null> {
  if (!university) return null;
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', jubahWhatsappGroupKey(university))
    .maybeSingle();
  return isValidWhatsappInvite(data?.value) ? data!.value : null;
}
