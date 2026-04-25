import { getCommSettings } from './communication.service.js'

interface EmailPayload {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail(orgId: number, payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = await getCommSettings(orgId)
    if (!settings.emailEnabled) return { ok: false, error: 'Email not enabled for this organisation' }

    const from = settings.emailFromAddress
      ? `${settings.emailFromName || 'IBE'} <${settings.emailFromAddress}>`
      : 'IBE <noreply@example.com>'

    if (settings.emailProvider === 'sendgrid') {
      if (!settings.emailApiKey) return { ok: false, error: 'SendGrid API key not configured' }
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: settings.emailFromAddress, name: settings.emailFromName || 'IBE' },
          reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
          subject: payload.subject,
          content: [{ type: 'text/html', value: payload.html }],
        }),
      })
      if (res.ok || res.status === 202) return { ok: true }
      return { ok: false, error: `SendGrid error: ${res.status}` }
    }

    if (settings.emailProvider === 'mailgun') {
      if (!settings.emailApiKey) return { ok: false, error: 'Mailgun API key not configured' }
      const domain = settings.emailFromAddress.split('@')[1] ?? ''
      const credentials = Buffer.from(`api:${settings.emailApiKey}`).toString('base64')
      const body = new URLSearchParams({ from, to: payload.to, subject: payload.subject, html: payload.html })
      if (payload.replyTo) body.set('h:Reply-To', payload.replyTo)
      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}` },
        body,
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: `Mailgun error: ${res.status}` }
    }

    if (settings.emailProvider === 'smtp') {
      if (!settings.emailSmtpHost) return { ok: false, error: 'SMTP host not configured' }
      // Lazy-load nodemailer to avoid import issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodemailer = (await import('nodemailer')) as any
      const transporter = nodemailer.createTransport({
        host: settings.emailSmtpHost,
        port: settings.emailSmtpPort,
        secure: settings.emailSmtpSecure,
        auth: settings.emailSmtpUser ? { user: settings.emailSmtpUser, pass: settings.emailSmtpPassword ?? undefined } : undefined,
      })
      await transporter.sendMail({
        from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
      })
      return { ok: true }
    }

    return { ok: false, error: `Unknown email provider: ${settings.emailProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
