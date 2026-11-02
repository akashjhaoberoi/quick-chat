import "server-only";
import { publicEnv, serverEnv } from "@/lib/env";
import { log } from "@/lib/log";

/**
 * Transactional email via Resend (security alerts). Sign-up verification and
 * password reset emails are sent by Supabase Auth — configure Resend as
 * Supabase's custom SMTP provider (see docs/SETUP.md).
 */
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f4ff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#15131f">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="100%" style="max-width:520px;background:#fff;border-radius:20px;padding:32px" cellpadding="0" cellspacing="0">
  <tr><td><div style="font-weight:800;font-size:20px;background:linear-gradient(90deg,#7c5cff,#ff5e7e);-webkit-background-clip:text;color:#7c5cff">Quick Chat</div>
  <h1 style="font-size:20px;margin:24px 0 12px">${escapeHtml(title)}</h1>${body}
  <p style="font-size:12px;color:#6b6880;margin-top:32px">Quick Chat by Akarika Technologies · <a href="${publicEnv.NEXT_PUBLIC_APP_URL}/settings/security" style="color:#7c5cff">Security settings</a></p>
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, title: string, paragraphs: string[]): Promise<boolean> {
  const key = serverEnv().RESEND_API_KEY;
  if (!key) return false;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    const html = layout(title, paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${escapeHtml(p)}</p>`).join(""));
    const { error } = await resend.emails.send({ from: serverEnv().RESEND_FROM_EMAIL, to, subject, html });
    if (error) {
      log("warn", "email_failed", { error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    log("warn", "email_failed", { error: (err as Error).message });
    return false;
  }
}

export function sendSecurityAlert(to: string | null, event: string, details: { device?: string; ip?: string }) {
  if (!to) return Promise.resolve(false);
  return sendEmail(to, `Quick Chat security alert: ${event}`, event, [
    `We noticed the following activity on your account: ${event}.`,
    `Device: ${details.device ?? "Unknown"} · IP: ${details.ip ?? "Unknown"} · Time: ${new Date().toUTCString()}`,
    "If this was you, no action is needed. If not, change your password and sign out of other sessions immediately.",
  ]);
}
