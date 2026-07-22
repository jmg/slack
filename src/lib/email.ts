// SendGrid email sender via the raw v3 API (no SDK dependency). Intentionally
// NOT `server-only` so the notify-emails cron script (plain tsx, not a Next
// server component) can import it too. Only ever imported from server routes /
// scripts — never from a client component.

const SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send";

export type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send one transactional email. No-ops (and logs) when SENDGRID_API_KEY /
 * SENDGRID_FROM are unset, so the app and the cron run fine without email
 * configured. Returns whether it actually sent.
 */
export async function sendEmail(input: EmailInput): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!apiKey || !from) {
    console.warn(`email: SENDGRID_API_KEY/SENDGRID_FROM unset — skipped "${input.subject}"`);
    return false;
  }

  const res = await fetch(SENDGRID_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: from, name: "Slack" },
      subject: input.subject,
      // SendGrid requires content ordered plain-text first, then HTML.
      content: [
        { type: "text/plain", value: input.text },
        ...(input.html ? [{ type: "text/html", value: input.html }] : []),
      ],
    }),
  });

  if (!res.ok) {
    console.error("email: SendGrid error", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}
