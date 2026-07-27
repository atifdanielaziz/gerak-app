import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    let billcode: string | null = null
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      billcode = body.billcode ?? body.billCode ?? null
    } else {
      const form = await req.formData().catch(() => null)
      billcode = (form?.get('billcode') as string) ?? null
    }
    if (!billcode) {
      // Some setups append query params instead of a body.
      billcode = new URL(req.url).searchParams.get('billcode')
    }
    if (!billcode) return json({ success: false, reason: 'Missing billcode' }, 400)

    const baseUrl = Deno.env.get('TOYYIBPAY_BASE_URL')!
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // This endpoint is public and unauthenticated — never trust the callback
    // body's own status field. Re-query ToyyibPay's own API for the bill's
    // authoritative status and act only on that.
    const verifyForm = new URLSearchParams({ billCode: billcode })
    const verifyRes  = await fetch(`${baseUrl}/index.php/api/getBillTransactions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    verifyForm,
    })
    const transactions = await verifyRes.json().catch(() => null)
    const paid = Array.isArray(transactions) &&
      transactions.some((t: any) => String(t.billpaymentStatus) === '1')

    if (!paid) return json({ success: true, note: 'Not paid yet.' })

    const bookingFields = 'id, reference, full_name, ic_number, hp_number, email, university, faculty, matric_id, remark, payment_mode, cost, balance_due, delivery_address, rider_id, rider_name'

    // Try the initial-payment bill first, then the balance-payment bill.
    const { data: initialMatch } = await admin
      .from('jubah_bookings')
      .select(bookingFields)
      .eq('toyyibpay_bill_code', billcode)
      .maybeSingle<Booking>()

    if (initialMatch) {
      const newStatus = initialMatch.payment_mode === 'deposit' ? 'booked' : 'paid'
      // The status='ordered' guard makes this idempotent against ToyyibPay
      // retrying the callback delivery.
      const { data: updated, error: updateErr } = await admin.from('jubah_bookings')
        .update({ status: newStatus, initial_paid: true, initial_paid_at: new Date().toISOString() })
        .eq('id', initialMatch.id)
        .eq('status', 'ordered')
        .select('id')
      if (updateErr) {
        console.error('toyyibpay-callback: failed to update status:', updateErr)
        return json({ success: false, reason: updateErr.message }, 500)
      }
      // Real money was just confirmed paid at ToyyibPay, but this booking
      // wasn't 'ordered' anymore by the time we tried to apply it (already
      // confirmed some other way, or cancelled). Logged loudly instead of
      // silently discarded — a paid customer with no matching update needs
      // a human to reconcile, not a quiet no-op.
      if (!updated || updated.length === 0) {
        const note = `Payment confirmed for booking ${initialMatch.reference} but it was not 'ordered' when applied — needs manual reconciliation. billcode=${billcode}`
        console.error(`toyyibpay-callback: ${note}`)
        await flagForReconciliation(admin, initialMatch.id, note)
      } else {
        // Only on a genuine transition (not a replayed/duplicate callback) —
        // best-effort, never blocks the response either way.
        await sendReceiptEmail(admin, initialMatch, initialMatch.payment_mode === 'deposit' ? 'deposit' : 'full')
      }
      return json({ success: true })
    }

    const { data: balanceMatch } = await admin
      .from('jubah_bookings')
      .select(bookingFields)
      .eq('toyyibpay_balance_bill_code', billcode)
      .maybeSingle<Booking>()

    if (balanceMatch) {
      // status != 'cancelled' guard: the bill could have been created
      // before a cancellation and only paid afterward — bill-creation now
      // blocks this going forward, but this covers that narrow race too.
      const { data: updated, error: updateErr } = await admin.from('jubah_bookings')
        .update({ balance_paid: true, balance_paid_at: new Date().toISOString() })
        .eq('id', balanceMatch.id)
        .eq('balance_paid', false)
        .neq('status', 'cancelled')
        .select('id')
      if (updateErr) {
        console.error('toyyibpay-callback: failed to update balance_paid:', updateErr)
        return json({ success: false, reason: updateErr.message }, 500)
      }
      if (!updated || updated.length === 0) {
        const note = `Balance payment confirmed for booking ${balanceMatch.reference} but it was already paid or cancelled when applied — needs manual reconciliation. billcode=${billcode}`
        console.error(`toyyibpay-callback: ${note}`)
        await flagForReconciliation(admin, balanceMatch.id, note)
      } else {
        await sendReceiptEmail(admin, balanceMatch, 'balance')
      }
      return json({ success: true })
    }

    return json({ success: false, reason: 'No booking matched this bill.' }, 404)

  } catch (err) {
    console.error('toyyibpay-callback unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Surfaces a reconciliation-needed case on the booking row itself, so it
// shows up in the admin UI instead of only living in Edge Function logs
// that nobody proactively checks. Best-effort — never blocks the response.
async function flagForReconciliation(admin: ReturnType<typeof createClient>, bookingId: string, note: string) {
  const { error } = await admin.from('jubah_bookings').update({
    needs_reconciliation: true,
    reconciliation_note: note,
    reconciliation_flagged_at: new Date().toISOString(),
  }).eq('id', bookingId)
  if (error) console.error('flagForReconciliation: failed to write flag:', error)
}

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
