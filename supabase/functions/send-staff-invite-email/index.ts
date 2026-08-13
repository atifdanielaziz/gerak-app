import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Locked to the real app origin instead of '*' — this is called with a real
// admin's Bearer token, so an arbitrary site being allowed to trigger it
// cross-origin serves no purpose.
const ALLOWED_ORIGIN = 'https://www.gerakmy.com'
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin')
  return {
    'Access-Control-Allow-Origin': origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

type Invite = {
  id: string
  email: string
  campus: string
  role: string
  can_drive: boolean
  can_rent: boolean
  can_transport: boolean
  can_daily: boolean
  can_robe: boolean
  created_by: string | null
}

// Triggered by DriversTab.tsx's handleSendInvite right after the
// driver_invites row is created — same fire-and-forget, best-effort
// pattern as send-jubah-receipt-email (a failed send never blocks the
// invite itself, which has already committed by the time this runs).
//
// Takes only an inviteId, not the invite's actual fields — the email
// content is built from the real driver_invites row fetched here, not
// from whatever the client claims, so what's shown always matches what
// was actually granted (same reasoning send-jubah-receipt-email already
// uses: bookingId in, real row fetched server-side, not trusted from
// the caller).
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

    // Only admin/superadmin can trigger this — it's called right after
    // their own "Invite Staff" action, never by anyone else.
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ success: false, reason: 'Forbidden' }, 403)
    }

    const { inviteId } = await req.json()
    if (!inviteId) return json({ success: false, reason: 'Missing inviteId.' }, 400)

    const { data: invite, error: fetchErr } = await admin
      .from('driver_invites')
      .select('id, email, campus, role, can_drive, can_rent, can_transport, can_daily, can_robe, created_by')
      .eq('id', inviteId)
      .maybeSingle<Invite>()

    if (fetchErr || !invite) return json({ success: false, reason: 'Invite not found.' }, 404)

    let inviterName = 'A Gerak admin'
    if (invite.created_by) {
      const { data: inviter } = await admin.from('profiles').select('name').eq('id', invite.created_by).maybeSingle<{ name: string | null }>()
      if (inviter?.name) inviterName = inviter.name
    }

    await sendInviteEmail(invite, inviterName)
    return json({ success: true })

  } catch (err) {
    console.error('send-staff-invite-email unhandled error:', err)
    return json({ success: false, reason: 'Server error.' }, 500)
  }
})

// Same escaping convention as send-jubah-receipt-email — role/campus here
// are admin-selected dropdown values today, not free text, but escaping
// unconditionally means that stays true even if a future change ever
// makes one of these fields freely-typed.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const ROLE_LABEL: Record<string, string> = { driver: 'Driver', rider: 'Rider', admin: 'Admin' };
const ROLE_EMOJI: Record<string, string> = { driver: '🚗', rider: '🏍️', admin: '🛠️' };

async function sendInviteEmail(invite: Invite, inviterName: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from   = Deno.env.get('RESEND_FROM_EMAIL')
  const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? ''
  if (!apiKey || !from) return

  const tags: string[] = []
  if (invite.can_drive)     tags.push('Gerak Car')
  if (invite.can_rent)      tags.push('Gerak Rental')
  if (invite.can_transport) tags.push('Gerak Transporter')
  if (invite.can_daily)     tags.push('Gerak Daily')
  if (invite.can_robe)      tags.push('Jubah Delivery')
  if (invite.role === 'admin') tags.push('Admin Panel')

  const roleLabel = ROLE_LABEL[invite.role] ?? invite.role
  const roleEmoji = ROLE_EMOJI[invite.role] ?? ''
  const subject = `You're invited to join Gerak as a ${roleLabel} ${roleEmoji}`.trim()
  // Straight to the register form (AppContext's /register deep link), not
  // just the app root — with the invited email prefilled so it always
  // matches exactly what the invite was actually issued to.
  const signupUrl = `${appBaseUrl || 'https://gerakmy.com'}/register?email=${encodeURIComponent(invite.email)}`

  const tagsHtml = tags.map(t =>
    `<span style="display:inline-block;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:999px;background:rgba(220,38,38,0.08);color:#b91c1c;border:1px solid rgba(220,38,38,0.15);margin:0 4px 4px 0;">${escapeHtml(t)}</span>`
  ).join('')

  const html = `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: #dc2626; padding: 22px 26px; border-radius: 14px 14px 0 0;">
      <span style="color: #ffffff; font-size: 22px; font-weight: 300; letter-spacing: -0.3px;">ger<span style="font-weight:800;">a</span>k</span>
    </div>
    <div style="background: #ffffff; border: 1px solid #f1f5f9; border-top: none; border-radius: 0 0 14px 14px; padding: 28px 26px 24px;">
      <span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#dc2626;background:rgba(220,38,38,0.08);padding:4px 10px;border-radius:999px;margin-bottom:14px;">Staff Invite</span>
      <h1 style="font-size: 20px; margin: 6px 0 6px;">You've been invited to Gerak</h1>
      <p style="font-size: 13.5px; color: #64748b; line-height: 1.6; margin: 0 0 22px;">
        ${escapeHtml(inviterName)} has invited you to join the Gerak team at UMPSA ${escapeHtml(invite.campus)}. Create your account below using this exact email address to activate your access automatically.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;"><tr>
        <td style="width: 50%; padding: 10px 12px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px 0 0 10px; border-right: none;">
          <p style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8; margin: 0 0 3px;">Role</p>
          <p style="font-size: 13px; font-weight: 600; color: #1e293b; margin: 0;">${escapeHtml(roleLabel)}</p>
        </td>
        <td style="width: 50%; padding: 10px 12px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 0 10px 10px 0;">
          <p style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8; margin: 0 0 3px;">Campus</p>
          <p style="font-size: 13px; font-weight: 600; color: #1e293b; margin: 0;">UMPSA ${escapeHtml(invite.campus)}</p>
        </td>
      </tr></table>
      ${tags.length ? `
      <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 10px 12px; margin-bottom: 20px;">
        <p style="font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8; margin: 0 0 6px;">Access Granted</p>
        <div>${tagsHtml}</div>
      </div>` : ''}
      <a href="${signupUrl}" style="display: block; text-align: center; background: #dc2626; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 20px; border-radius: 10px; margin: 22px 0 18px;">Create Your Account →</a>
      <p style="font-size: 12px; color: #64748b; line-height: 1.65; border-top: 1px dashed #f1f5f9; padding-top: 16px; margin: 0;">
        Sign up at <code style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:5px;padding:1px 6px;font-size:11.5px;color:#1e293b;">gerakmy.com</code> using
        <code style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:5px;padding:1px 6px;font-size:11.5px;color:#1e293b;">${escapeHtml(invite.email)}</code> —
        your ${escapeHtml(roleLabel)} access ${tags.length ? `for ${escapeHtml(tags.join(', '))}` : ''} will be applied the moment you register with this address. No separate invite code needed.
      </p>
    </div>
    <p style="font-size: 11px; color: #cbd5e1; text-align: center; margin: 18px 0 0;">This invite was sent by a Gerak admin. If you weren't expecting this, you can safely ignore it.</p>
  </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: invite.email, cc: 'gerakmygroup@gmail.com', subject, html }),
    })
    if (!res.ok) {
      console.error('sendInviteEmail: Resend API error:', res.status, await res.text())
    }
  } catch (err) {
    console.error('sendInviteEmail: failed to send:', err)
  }
}
