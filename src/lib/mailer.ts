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

export async function sendEmail({ to, subject, html }: {
  to: string;
  subject: string;
  html: string;
}) {
  const client = getResend();
  const { error } = await client.emails.send({
    from: 'CSHP <payements@centresportifhp.com>',
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}
