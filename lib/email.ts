import nodemailer from 'nodemailer';
import { prisma } from './prisma';

// Email configuration
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.hostinger.com';
  const port = process.env.EMAIL_PORT ? Number.parseInt(process.env.EMAIL_PORT, 10) : 587;
  const secure = process.env.EMAIL_SECURE === undefined ? false : process.env.EMAIL_SECURE === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Datum branding constants
const DATUM_BRAND = {
  name: 'Datum',
  tagline: 'Insights That Drive Decisions',
  primaryColor: '#0f172a',   // dark slate
  accentColor: '#6366f1',    // indigo
  secondaryColor: '#f1f5f9', // light slate
  textColor: '#1e293b',
  mutedColor: '#64748b',
  website: process.env.NEXT_PUBLIC_APP_URL || 'https://datum.app',
  supportEmail: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'support@datum.app',
};

// Base email layout wrapper — shared header/footer for all Datum emails
const wrapInDatumLayout = (bodyHtml: string, previewText = '') => {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>Datum</title>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>` : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: ${DATUM_BRAND.textColor}; line-height: 1.6; }
    a { color: ${DATUM_BRAND.accentColor}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .email-wrapper { background: #f8fafc; padding: 40px 20px; }
    .email-container { max-width: 620px; margin: 0 auto; }
    /* Header */
    .email-header { background: ${DATUM_BRAND.primaryColor}; padding: 28px 40px; border-radius: 12px 12px 0 0; text-align: center; }
    .email-header .logo-text { font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .email-header .logo-dot { color: ${DATUM_BRAND.accentColor}; }
    .email-header .tagline { font-size: 12px; color: #94a3b8; margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }
    /* Body */
    .email-body { background: #ffffff; padding: 40px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
    /* Footer */
    .email-footer { background: ${DATUM_BRAND.primaryColor}; padding: 24px 40px; border-radius: 0 0 12px 12px; text-align: center; }
    .email-footer p { font-size: 12px; color: #64748b; margin: 4px 0; }
    .email-footer a { color: #94a3b8; font-size: 12px; }
    .email-footer .footer-links { margin: 10px 0; }
    .email-footer .footer-links a { margin: 0 8px; }
    /* Components */
    .btn { display: inline-block; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; text-decoration: none !important; margin: 6px 4px; cursor: pointer; }
    .btn-primary { background: ${DATUM_BRAND.accentColor}; color: #ffffff !important; }
    .btn-secondary { background: #f1f5f9; color: ${DATUM_BRAND.textColor} !important; border: 1px solid #e2e8f0; }
    .btn-success { background: #10b981; color: #ffffff !important; }
    .info-box { background: #f8fafc; border-left: 4px solid ${DATUM_BRAND.accentColor}; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .message-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 999px; font-weight: 600; font-size: 13px; }
    .badge-pending { background: #fef9c3; color: #854d0e; }
    .badge-resolved { background: #dcfce7; color: #166534; }
    .badge-info { background: #e0e7ff; color: #3730a3; }
    .divider { height: 1px; background: #e2e8f0; margin: 24px 0; }
    .section-title { font-size: 13px; font-weight: 700; color: ${DATUM_BRAND.mutedColor}; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
    h1 { font-size: 24px; font-weight: 700; color: ${DATUM_BRAND.textColor}; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 700; color: ${DATUM_BRAND.textColor}; margin-bottom: 8px; }
    p { margin-bottom: 14px; color: ${DATUM_BRAND.textColor}; font-size: 15px; }
    .text-muted { color: ${DATUM_BRAND.mutedColor}; font-size: 13px; }
    .thread-item { padding: 14px 16px; border-radius: 6px; margin: 8px 0; border: 1px solid; }
    .thread-new-inquiry { background: #eff6ff; border-color: #bfdbfe; }
    .thread-admin-reply { background: #f5f3ff; border-color: #ddd6fe; }
    .thread-user-reply { background: #ecfdf5; border-color: #a7f3d0; }
    .thread-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
    .thread-label-inquiry { color: #1d4ed8; }
    .thread-label-admin { color: #7c3aed; }
    .thread-label-user { color: #059669; }
    .reply-notice { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="email-header">
        <div class="logo-text">Datum<span class="logo-dot">.</span></div>
        <div class="tagline">${DATUM_BRAND.tagline}</div>
      </div>

      <!-- Body -->
      <div class="email-body">
        ${bodyHtml}
      </div>

      <!-- Footer -->
      <div class="email-footer">
        <div class="footer-links">
          <a href="${DATUM_BRAND.website}">Website</a>
          <a href="${DATUM_BRAND.website}/contacts">Contact</a>
        </div>
        <p>© ${year} Datum. All rights reserved.</p>
        <p>${DATUM_BRAND.tagline}</p>
        <p style="margin-top:8px;">This email was sent in response to your inquiry at <a href="${DATUM_BRAND.website}">${DATUM_BRAND.website}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

// ─── Email Template Types ────────────────────────────────────────────────────

export type EmailTemplate =
  | 'contact_acknowledgement'  // Sent to user after they submit a contact form
  | 'contact_reply'            // Admin reply sent to user with threaded reply URL
  | 'contact_user_reply_admin' // Admin notification when user replies
  | 'custom';                  // Fully custom subject + HTML

interface EmailData {
  userName?: string;
  userEmail?: string;
  subject?: string;
  message?: string;
  status?: string;
  threadId?: string;
  replyUrl?: string;
  conversationHistoryHtml?: string;
  [key: string]: string | undefined;
}

// ─── Template Definitions ────────────────────────────────────────────────────

const getEmailTemplate = (
  template: EmailTemplate,
  data: EmailData
): { subject: string; html: string } => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  switch (template) {
    case 'contact_acknowledgement': {
      const body = `
        <h1>Thanks for reaching out, ${data.userName || 'there'}!</h1>
        <p>We've received your message and our team will review it shortly.</p>
        <div class="info-box">
          <div class="section-title">Your Inquiry</div>
          <p style="margin:0;"><strong>Subject:</strong> ${data.subject || '—'}</p>
        </div>
        <p>Typical response time is <strong>1–2 business days</strong>. We'll reply directly to this email address.</p>
        <p>In the meantime, feel free to explore more about what Datum has to offer.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${baseUrl}" class="btn btn-primary">Visit Datum</a>
        </div>
        <div class="divider"></div>
        <p class="text-muted">If you didn't submit this contact form, please ignore this email.</p>
      `;
      return {
        subject: `We received your message — Datum`,
        html: wrapInDatumLayout(body, `Hi ${data.userName}, we got your message!`),
      };
    }

    case 'contact_reply': {
      const statusMap: Record<string, { badge: string; label: string }> = {
        RESOLVED: { badge: 'badge-resolved', label: 'Resolved ✓' },
        PENDING: { badge: 'badge-pending', label: 'In Progress' },
      };
      const statusStyle = statusMap[data.status || ''] || { badge: 'badge-info', label: 'Updated' };

      const body = `
        <h1>A reply from the Datum team</h1>
        <p>Hello <strong>${data.userName || 'there'}</strong>,</p>
        <p>We've responded to your inquiry regarding <strong>${data.subject || 'your message'}</strong>.</p>

        <div style="margin:8px 0 18px;">
          <span class="status-badge ${statusStyle.badge}">${statusStyle.label}</span>
        </div>

        <div class="message-block">
          <div class="section-title">Our Response</div>
          <p style="white-space:pre-wrap;margin:0;">${data.message || ''}</p>
        </div>

        <div class="reply-notice">
          <strong>💬 Have a follow-up question?</strong>
          <p style="margin:8px 0 0;">Click below to reply directly to this conversation thread — your response will be added automatically.</p>
        </div>

        <div style="text-align:center;margin:28px 0;">
          <a href="${data.replyUrl || `${baseUrl}/contacts`}" class="btn btn-success">Reply to this Message</a>
          <a href="${baseUrl}/contacts" class="btn btn-secondary">New Inquiry</a>
        </div>

        ${data.conversationHistoryHtml || ''}

        <div class="divider"></div>
        <p class="text-muted">You're receiving this because you submitted a contact inquiry at Datum.</p>
      `;
      return {
        subject: data.subject ? `Re: ${data.subject} — Datum` : `Your Datum inquiry update`,
        html: wrapInDatumLayout(body, `Reply from Datum team`),
      };
    }

    case 'contact_user_reply_admin': {
      const body = `
        <h1>📬 New User Reply</h1>
        <p>A user has replied to a conversation thread.</p>

        <div class="info-box">
          <p style="margin:0 0 6px;"><strong>From:</strong> ${data.userName || '—'} (${data.userEmail || '—'})</p>
          <p style="margin:0 0 6px;"><strong>Subject:</strong> ${data.subject || '—'}</p>
          <p style="margin:0;"><strong>Thread ID:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${data.threadId || '—'}</code></p>
        </div>

        <div class="message-block">
          <div class="section-title">User's Latest Reply</div>
          <p style="white-space:pre-wrap;margin:0;">${data.message || ''}</p>
        </div>

        ${data.conversationHistoryHtml || ''}

        <div style="text-align:center;margin:28px 0;">
          <a href="${baseUrl}/admin/contacts" class="btn btn-primary">View in Admin Panel</a>
        </div>
      `;
      return {
        subject: `[User Reply] ${data.subject || 'Contact Thread'} — Datum Admin`,
        html: wrapInDatumLayout(body, `User replied to: ${data.subject}`),
      };
    }

    default: {
      const body = `<p>You have a notification from Datum.</p>`;
      return {
        subject: 'Notification from Datum',
        html: wrapInDatumLayout(body),
      };
    }
  }
};

// ─── Send Email ──────────────────────────────────────────────────────────────

export async function sendEmail({
  to,
  template,
  data,
  customSubject,
  customHtml,
  source,
  sentBy,
  metadata,
}: {
  to: string;
  template?: EmailTemplate;
  data?: EmailData;
  customSubject?: string;
  customHtml?: string;
  source?: string;
  sentBy?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const transporter = createTransporter();

    let subject: string;
    let html: string;

    if (customSubject && customHtml) {
      subject = customSubject;
      html = customHtml;
    } else if (template) {
      const result = getEmailTemplate(template, data || {});
      subject = result.subject;
      html = result.html;
    } else {
      throw new Error('Provide either template+data or customSubject+customHtml');
    }

    const fromAddress =
      process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@datum.app';

    const mailOptions = {
      from: `Datum <${fromAddress}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);

    // Log email to database if source provided
    if (source) {
      try {
        await (prisma as any).emailLog?.create({
          data: {
            subject,
            body: html,
            recipients: Array.isArray(to) ? to : [to],
            recipientCount: Array.isArray(to) ? to.length : 1,
            sentBy: sentBy || 'system',
            source,
            metadata: metadata || {},
          },
        });
      } catch {
        // emailLog table may not exist — silently skip logging
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
    };
  } catch (error) {
    console.error('❌ Datum email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

// ─── Verify Config ───────────────────────────────────────────────────────────

export async function verifyEmailConfig() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email configuration failed',
    };
  }
}

