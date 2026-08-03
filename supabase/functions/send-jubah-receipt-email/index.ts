import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Locked to the real app origin instead of '*' — this is called with a real
// user's Bearer token, so an arbitrary site being allowed to trigger it
// cross-origin serves no purpose.
const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type Booking = {
  id: string
  reference: string
  full_name: string
  ic_number: string | null
  hp_number: string
  email: string | null
  university: string | null
  faculty: string | null
  matric_id: string | null
  remark: string | null
  payment_mode: string
  cost: number
  balance_due: number
  delivery_address: string | null
  rider_id: string | null
  rider_name: string | null
}

// Same receipt email toyyibpay-callback used to send automatically on a
// webhook-confirmed payment — that path went dormant when Jubah payments
// reverted to manual proof-upload (nothing ever creates a ToyyibPay bill
// anymore, so the webhook never fires). This is the same email, same
// template, just triggered by admin's Confirm Payment/Confirm Balance
// button instead of a payment gateway callback.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, reason: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ success: false, reason: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { bookingId, stage } = await req.json()
    if (!bookingId || !['full', 'deposit', 'balance'].includes(stage)) {
      return json({ success: false, reason: 'Missing or invalid parameters.' }, 400)
    }

    const bookingFields = 'id, reference, full_name, ic_number, hp_number, email, university, faculty, matric_id, remark, payment_mode, cost, balance_due, delivery_address, rider_id, rider_name'
    const { data: booking, error: fetchErr } = await admin
      .from('jubah_bookings')
      .select(bookingFields)
      .eq('id', bookingId)
      .maybeSingle<Booking>()

    if (fetchErr || !booking) return json({ success: false, reason: 'Booking not found.' }, 404)

    // Triggered right after admin/superadmin's own Confirm Payment/Confirm
    // Balance action, or the assigned rider's equivalent buttons in Rider
    // Hub (riders can confirm their own bookings — see
    // migration_jubah_status_transition_guard.sql / migration_jubah_
    // balance_paid_rider_parity.sql for the matching RPC-level permission).
    // Never by a customer, and never by a rider for someone else's booking.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = !!profile && ['admin', 'superadmin'].includes(profile.role)
    const isAssignedRider = booking.rider_id === user.id
    if (!isAdmin && !isAssignedRider) {
      return json({ success: false, reason: 'Forbidden' }, 403)
    }

    await sendReceiptEmail(admin, booking, stage as 'full' | 'deposit' | 'balance')
    return json({ success: true })

  } catch (err) {
    console.error('send-jubah-receipt-email unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

// Same masking convention used everywhere else customer-facing (TrackJubah's
// IC-gated receipt, buildJubahReceiptRows) — an email landing in the
// customer's own inbox is still worth keeping consistent with that, rather
// than being the one place that shows it in full.
const maskIc = (ic: string | null) => {
  if (!ic) return null
  const digits = ic.replace(/\D/g, '')
  return digits.length < 6 ? ic : `${digits.slice(0, 6)}-XX-XXXX`
}

const fmtDate = () =>
  new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

// row()'s value/sub carry customer-submitted booking fields (name, faculty,
// delivery address, ...) straight into this HTML email — escape before
// interpolating so a booking with e.g. "<img onerror=...>" as a name can't
// inject markup into the receipt landing in that same customer's inbox.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const row = (label: string, value: string | null | undefined, opts?: { bold?: boolean; accent?: boolean; sub?: string }) =>
  !value ? '' : `<tr><td style="padding: 6px 0; color: #94a3b8; vertical-align: top;">${label}</td><td style="padding: 6px 0; text-align: right; font-weight: ${opts?.bold ? 700 : 400}; color: ${opts?.accent ? '#dc2626' : '#1e293b'};">${escapeHtml(value)}${opts?.sub ? `<br><span style="font-size: 11px; font-weight: 400; color: #94a3b8;">${escapeHtml(opts.sub)}</span>` : ''}</td></tr>`

// Best-effort — a failed email should never affect the payment status
// update, which has already committed by the time this runs. RESEND_FROM_EMAIL
// is deliberately an env var, not hardcoded: it's 'onboarding@resend.dev'
// (Resend's shared test sender, which only delivers to the account's own
// signup address) until a real domain is bought and verified in Resend, at
// which point switching to a real branded sender is just changing that one
// secret — no redeploy of this logic needed.
async function sendReceiptEmail(admin: ReturnType<typeof createClient>, booking: Booking, stage: 'full' | 'deposit' | 'balance') {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from   = Deno.env.get('RESEND_FROM_EMAIL')
  // Email clients need a real fetchable URL, not a bundled asset path — reuse
  // the same APP_BASE_URL secret toyyibpay-create-bill already relies on.
  const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? ''
  if (!apiKey || !from || !booking.email) return

  let riderPhone: string | null = null
  if (booking.rider_id) {
    const { data } = await admin.from('profiles').select('phone').eq('id', booking.rider_id).maybeSingle<{ phone: string | null }>()
    riderPhone = data?.phone ?? null
  }

  const { subject, headline, note } =
    stage === 'full'
      ? { subject: `Payment received — ${booking.reference}`, headline: 'Payment Confirmed', note: 'Your Jubah order is now being processed.' }
      : stage === 'deposit'
        ? { subject: `Deposit received — ${booking.reference}`, headline: 'Deposit Confirmed', note: `A balance of RM${Number(booking.balance_due).toFixed(2)} is still due before delivery — you'll be able to pay it from your tracking page. This deposit is non-refundable.` }
        : { subject: `Balance received — ${booking.reference}`, headline: 'Fully Paid', note: 'Your Jubah order is now fully paid.' }

  const today = fmtDate()
  const paymentRows =
    stage === 'deposit'
      ? row('Deposit Paid', `RM${Number(booking.cost).toFixed(2)}`, { sub: today }) +
        row('Balance Due', `RM${Number(booking.balance_due).toFixed(2)}`) +
        // Total Due here means what's still owed right now — the deposit
        // just cleared, so that's the remaining balance, not cost+balance
        // again (which would double-count the deposit this exact email is
        // confirming).
        row('Total Due', `RM${Number(booking.balance_due).toFixed(2)}`, { bold: true, accent: true })
      : stage === 'balance'
        ? row('Deposit Paid', `RM${Number(booking.cost).toFixed(2)}`) +
          row('Balance Paid', `RM${Number(booking.balance_due).toFixed(2)}`, { sub: today }) +
          row('Total Charged', `RM${(Number(booking.cost) + Number(booking.balance_due)).toFixed(2)}`, { bold: true, accent: true })
        : row('Amount Paid', `RM${Number(booking.cost).toFixed(2)}`, { bold: true, accent: true, sub: today })

  const html = `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: #dc2626; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;"><tr>
        ${appBaseUrl ? `<td style="padding-right: 10px; vertical-align: middle;"><img src="${appBaseUrl}/icon-192-light.png" width="28" height="28" alt="" style="display: block; border-radius: 7px;" /></td>` : ''}
        <td style="vertical-align: middle;"><span style="color: #ffffff; font-size: 22px; font-weight: 300; letter-spacing: -0.5px;">ger<span style="font-weight:700;">a</span>k</span></td>
      </tr></table>
    </div>
    <div style="border: 1px solid #f1f5f9; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <h1 style="font-size: 18px; margin: 0 0 4px;">${headline}</h1>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 20px;">${note}</p>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        ${row('Reference Number', booking.reference, { bold: true })}
        ${row('Full Name', booking.full_name)}
        ${row('IC Number', maskIc(booking.ic_number))}
        ${row('Phone', booking.hp_number)}
        ${row('Email', booking.email)}
        ${row('University', booking.university)}
        ${row('Faculty', booking.faculty)}
        ${row('Matric ID', booking.matric_id)}
      </table>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; border-top: 1px dashed #e2e8f0; margin-top: 4px;">
        ${row('Robe Type', booking.remark)}
        ${row('Booking Type', (booking.payment_mode === 'postage' || (booking.payment_mode === 'deposit' && !!booking.delivery_address)) ? 'Postage / Delivery' : 'Self Pickup')}
        ${row('Delivery Address', booking.delivery_address)}
      </table>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; border-top: 1px dashed #e2e8f0; margin-top: 4px;">
        ${paymentRows}
      </table>
      ${booking.rider_name ? `
      <table style="width: 100%; font-size: 13px; border-collapse: collapse; border-top: 1px dashed #e2e8f0; margin-top: 4px;">
        ${row('Rider Assigned', booking.rider_name)}
        ${row('Rider Contact', riderPhone)}
      </table>` : ''}
      <p style="font-size: 11px; color: #cbd5e1; margin: 20px 0 0;">This is an automated receipt from Gerak. Track your order anytime from the app.</p>
    </div>
  </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: booking.email, subject, html }),
    })
    if (!res.ok) {
      console.error('sendReceiptEmail: Resend API error:', res.status, await res.text())
    }
  } catch (err) {
    console.error('sendReceiptEmail: failed to send:', err)
  }
}
