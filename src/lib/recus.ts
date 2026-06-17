import { jsPDF } from 'jspdf';
import { prisma } from './prisma';
import { sendEmail } from './mailer';
import { TPS_RATE, TVQ_RATE, DIVISEUR_TAXES } from './finances';

// Coordonnées de l'entreprise pour les reçus (surchargeables via variables d'environnement).
const RECU_NOM = process.env.RECU_NOM || 'Centre Sportif de Haute-Performance';
const RECU_ADRESSE = process.env.RECU_ADRESSE || '';
const RECU_TPS = process.env.RECU_TPS || '763471679 RT0001';
const RECU_TVQ = process.env.RECU_TVQ || '1226462895 TQ0001';
const RECU_NEQ = process.env.RECU_NEQ || '1174455635';
// On affiche la ventilation des taxes seulement si les numéros de taxes sont configurés.
const AVEC_TAXES = !!(RECU_TPS && RECU_TVQ);

const METHODE_LABEL: Record<string, string> = {
  CASH: 'Comptant',
  VIREMENT: 'Virement Interac / bancaire',
  CHEQUE: 'Chèque',
  CARTE: 'Carte de crédit/débit',
};

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMontant(n: number): string {
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

export interface RecuData {
  numero: number;
  date: Date;
  payeur: string;
  membre: string;
  description: string;
  montant: number;
  methode: string;
}

// Génère le PDF du reçu et retourne un Buffer.
export function generateRecuPdf(data: RecuData): Buffer {
  const doc = new jsPDF();
  const left = 20;
  let y = 20;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(RECU_NOM, left, y);

  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (RECU_ADRESSE) { doc.text(RECU_ADRESSE, left, y); y += 5; }
  if (AVEC_TAXES) { doc.text(`TPS : ${RECU_TPS}    TVQ : ${RECU_TVQ}`, left, y); y += 5; }
  if (RECU_NEQ) { doc.text(`NEQ : ${RECU_NEQ}`, left, y); y += 5; }

  y += 6;
  doc.setDrawColor(200);
  doc.line(left, y, 190, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', left, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Reçu no ${String(data.numero).padStart(5, '0')}`, 190, y, { align: 'right' });
  y += 6;
  doc.text(`Date : ${data.date.toLocaleDateString('fr-CA')}`, 190, y, { align: 'right' });

  y += 12;
  doc.setFontSize(11);
  doc.text(`Reçu de : ${data.payeur}`, left, y); y += 6;
  doc.text(`Pour : ${data.membre}`, left, y); y += 6;
  doc.text(`Méthode de paiement : ${METHODE_LABEL[data.methode] || data.methode}`, left, y);

  y += 12;
  doc.setDrawColor(200);
  doc.line(left, y, 190, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Description', left, y);
  doc.text('Montant', 190, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 7;
  doc.text(data.description, left, y);
  doc.text(formatMontant(data.montant), 190, y, { align: 'right' });

  y += 12;
  doc.line(120, y, 190, y);
  y += 7;

  if (AVEC_TAXES) {
    const avantTaxes = arrondir(data.montant / DIVISEUR_TAXES);
    const tps = arrondir(avantTaxes * TPS_RATE);
    const tvq = arrondir(avantTaxes * TVQ_RATE);
    doc.text('Sous-total :', 120, y); doc.text(formatMontant(avantTaxes), 190, y, { align: 'right' }); y += 6;
    doc.text('TPS (5 %) :', 120, y); doc.text(formatMontant(tps), 190, y, { align: 'right' }); y += 6;
    doc.text('TVQ (9,975 %) :', 120, y); doc.text(formatMontant(tvq), 190, y, { align: 'right' }); y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Total payé :', 120, y);
  doc.text(formatMontant(data.montant), 190, y, { align: 'right' });

  if (AVEC_TAXES) {
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Les prix sont taxes incluses.', 190, y, { align: 'right' });
  }

  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Merci de votre confiance.', left, y);

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
}

/**
 * Envoie automatiquement le reçu d'un versement payé, SAUF si le paiement est en
 * comptant (CASH) — dans ce cas un reçu papier est fait manuellement.
 * Idempotent : ne renvoie pas si un reçu a déjà été émis (receiptSentAt).
 * Retourne true si un reçu a été envoyé, false sinon.
 */
export async function sendRecuVersement(versementId: string): Promise<boolean> {
  const versement = await prisma.paymentVersement.findUnique({
    where: { id: versementId },
    include: { member: true },
  });

  if (!versement) return false;
  if (!versement.datePaiement) return false;            // pas payé
  if (versement.receiptSentAt) return false;            // reçu déjà envoyé
  const methode = versement.methodePaiement;
  if (!methode || methode === 'CASH') return false;     // comptant -> reçu papier manuel

  const destinataire = versement.member.parentEmail || versement.member.email;
  if (!destinataire) return false;                      // pas de courriel

  // Numéro de reçu séquentiel.
  const last = await prisma.paymentVersement.aggregate({ _max: { receiptNumber: true } });
  const numero = (last._max.receiptNumber ?? 0) + 1;

  const membreNom = `${versement.member.firstName} ${versement.member.lastName}`;
  const payeur = versement.member.parentName || membreNom;

  const pdf = generateRecuPdf({
    numero,
    date: versement.datePaiement,
    payeur,
    membre: membreNom,
    description: `Cotisation — versement n°${versement.numeroVersement}`,
    montant: versement.montant,
    methode,
  });

  await sendEmail({
    to: destinataire,
    subject: `Reçu de paiement — CSHP (no ${String(numero).padStart(5, '0')})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">${RECU_NOM}</h2>
        <p>Bonjour,</p>
        <p>Vous trouverez en pièce jointe le reçu pour le paiement de
        <strong>${membreNom}</strong> (${formatMontant(versement.montant)}).</p>
        <p>Merci,<br><strong>L'équipe CSHP</strong></p>
      </div>
    `,
    attachments: [{ filename: `recu-${String(numero).padStart(5, '0')}.pdf`, content: pdf }],
  });

  await prisma.paymentVersement.update({
    where: { id: versementId },
    data: { receiptNumber: numero, receiptSentAt: new Date() },
  });

  return true;
}
