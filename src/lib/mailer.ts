import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma';

const APP_URL = process.env.APP_URL || '';

// Adresse d'expédition. Avec Resend, le domaine doit être vérifié dans leur
// tableau de bord ; avec SMTP, l'adresse doit correspondre au compte SMTP.
const EMAIL_FROM = process.env.EMAIL_FROM || 'CSHP <payements@centresportifhp.com>';

let resendClient: Resend | null = null;
let smtpClient: Transporter | null = null;

export type FournisseurCourriel = 'resend' | 'smtp' | null;

/**
 * Détermine le transport courriel disponible :
 *  - RESEND_API_KEY présent  -> Resend (nécessite un domaine vérifié chez Resend)
 *  - sinon SMTP_HOST + SMTP_USER + mot de passe -> SMTP (ex. smtp.hostinger.com)
 *  - sinon aucun : les envois échouent avec un message explicite.
 */
export function configCourriel(): { provider: FournisseurCourriel; from: string; details: string } {
  if (process.env.RESEND_API_KEY) {
    return { provider: 'resend', from: EMAIL_FROM, details: 'Resend (RESEND_API_KEY)' };
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  if (host && user && pass) {
    return { provider: 'smtp', from: EMAIL_FROM, details: `SMTP (${host}:${process.env.SMTP_PORT || 465})` };
  }
  return {
    provider: null,
    from: EMAIL_FROM,
    details:
      'Aucun transport configuré. Définir RESEND_API_KEY (Resend, domaine vérifié requis) ' +
      'OU SMTP_HOST + SMTP_USER + SMTP_PASS (ex. courriel Hostinger : smtp.hostinger.com, port 465).',
  };
}

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
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function getSmtp(): Transporter {
  if (!smtpClient) {
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    smtpClient = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS implicite ; 587 = STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
      },
      // Échouer vite avec une erreur claire plutôt que d'attendre ~2 min
      // (utile pour le bouton « courriel de test » de l'interface).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return smtpClient;
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

  const cfg = configCourriel();
  if (cfg.provider === 'resend') {
    const { error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to: destinataires,
      subject,
      html,
      ...(attachments && attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    });
    if (error) throw new Error(error.message);
    return;
  }
  if (cfg.provider === 'smtp') {
    await getSmtp().sendMail({
      from: EMAIL_FROM,
      to: destinataires,
      subject,
      html,
      ...(attachments && attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    });
    return;
  }
  throw new Error(cfg.details);
}

/**
 * Envoi « en arrière-plan » (non bloquant) : ne lève jamais d'exception, mais
 * consigne tout échec dans le journal d'audit (action ERREUR, entité Courriel)
 * pour que l'admin le voie dans l'interface au lieu des seuls logs serveur.
 */
export function sendEmailBackground(
  opts: { to: string | string[]; subject: string; html: string; attachments?: EmailAttachment[] },
  contexte: string
): void {
  sendEmail(opts).catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    const dest = parseDestinataires(opts.to).join(', ') || '(aucun)';
    console.error(`Erreur courriel [${contexte}] → ${dest}:`, message);
    prisma.auditLog
      .create({
        data: {
          action: 'ERREUR',
          entity: 'Courriel',
          description: `${contexte} → ${dest} : ${message}`,
        },
      })
      .catch((err) => console.error('Erreur audit courriel:', err));
  });
}
