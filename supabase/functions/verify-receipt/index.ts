import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Locked to the real app origin instead of '*'.
const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const REQUIRED_BENEFICIARY = 'MUHAMMAD ATIF DANIEL'
const REQUIRED_AMOUNT       = 25.00
const MIN_DAY               = 1
const MAX_DAY               = 3

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, reason: 'Unauthorized' }, 401)
    }

    // User client (respects RLS — used for storage access)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Admin client (used to update profiles, bypasses RLS)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify JWT → get user
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return json({ success: false, reason: 'Unauthorized' }, 401)

    const { imagePath } = await req.json()
    if (!imagePath) return json({ success: false, reason: 'Missing imagePath' }, 400)

    // Validate path — must match {uuid}/monthly_receipt.{ext} to prevent traversal
    const pathPattern = /^[0-9a-f-]{36}\/monthly_receipt\.(jpe?g|png|webp)$/i
    if (!pathPattern.test(imagePath)) return json({ success: false, reason: 'Invalid file path.' }, 400)

    // Defense-in-depth: the path's folder must be the caller's own id, even
    // though storage RLS already enforces this today — this function uses
    // the service-role client to write profiles, so it shouldn't rely
    // solely on storage policy correctness for something this sensitive.
    if (!imagePath.startsWith(`${user.id}/`)) {
      return json({ success: false, reason: 'Unauthorized' }, 403)
    }

    // ── Download image from Supabase Storage ───────────────────────────
    const { data: blob, error: dlErr } = await supabase.storage
      .from('driver-receipts')
      .download(imagePath)

    if (dlErr || !blob) {
      return json({ success: false, reason: 'Could not access receipt. Please try uploading again.' })
    }

    // ── Convert to base64 ──────────────────────────────────────────────
    const arrayBuf  = await blob.arrayBuffer()
    const uint8     = new Uint8Array(arrayBuf)
    let binary = ''
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
    const base64 = btoa(binary)

    const mediaType = imagePath.endsWith('.png')  ? 'image/png'  :
                      imagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg'

    // ── Call Claude Vision API ─────────────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `You are analyzing a Malaysian bank payment receipt or screenshot.
Extract the following fields and return ONLY a JSON object — no explanation, no markdown:

{
  "bank": "bank name",
  "status": "transaction status as shown (e.g. Successful)",
  "beneficiary_name": "recipient name EXACTLY as shown, in UPPERCASE",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "reference_id": "reference/transaction ID or null"
}

If a field is not visible or unreadable, use null.
Return ONLY the raw JSON object.`,
            },
          ],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error('Claude API error:', claudeRes.status, errBody)
      return json({ success: false, reason: 'AI service unavailable. Please try again in a moment.' })
    }

    const claudeData = await claudeRes.json()

    // ── Parse Claude response ──────────────────────────────────────────
    let extracted: Record<string, any>
    try {
      const raw     = claudeData.content[0].text.trim()
      const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      extracted = JSON.parse(cleaned)
    } catch {
      return json({ success: false, reason: 'Could not read receipt. Please upload a clearer image.' })
    }

    // ── Validate fields ────────────────────────────────────────────────
    const nameOk   = typeof extracted.beneficiary_name === 'string' &&
                     extracted.beneficiary_name.toUpperCase().includes(REQUIRED_BENEFICIARY)
    const amountOk = Math.abs(Number(extracted.amount) - REQUIRED_AMOUNT) < 0.01
    const statusOk = typeof extracted.status === 'string' &&
                     extracted.status.toLowerCase().includes('success')

    let dateOk      = false
    let paymentDate: Date | null = null
    if (extracted.date) {
      paymentDate = new Date(extracted.date)
      if (!isNaN(paymentDate.getTime())) {
        const day = paymentDate.getDate()
        dateOk = day >= MIN_DAY && day <= MAX_DAY
      }
    }

    const reasons: string[] = []
    if (!statusOk)   reasons.push('Transaction must show "Successful"')
    if (!nameOk)     reasons.push(`Beneficiary must be "${REQUIRED_BENEFICIARY}"`)
    if (!amountOk)   reasons.push(`Amount must be RM${REQUIRED_AMOUNT.toFixed(2)} (found: RM${extracted.amount ?? '?'})`)
    if (!dateOk)     reasons.push('Payment date must be 1st–3rd of the month')

    if (reasons.length > 0) {
      // AI flagged issues — leave as PENDING for superadmin to review manually.
      // Do NOT set a reject reason; the admin will approve or reject after viewing the receipt.
      await admin.from('profiles').update({
        fee_receipt_verified:      false,
        fee_receipt_reject_reason: '',
        fee_receipt_expiry:        null,
      }).eq('id', user.id)

      return json({ success: false, pending: true, reason: reasons.join(' · ') })
    }

    // ── All checks passed — calculate expiry ───────────────────────────
    // Expiry = 1st day of the month AFTER the payment month (driver active whole payment month)
    const expiry    = new Date(paymentDate!.getFullYear(), paymentDate!.getMonth() + 1, 1)
    const expiryStr = expiry.toISOString().split('T')[0]

    // fee_receipt_auto_verified distinguishes "the AI decided this was fine"
    // from a human admin's approve_driver_receipt review — lets admins spot-
    // audit AI-only approvals rather than trusting the vision model blindly.
    await admin.from('profiles').update({
      fee_receipt_verified:      true,
      fee_receipt_auto_verified: true,
      fee_receipt_amount:        `RM${Number(extracted.amount).toFixed(2)}`,
      fee_receipt_date:          extracted.date,
      fee_receipt_expiry:        expiryStr,
      fee_receipt_reject_reason: '',
    }).eq('id', user.id)

    return json({
      success: true,
      amount:  `RM${Number(extracted.amount).toFixed(2)}`,
      date:    extracted.date,
      expiry:  expiryStr,
    })

  } catch (err) {
    console.error('verify-receipt unhandled error:', err)
    return json({ success: false, reason: 'Server error. Please try again.' }, 500)
  }
})
