import { getCommSettings, getSystemCommSettings } from './communication.service.js'

interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

interface InlineImage {
  cid: string
  content: Buffer
  contentType: string
}

interface EmailPayload {
  to: string
  subject: string
  html: string
  replyTo?: string
  attachments?: EmailAttachment[]
  inlineImages?: InlineImage[]
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
      const sgAttachments = [
        ...(payload.attachments ?? []).map(a => ({
          filename: a.filename,
          content: a.content.toString('base64'),
          type: a.contentType,
          disposition: 'attachment',
        })),
        ...(payload.inlineImages ?? []).map(img => ({
          filename: img.cid,
          content: img.content.toString('base64'),
          type: img.contentType,
          disposition: 'inline',
          content_id: img.cid,
        })),
      ]
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: settings.emailFromAddress, name: settings.emailFromName || 'IBE' },
          reply_to: payload.replyTo ? { email: payload.replyTo } : undefined,
          subject: payload.subject,
          content: [{ type: 'text/html', value: payload.html }],
          ...(sgAttachments.length > 0 ? { attachments: sgAttachments } : {}),
        }),
      })
      if (res.ok || res.status === 202) return { ok: true }
      return { ok: false, error: `SendGrid error: ${res.status}` }
    }

    if (settings.emailProvider === 'mailgun') {
      if (!settings.emailApiKey) return { ok: false, error: 'Mailgun API key not configured' }
      const domain = settings.emailFromAddress.split('@')[1] ?? ''
      const credentials = Buffer.from(`api:${settings.emailApiKey}`).toString('base64')
      const formData = new FormData()
      formData.append('from', from)
      formData.append('to', payload.to)
      formData.append('subject', payload.subject)
      formData.append('html', payload.html)
      if (payload.replyTo) formData.append('h:Reply-To', payload.replyTo)
      payload.attachments?.forEach(a => {
        formData.append('attachment', new Blob([a.content], { type: a.contentType }), a.filename)
      })
      payload.inlineImages?.forEach(img => {
        formData.append('inline', new Blob([img.content], { type: img.contentType }), img.cid)
      })
      const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}` },
        body: formData,
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: `Mailgun error: ${res.status}` }
    }

    if (settings.emailProvider === 'smtp') {
      if (!settings.emailSmtpHost) return { ok: false, error: 'SMTP host not configured' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodemailer = (await import('nodemailer')) as any
      const port = settings.emailSmtpPort ?? 587
      const secure = port === 465
      const transporter = nodemailer.createTransport({
        host: settings.emailSmtpHost,
        port,
        secure,
        auth: settings.emailSmtpUser ? { user: settings.emailSmtpUser, pass: settings.emailSmtpPassword ?? undefined } : undefined,
      })
      await transporter.sendMail({
        from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
        attachments: [
          ...(payload.attachments ?? []).map(a => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
          ...(payload.inlineImages ?? []).map(img => ({
            filename: img.cid,
            content: img.content,
            contentType: img.contentType,
            cid: img.cid,
          })),
        ],
      })
      return { ok: true }
    }

    return { ok: false, error: `Unknown email provider: ${settings.emailProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendSystemEmail(payload: EmailPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = await getSystemCommSettings()
    if (!settings.emailEnabled) return { ok: false, error: 'System email not configured' }

    const from = settings.emailFromAddress
      ? `${settings.emailFromName || 'IBE'} <${settings.emailFromAddress}>`
      : 'IBE <noreply@example.com>'

    if (settings.emailProvider === 'smtp') {
      if (!settings.emailSmtpHost) return { ok: false, error: 'SMTP host not configured' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodemailer = (await import('nodemailer')) as any
      const port = settings.emailSmtpPort ?? 587
      const transporter = nodemailer.createTransport({
        host: settings.emailSmtpHost,
        port,
        secure: port === 465,
        auth: settings.emailSmtpUser ? { user: settings.emailSmtpUser, pass: settings.emailSmtpPassword ?? undefined } : undefined,
      })
      await transporter.sendMail({ from, to: payload.to, subject: payload.subject, html: payload.html })
      return { ok: true }
    }

    if (settings.emailProvider === 'sendgrid') {
      if (!settings.emailApiKey) return { ok: false, error: 'SendGrid API key not configured' }
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.emailApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: settings.emailFromAddress, name: settings.emailFromName || 'IBE' },
          subject: payload.subject,
          content: [{ type: 'text/html', value: payload.html }],
        }),
      })
      if (res.ok || res.status === 202) return { ok: true }
      return { ok: false, error: `SendGrid error: ${res.status}` }
    }

    return { ok: false, error: `Provider not supported for system email: ${settings.emailProvider}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
