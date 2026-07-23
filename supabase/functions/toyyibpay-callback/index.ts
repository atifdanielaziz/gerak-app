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
  email: string | null
  university: string | null
  campus: string | null
  faculty: string | null
  remark: string | null
  payment_mode: string
  cost: number
  balance_due: number
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

    const bookingFields = 'id, reference, full_name, email, university, campus, faculty, remark, payment_mode, cost, balance_due'

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
        console.error(`toyyibpay-callback: PAYMENT CONFIRMED for booking ${initialMatch.id} but it was not 'ordered' when applied — needs manual reconciliation. billcode=${billcode}`)
      } else {
        // Only on a genuine transition (not a replayed/duplicate callback) —
        // best-effort, never blocks the response either way.
        await sendReceiptEmail(initialMatch, initialMatch.payment_mode === 'deposit' ? 'deposit' : 'full')
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
        console.error(`toyyibpay-callback: PAYMENT CONFIRMED for balance on booking ${balanceMatch.id} but it was already paid or cancelled when applied — needs manual reconciliation. billcode=${billcode}`)
      } else {
        await sendReceiptEmail(balanceMatch, 'balance')
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

// Best-effort — a failed email should never affect the payment status
// update, which has already committed by the time this runs. RESEND_FROM_EMAIL
// is deliberately an env var, not hardcoded: it's 'onboarding@resend.dev'
// (Resend's shared test sender, which only delivers to the account's own
// signup address) until a real domain is bought and verified in Resend, at
// which point switching to a real branded sender is just changing that one
// secret — no redeploy of this logic needed.
async function sendReceiptEmail(booking: Booking, stage: 'full' | 'deposit' | 'balance') {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from   = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !from || !booking.email) return

  const { subject, headline, amountLabel, amount, note } =
    stage === 'full'
      ? { subject: `Payment received — ${booking.reference}`, headline: 'Payment Confirmed', amountLabel: 'Amount Paid', amount: booking.cost, note: 'Your Jubah order is now being processed.' }
      : stage === 'deposit'
        ? { subject: `Deposit received — ${booking.reference}`, headline: 'Deposit Confirmed', amountLabel: 'Deposit Paid', amount: booking.cost, note: `A balance of RM${Number(booking.balance_due).toFixed(2)} is still due before delivery — you'll be able to pay it from your tracking page.` }
        : { subject: `Balance received — ${booking.reference}`, headline: 'Fully Paid', amountLabel: 'Balance Paid', amount: booking.balance_due, note: 'Your Jubah order is now fully paid.' }

  const html = `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: #dc2626; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <span style="color: #ffffff; font-size: 22px; font-weight: 300; letter-spacing: -0.5px;">ger<span style="font-weight:700;">a</span>k</span>
    </div>
    <div style="border: 1px solid #f1f5f9; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <h1 style="font-size: 18px; margin: 0 0 4px;">${headline}</h1>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 20px;">${note}</p>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #94a3b8;">Reference</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${booking.reference}</td></tr>
        <tr><td style="padding: 6px 0; color: #94a3b8;">Name</td><td style="padding: 6px 0; text-align: right;">${booking.full_name}</td></tr>
        ${booking.university ? `<tr><td style="padding: 6px 0; color: #94a3b8;">University</td><td style="padding: 6px 0; text-align: right;">${booking.university}</td></tr>` : ''}
        ${booking.remark ? `<tr><td style="padding: 6px 0; color: #94a3b8;">Remark</td><td style="padding: 6px 0; text-align: right;">${booking.remark}</td></tr>` : ''}
        <tr style="border-top: 1px dashed #e2e8f0;"><td style="padding: 10px 0 6px; color: #94a3b8;">${amountLabel}</td><td style="padding: 10px 0 6px; text-align: right; font-weight: 700; color: #dc2626;">RM${Number(amount).toFixed(2)}</td></tr>
      </table>
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
