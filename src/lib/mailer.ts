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

// Adresse de réponse : le courriel général du club (les parents répondent là).
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'centrehp@outlook.com';

/**
 * Gabarit commun des courriels : salutation + contenu + signature officielle.
 * `salutation` : par défaut « Chers parents et athlètes, » ; passer `null` pour les
 * courriels internes (notifications à l'administration).
 */
export function htmlCourriel(contenu: string, options?: { salutation?: string | null }): string {
  const salutation = options?.salutation === undefined
    ? 'Chers parents et athlètes,'
    : options.salutation;
  const logo = APP_URL
    ? `<div style="margin-bottom:16px"><img src="${APP_URL}/logo.png" alt="CSHP" style="height:64px"></div>`
    : '';
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 8px; color:#1a1a2e;">
    ${salutation ? `<p style="margin:0 0 14px;">${salutation}</p>` : ''}
    ${contenu}
    <div style="margin-top:28px; padding-top:14px; border-top:2px solid #1a1a2e;">
      ${logo}
      <p style="margin:0 0 2px;"><strong>Administration</strong></p>
      <p style="margin:0 0 2px;"><strong>Centre Sportif de Haute-Performance</strong></p>
      <p style="margin:0 0 2px;">6498 Beaubien Est, Montréal, H1M 1A9</p>
      <p style="margin:0 0 2px;">Tél : 514 747-5865</p>
      <p style="margin:0;">Courriel général : <a href="mailto:centrehp@outlook.com" style="color:#1a1a2e;">centrehp@outlook.com</a></p>
    </div>
  </div>`;
}

// Version texte brut (améliore la délivrabilité : les courriels HTML sans
// alternative texte sont plus souvent classés indésirables).
function htmlVersTexte(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const text = htmlVersTexte(html);
  if (cfg.provider === 'resend') {
    const { error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to: destinataires,
      replyTo: EMAIL_REPLY_TO,
      subject,
      html,
      text,
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
      replyTo: EMAIL_REPLY_TO,
      subject,
      html,
      text,
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
