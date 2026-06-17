import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export async function sendEmail({ to, subject, html, attachments }: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const client = getResend();
  const { error } = await client.emails.send({
    from: 'CSHP <payements@centresportifhp.com>',
    to,
    subject,
    html,
    ...(attachments && attachments.length
      ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
      : {}),
  });
  if (error) throw new Error(error.message);
}
