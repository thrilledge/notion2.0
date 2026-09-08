import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP mailer. No-op (never throws / pretends success) when SMTP is not
 * configured, so local development and deployments without credentials keep
 * working — the pending invitation is still stored and auto-claimed on signup.
 */

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 587);
const SECURE = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM_NAME = process.env.SMTP_FROM_NAME || "Thrill Edge";
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || "no-reply@thrilledge.com";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

let transporter: Transporter | null = null;

function isConfigured(): boolean {
  return Boolean(HOST && USER && PASS);
}

function getTransporter(): Transporter | null {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER!, pass: PASS! },
    });
  }
  return transporter;
}

export interface InviteEmailParams {
  to: string;
  workspaceName: string;
  inviterName?: string | null;
  inviteUrl: string;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const t = getTransporter();
  if (!t) {
    return {
      sent: false,
      reason: "SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS).",
    };
  }

  const inviter = params.inviterName || "A team member";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
    <h2 style="margin:0 0 8px;">You're invited to <strong>${escapeHtml(params.workspaceName)}</strong></h2>
    <p style="color:#4b5563;line-height:1.6;">${escapeHtml(inviter)} invited you to join their workspace on Project Manager. Create your account to start collaborating on projects.</p>
    <p style="margin:20px 0;">
      <a href="${params.inviteUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">Accept invitation</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;">If the button doesn't work, copy and paste this link into your browser:<br/>${params.inviteUrl}</p>
    <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">This link is tied to your email address and will add you to the workspace automatically once you create your account.</p>
  </div>`;

  try {
    await t.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: params.to,
      subject: `You're invited to ${params.workspaceName}`,
      text: `${inviter} invited you to join ${params.workspaceName}. Open ${params.inviteUrl} to create your account and get access.`,
      html,
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to send invite email:", error);
    return { sent: false, reason: (error as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildInviteUrl(invitationId: string): string {
  return `${appUrl}/register?invite=${invitationId}`;
}
