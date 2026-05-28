import { sendEmail } from './email.service.js'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface InvitationRecord {
  id: number
  contactEmail?: string | null
  hotelName?: string | null
  token: string
}

export async function sendInvitationEmail(invitation: InvitationRecord) {
  if (!invitation.contactEmail) return
  const onboardingUrl = process.env['ONBOARDING_APP_URL'] ?? 'http://localhost:3002'
  const link = `${onboardingUrl}/start/${invitation.token}`
  const html = `
    <h2>Welcome to HyperGuest Self-Onboarding</h2>
    <p>Your hotel data has been prepared. Click the link below to start the onboarding process:</p>
    <p><a href="${link}">Start Onboarding</a></p>
    <p>This link expires in 7 days.</p>
  `
  await sendEmail(0, {
    to: invitation.contactEmail,
    subject: 'Your HyperGuest onboarding link is ready',
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