// ─── HTML helpers used by API routes ────────────────────────────────────────

export function buildConversationHistoryHtml(
  messages: Array<{
    conversationType: 'NEW_INQUIRY' | 'ADMIN_REPLY' | 'USER_REPLY';
    name: string;
    message: string;
    createdAt: Date;
  }>
): string {
  if (!messages.length) return '';

  const items = messages
    .map((msg) => {
      const type = msg.conversationType;
      const labelClass =
        type === 'ADMIN_REPLY'
          ? 'thread-admin-reply thread-label-admin'
          : type === 'USER_REPLY'
          ? 'thread-user-reply thread-label-user'
          : 'thread-new-inquiry thread-label-inquiry';

      const typeLabel =
        type === 'NEW_INQUIRY'
          ? '📩 Original Inquiry'
          : type === 'ADMIN_REPLY'
          ? '💬 Datum Team'
          : '✉️ User Reply';

      const itemClass =
        type === 'ADMIN_REPLY'
          ? 'thread-admin-reply'
          : type === 'USER_REPLY'
          ? 'thread-user-reply'
          : 'thread-new-inquiry';

      const cleanMessage = msg.message.split('\n\n-------')[0];

      return `
      <div class="thread-item ${itemClass}">
        <div class="thread-label ${labelClass}">${typeLabel} &mdash; ${msg.name}</div>
        <div class="text-muted" style="font-size:11px;margin-bottom:6px;">${new Date(msg.createdAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        <p style="margin:0;white-space:pre-wrap;font-size:13px;">${cleanMessage}</p>
      </div>`;
    })
    .join('');

  return `
    <div class="divider"></div>
    <div class="section-title">Conversation History</div>
    ${items}
  `;
}
