import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type Profile = {
  id: string
  name: string
  email: string | null
  role: string
  docs_status: string
  docs_reject_reason: string | null
  can_drive: boolean | null
  can_rent: boolean | null
  can_transport: boolean | null
  can_daily: boolean | null
  can_robe: boolean | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, reason: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ success: false, reason: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
      return json({ success: false, reason: 'Forbidden' }, 403)
    }

    const { userId, decision } = await req.json()
    if (!userId || !['approved', 'rejected'].includes(decision)) {
      return json({ success: false, reason: 'Invalid request.' }, 400)
    }

    const { data: profile } = await admin.from('profiles')
      .select('id,name,email,role,docs_status,docs_reject_reason,can_drive,can_rent,can_transport,can_daily,can_robe')
      .eq('id', userId)
      .maybeSingle<Profile>()

    if (!profile || !['driver', 'rider'].includes(profile.role)) {
      return json({ success: false, reason: 'Staff profile not found.' }, 404)
    }
    if (profile.docs_status !== decision) {
      return json({ success: false, reason: 'Saved document status does not match the requested email.' }, 409)
    }
    if (!profile.email) return json({ success: true, sent: false, reason: 'No email address.' })

    const sent = await sendVerificationEmail(profile, decision)
    return json({ success: true, sent })
  } catch (err) {
    console.error('send-document-verification-email unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function serviceDescription(profile: Profile) {
  const services: string[] = []
  if (profile.can_drive) services.push('Gerak Car')
  if (profile.can_rent) services.push('Gerak Rental')
  if (profile.can_transport) services.push('Gerak Transporter')
  if (profile.can_daily) services.push('Gerak Daily')
  if (profile.can_robe) services.push('Jubah Delivery')
  if (services.length > 0) return `${services.join(', ')} services`
  return profile.role === 'rider' ? 'services as a Gerak Rider' : 'services as a Gerak Driver'
}

async function sendVerificationEmail(profile: Profile, decision: 'approved' | 'rejected') {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !from || !profile.email) return false

  const appUrl = Deno.env.get('APP_BASE_URL') ?? 'https://gerakmy.com'
  const approved = decision === 'approved'
  const roleLabel = profile.role === 'rider' ? 'Rider' : 'Driver'
  const services = serviceDescription(profile)
  const subject = approved
    ? 'Your Gerak documents have been approved'
    : 'Action required: Your Gerak documents need attention'
  const message = approved
    ? `Your documents have been reviewed and approved. You may now start providing ${escapeHtml(services)} through Gerak, subject to your active service capabilities and account status.`
    : `We reviewed your documents, but they could not be approved at this time. Please update the required document and submit it again for verification.`
  const reason = !approved && profile.docs_reject_reason
    ? `<div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;padding:12px 14px;margin:18px 0;"><p style="font-size:11px;color:#94a3b8;margin:0 0 4px;">Reason</p><p style="font-size:13px;font-weight:600;color:#334155;margin:0;">${escapeHtml(profile.docs_reject_reason)}</p></div>`
    : ''

  const html = `
  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b;">
    <div style="background:#ffffff;padding:22px 26px;border:1px solid #f1f5f9;border-bottom:none;border-radius:14px 14px 0 0;"><img src="https://www.gerakmy.com/gerak-brand.png" alt="Gerak" width="72" style="display:block;width:72px;height:auto;border-radius:6px;"></div>
    <div style="background:#fff;border:1px solid #f1f5f9;border-top:none;border-radius:0 0 14px 14px;padding:28px 26px 24px;">
      <p style="font-size:11px;font-weight:600;color:#94a3b8;margin:0 0 8px;">Document verification · ${roleLabel}</p>
      <h1 style="font-size:20px;margin:0 0 10px;">${approved ? 'Documents approved' : 'Documents need attention'}</h1>
      <p style="font-size:13.5px;color:#64748b;line-height:1.65;margin:0;">Hi ${escapeHtml(profile.name)},<br><br>${message}</p>
      ${reason}
      <a href="${appUrl}" style="display:block;text-align:center;background:#dc2626;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 20px;border-radius:10px;margin:22px 0 0;">Open Gerak</a>
    </div>
    <p style="font-size:11px;color:#cbd5e1;text-align:center;margin:18px 0 0;">This is an automated message from Gerak.</p>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: profile.email, cc: 'gerakmygroup@gmail.com', subject, html }),
  })
  if (!res.ok) console.error('sendVerificationEmail: Resend API error:', res.status, await res.text())
  return res.ok
}
