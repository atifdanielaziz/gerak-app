import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Superadmin presses "Send tracking emails" in Admin > Jubah > Settings >
// J&T Postage (all parcels), or a rider presses it in Rider Hub > Jubah Job
// (their own parcels only), after checking the numbers J&T staff entered. Emails every
// postage parcel of that university whose tracking_no hasn't been emailed
// yet (tracking_no <> tracking_emailed_no), then records what was sent so
// the same number never goes out twice. Same Resend sender as the receipt
// emails (send-jubah-receipt-email).

const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type Row = {
  id: string; reference: string; full_name: string; email: string | null;
  delivery_address: string | null; tracking_no: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, error: 'Unauthorized' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('role, name').eq('id', user.id).single()
    // Superadmin sends for the whole university; anyone else (a rider)
    // only for bookings where they are the assigned rider.
    const isSuperadmin = profile?.role === 'superadmin'

    // bookingId: send just that booking — used right after its deposit
    // balance is confirmed, so a held tracking email goes out automatically.
    const { universityKey, bookingId } = await req.json().catch(() => ({}))
    if (!universityKey || typeof universityKey !== 'string') return json({ success: false, error: 'Missing university.' }, 400)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('RESEND_FROM_EMAIL')
    if (!apiKey || !from) return json({ success: false, error: 'Email is not configured.' }, 500)

    let query = admin
      .from('jubah_bookings')
      .select('id, reference, full_name, email, delivery_address, tracking_no, tracking_emailed_no, status, payment_mode, balance_paid')
      .eq('university_key', universityKey)
      .neq('status', 'cancelled')
      .not('tracking_no', 'is', null)
    if (!isSuperadmin) query = query.eq('rider_id', user.id)
    if (bookingId && typeof bookingId === 'string') query = query.eq('id', bookingId)
    const { data: rows, error } = await query
    if (error) return json({ success: false, error: error.message }, 500)

    // A deposit with its balance still unpaid is held: no tracking email
    // until the balance is confirmed (Track My Order hides the number too).
    const isHeld = (r: { payment_mode: string; balance_paid: boolean | null }) => r.payment_mode === 'deposit' && !r.balance_paid
    const unsent = (rows ?? []).filter(r => r.tracking_no !== r.tracking_emailed_no)
    const held = unsent.filter(isHeld).length
    const pending = unsent.filter(r => !isHeld(r) && (r.email ?? '').trim()) as Row[]
    let sent = 0
    let collected = 0
    const failed: string[] = []

    for (const b of pending) {
      const ok = await sendTrackingEmail(apiKey, from, b)
      if (ok) {
        sent++
        await admin.from('jubah_bookings')
          .update({ tracking_emailed_no: b.tracking_no, tracking_emailed_at: new Date().toISOString() })
          .eq('id', b.id)
        // Posted with a tracking number = collected (owner's choice). Moves
        // Paid/Processing to Collected and stamps the rider commission if it
        // wasn't yet; leaves later statuses alone.
        const { data: moved } = await admin.rpc('jubah_mark_collected_after_tracking', { p_booking_id: b.id })
        if (moved?.changed) collected++
      } else {
        failed.push(b.reference)
      }
      // Resend's default rate limit is 2 requests/second.
      await sleep(600)
    }

    if (sent > 0 || failed.length > 0) await admin.from('admin_activity_log').insert({
      actor_id: user.id, actor_name: profile?.name ?? 'Staff', actor_role: profile?.role ?? null, table_name: 'jubah_bookings',
      record_id: universityKey, action: 'send_tracking_emails',
      changes: { sent, collected, held, failed, bookingId: bookingId ?? null },
    })

    return json({ success: true, sent, collected, held, failed })
  } catch (err) {
    console.error('send-jubah-tracking-emails unhandled error:', err)
    return json({ success: false, error: 'Server error.' }, 500)
  }
})

async function sendTrackingEmail(apiKey: string, from: string, b: Row): Promise<boolean> {
  const address = (b.delivery_address ?? '').replace(/^\[SS[^\]]*\]\s*/i, '').trim()
  const isSs = /^\[SS/i.test(b.delivery_address ?? '') || /\b(sabah|sarawak|labuan)\b/i.test(address)
  const eta = isSs ? '2–5' : '2–3'
  const trackUrl = `https://www.jtexpress.my/tracking/${encodeURIComponent(b.tracking_no)}`
  const subject = `Your robe is on the way — ${b.reference}`

  const html = `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background:#ffffff;padding:20px 24px;border:1px solid #f1f5f9;border-bottom:none;border-radius:12px 12px 0 0;">
      <img src="https://www.gerakmy.com/gerak-brand.png" alt="Gerak" width="72" style="display:block;width:72px;height:auto;border-radius:6px;">
    </div>
    <div style="border: 1px solid #f1f5f9; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <h1 style="font-size: 18px; margin: 0 0 4px;">Your robe has been posted</h1>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 4px;">Jubah anda telah dipos melalui J&amp;T Express.</p>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 20px;">Hi ${escapeHtml(b.full_name)}, your convocation robe is on its way. Estimated delivery: ${eta} working days. / Anggaran sampai: ${eta} hari bekerja.</p>
      <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-size:11px;color:#f87171;margin-bottom:4px;">J&amp;T Tracking Number / Nombor Tracking</div>
        <div style="font-family: Consolas, Menlo, monospace; font-size: 18px; font-weight: 700; color: #1e293b; letter-spacing: 0.5px;">${escapeHtml(b.tracking_no)}</div>
      </div>
      <a href="${trackUrl}" style="display:block;text-align:center;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px;border-radius:10px;">Track on J&amp;T / Jejak di J&amp;T</a>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 16px;">
        <tr><td style="padding: 6px 0; color: #94a3b8; vertical-align: top;">Reference</td><td style="padding: 6px 0; text-align: right; font-weight: 700;">${escapeHtml(b.reference)}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8; vertical-align: top;">Delivery Address</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(address).replace(/\n/g, '<br>')}</td></tr>
      </table>
      <p style="font-size: 11px; color: #cbd5e1; margin: 20px 0 0;">This is an automated message from Gerak. You can also see this tracking number in Track My Order at gerakmy.com/jubah/track.</p>
    </div>
  </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: b.email, subject, html }),
    })
    if (!res.ok) { console.error('tracking email Resend error:', b.reference, res.status, await res.text()); return false }
    return true
  } catch (err) {
    console.error('tracking email failed:', b.reference, err)
    return false
  }
}
