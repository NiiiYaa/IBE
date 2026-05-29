import { sendEmail } from './email.service.js'
import { getVendorFlow } from '@ibe/onboarding-flows'
import type { PreAction } from '@ibe/onboarding-flows'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface InvitationRecord {
  id: number
  contactEmail?: string | null
  hotelName?: string | null
  pmsId?: number | null
  pmsName?: string | null
  token: string
}

function renderPreActions(actions: PreAction[]): string {
  if (!actions.length) return ''
  const items = actions.map(a => `
    <div style="margin:12px 0;padding:14px 16px;background:#fff8e6;border-left:4px solid #f59e0b;border-radius:4px;">
      <strong style="display:block;margin-bottom:6px;color:#92400e;">⚡ ${escapeHtml(a.title)}</strong>
      <p style="margin:0;color:#374151;">${escapeHtml(a.instruction)}</p>
      ${a.contactEmail ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Contact: <a href="mailto:${escapeHtml(a.contactEmail)}">${escapeHtml(a.contactEmail)}</a></p>` : ''}
    </div>
  `).join('')
  return `
    <div style="margin:24px 0;">
      <h3 style="margin:0 0 8px;color:#92400e;">⚠️ Action required before you start</h3>
      <p style="margin:0 0 12px;color:#374151;">Before clicking the onboarding link, please complete the following steps with your channel manager:</p>
      ${items}
    </div>
  `
}

export async function sendInvitationEmail(invitation: InvitationRecord) {
  if (!invitation.contactEmail) return

  const onboardingUrl = process.env['ONBOARDING_APP_URL'] ?? 'http://localhost:3002'
  const link = `${onboardingUrl}/start/${invitation.token}`

  const flow = invitation.pmsId ? getVendorFlow(invitation.pmsId) : undefined
  const preActionsHtml = flow?.preActions ? renderPreActions(flow.preActions) : ''
  const cmName = flow?.pmsName ?? invitation.pmsName ?? 'your channel manager'
  const hotelName = invitation.hotelName ? escapeHtml(invitation.hotelName) : 'Your hotel'

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#2563eb;">Welcome to HyperGuest Onboarding</h2>
      <p>Hello,</p>
      <p>HyperGuest is ready to connect <strong>${hotelName}</strong> to the global B2B distribution network via <strong>${escapeHtml(cmName)}</strong>.</p>

      ${preActionsHtml}

      <div style="margin:24px 0;padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;">
        <p style="margin:0 0 12px;color:#374151;">${preActionsHtml ? 'Once you have completed the steps above, click below to start:' : 'Click below to begin the onboarding process:'}</p>
        <a href="${link}"
           style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">
          Start Onboarding →
        </a>
      </div>

      <p style="color:#6b7280;font-size:13px;">This link expires in 7 days. If you need help, contact your HyperGuest account manager.</p>
    </div>
  `

  await sendEmail(0, {
    to: invitation.contactEmail,
    subject: `${hotelName} — Your HyperGuest onboarding link is ready`,
    html,
  })
}

export async function notifyHarvestFailure(invitationId: number, reason: string) {
  const notifyEmail = process.env['HG_STAFF_NOTIFICATION_EMAIL']
  if (!notifyEmail) return
  const html = `
    <h2>IBE Harvest Failed</h2>
    <p>Invitation ID: ${invitationId}</p>
    <p>Reason: ${escapeHtml(reason)}</p>
    <p>Please review in the admin panel: Admin → Hotel Onboarding → Needs Attention</p>
  `
  await sendEmail(0, {
    to: notifyEmail,
    subject: `[HyperGuest] IBE harvest failed for invitation ${invitationId}`,
    html,
  })
}
