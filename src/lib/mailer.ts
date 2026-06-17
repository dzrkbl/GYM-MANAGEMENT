import { Resend } from 'resend';

const APP_URL = process.env.APP_URL || '';

let resendClient: Resend | null = null;

// Gabarit commun des courriels : logo (si APP_URL configurée) + en-tête + signature.
export function htmlCourriel(contenu: string): string {
  const logo = APP_URL
    ? `<div style="text-align:center;margin-bottom:12px"><img src="${APP_URL}/logo.png" alt="Centre Sportif de Haute-Performance" style="height:72px"></div>`
    : '';
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 8px;">
    ${logo}
    <h2 style="color:#1a1a2e; text-align:center; margin:0 0 16px;">Centre Sportif de Haute-Performance</h2>
    ${contenu}
    <p style="margin-top:20px;">Merci,<br><strong>L'équipe CSHP</strong></p>
  </div>`;
}

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

// Sépare une valeur "a@x.com; b@y.com" (ou tableau) en liste d'adresses propres.
// Permet de contacter plusieurs parents (familles séparées) pour un même membre.
export function parseDestinataires(value?: string | string[] | null): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .flatMap((s) => String(s).split(/[;,]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendEmail({ to, subject, html, attachments }: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const destinataires = parseDestinataires(to);
  if (destinataires.length === 0) throw new Error('Aucun destinataire courriel valide');
  const client = getResend();
  const { error } = await client.emails.send({
    from: 'CSHP <payements@centresportifhp.com>',
    to: destinataires,
    subject,
    html,
    ...(attachments && attachments.length
      ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
      : {}),
  });
  if (error) throw new Error(error.message);
}
