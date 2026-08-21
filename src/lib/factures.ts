import { jsPDF } from 'jspdf';
import { prisma } from './prisma';
import { chargerLogo } from './recus';
import { parseDestinataires } from './mailer';
import { TPS_RATE, TVQ_RATE, DIVISEUR_TAXES } from './finances';

// Facture / relevé annuel : pour un ou plusieurs membres cochés, une facture
// PAR FAMILLE reprenant tous les montants VERSÉS durant l'année civile choisie.
// Les enfants d'une même famille (lien « membre de la famille », même courriel
// ou même téléphone de parent) sont regroupés sur une seule facture.

const FACTURE_NOM = process.env.RECU_NOM || 'Centre Sportif de Haute-Performance';
const FACTURE_ADRESSE = process.env.FACTURE_ADRESSE || '6498 rue Beaubien E, Montréal, H1M 1A9';
const FACTURE_TEL = process.env.FACTURE_TEL || '514 747-5865';
const FACTURE_TPS = process.env.RECU_TPS || '763471679 RT0001';
const FACTURE_TVQ = process.env.RECU_TVQ || '1226462895 TQ0001';
const FACTURE_NEQ = process.env.RECU_NEQ || '1174455635';

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMontant(n: number): string {
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(year, month, day).toLocaleDateString('fr-CA');
}

type MembreFacture = {
  id: string;
  firstName: string;
  lastName: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  membreFamilleId: string | null;
  versements: { numeroVersement: number; montant: number; datePaiement: Date | null; methodePaiement: string | null; fraisRetardFactures?: number | null }[];
};

// Regroupe les membres sélectionnés par famille (union-find) : lien explicite
// « membre de la famille », même courriel de parent ou même téléphone de parent.
export function grouperParFamille(membres: MembreFacture[]): MembreFacture[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  for (const m of membres) parent.set(m.id, m.id);
  const ids = new Set(membres.map((m) => m.id));

  const parCle = new Map<string, string>();
  for (const m of membres) {
    if (m.membreFamilleId && ids.has(m.membreFamilleId)) union(m.id, m.membreFamilleId);
    for (const e of parseDestinataires(m.parentEmail)) {
      const cle = 'mail:' + e.toLowerCase();
      if (parCle.has(cle)) union(m.id, parCle.get(cle)!);
      else parCle.set(cle, m.id);
    }
    const tel = (m.parentPhone || '').replace(/\D/g, '');
    if (tel.length >= 7) {
      const cle = 'tel:' + tel;
      if (parCle.has(cle)) union(m.id, parCle.get(cle)!);
      else parCle.set(cle, m.id);
    }
  }

  const groupes = new Map<string, MembreFacture[]>();
  for (const m of membres) {
    const racine = find(m.id);
    if (!groupes.has(racine)) groupes.set(racine, []);
    groupes.get(racine)!.push(m);
  }
  return [...groupes.values()];
}

// Génère la facture PDF d'une famille pour une année civile.
export function genererFacturePdf(famille: MembreFacture[], annee: number): { filename: string; pdf: Buffer; total: number } {
  const doc = new jsPDF();
  const left = 20;
  const right = 190;
  let y = 20;

  const nouvellePageSiBesoin = (besoin = 12) => {
    if (y > 282 - besoin) {
      doc.addPage();
      y = 20;
    }
  };

  // ---- En-tête : coordonnées du centre + logo ----
  const logo = chargerLogo();
  if (logo) {
    try { doc.addImage(logo.data, logo.format, 158, 8, 36, 36); } catch { /* logo invalide : on l'ignore */ }
  }

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(FACTURE_NOM, left, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(FACTURE_ADRESSE, left, y); y += 5;
  doc.text(`Tél : ${FACTURE_TEL}`, left, y); y += 5;
  if (FACTURE_TPS && FACTURE_TVQ) { doc.text(`TPS : ${FACTURE_TPS}    TVQ : ${FACTURE_TVQ}`, left, y); y += 5; }
  if (FACTURE_NEQ) { doc.text(`NEQ : ${FACTURE_NEQ}`, left, y); y += 5; }

  y += 6;
  doc.setDrawColor(200);
  doc.line(left, y, right, y);
  y += 10;

  // ---- Titre + référence ----
  // Référence stable : même famille + même année = même numéro (regénérer la
  // facture ne crée pas un « nouveau » document comptable).
  const racine = [...famille].sort((a, b) => a.id.localeCompare(b.id))[0];
  const reference = `F${annee}-${racine.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const emiseLe = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURE — RELEVÉ ANNUEL ' + annee, left, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`No ${reference}`, right, y, { align: 'right' });
  y += 6;
  doc.text(`Émise le : ${emiseLe}`, right, y, { align: 'right' });

  // ---- Facturé à ----
  const payeur = famille.map((m) => m.parentName).find(Boolean)
    || `${famille[0].firstName} ${famille[0].lastName}`;
  const courriel = famille.flatMap((m) => parseDestinataires(m.parentEmail))[0] || null;
  y += 10;
  doc.setFontSize(11);
  doc.text(`Facturé à : ${payeur}`, left, y);
  if (courriel) { y += 6; doc.text(`Courriel : ${courriel}`, left, y); }
  y += 6;
  doc.text(`Athlète(s) : ${famille.map((m) => `${m.firstName} ${m.lastName}`).join(' · ')}`, left, y);

  y += 10;
  doc.setDrawColor(200);
  doc.line(left, y, right, y);
  y += 8;

  // ---- Lignes : paiements de l'année civile, par athlète ----
  const METHODE_LABEL: Record<string, string> = {
    CASH: 'Comptant', VIREMENT: 'Virement', CHEQUE: 'Chèque', CARTE: 'Carte',
  };
  let total = 0;

  doc.setFont('helvetica', 'bold');
  doc.text('Date', left, y);
  doc.text('Description', left + 30, y);
  doc.text('Montant', right, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 4;
  doc.line(left, y, right, y);
  y += 6;

  for (const m of famille) {
    const paiements = m.versements
      .filter((v) => v.datePaiement && v.datePaiement.toISOString().slice(0, 4) === String(annee))
      .sort((a, b) => a.datePaiement!.getTime() - b.datePaiement!.getTime());

    nouvellePageSiBesoin(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`${m.firstName} ${m.lastName}`, left, y);
    doc.setFont('helvetica', 'normal');
    y += 6;

    if (paiements.length === 0) {
      doc.setTextColor(120);
      doc.text(`Aucun paiement enregistré en ${annee}.`, left + 4, y);
      doc.setTextColor(0);
      y += 7;
      continue;
    }

    let sousTotal = 0;
    for (const v of paiements) {
      nouvellePageSiBesoin();
      const methode = v.methodePaiement ? ` (${METHODE_LABEL[v.methodePaiement] || v.methodePaiement})` : '';
      doc.text(formatDate(v.datePaiement!), left, y);
      doc.text(`Cotisation — versement n°${v.numeroVersement}${methode}`, left + 30, y);
      doc.text(formatMontant(v.montant), right, y, { align: 'right' });
      sousTotal += v.montant;
      y += 6;
      // Frais de retard CHARGÉS par l'admin sur ce versement (montant décidé,
      // pas le compteur automatique) : ligne distincte sur la facture.
      if (v.fraisRetardFactures && v.fraisRetardFactures > 0) {
        nouvellePageSiBesoin();
        doc.text(formatDate(v.datePaiement!), left, y);
        doc.text(`Frais de retard — versement n°${v.numeroVersement}`, left + 30, y);
        doc.text(formatMontant(v.fraisRetardFactures), right, y, { align: 'right' });
        sousTotal += v.fraisRetardFactures;
        y += 6;
      }
    }
    if (famille.length > 1) {
      nouvellePageSiBesoin();
      doc.setFont('helvetica', 'italic');
      doc.text(`Sous-total ${m.firstName} : ${formatMontant(arrondir(sousTotal))}`, right, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 8;
    } else {
      y += 3;
    }
    total += sousTotal;
  }
  total = arrondir(total);

  // ---- Total + taxes incluses ----
  nouvellePageSiBesoin(40);
  y += 2;
  doc.line(110, y, right, y);
  y += 7;
  if (FACTURE_TPS && FACTURE_TVQ && total > 0) {
    const avantTaxes = arrondir(total / DIVISEUR_TAXES);
    const tps = arrondir(avantTaxes * TPS_RATE);
    const tvq = arrondir(avantTaxes * TVQ_RATE);
    doc.text('Sous-total :', 110, y); doc.text(formatMontant(avantTaxes), right, y, { align: 'right' }); y += 6;
    doc.text('TPS (5 %) :', 110, y); doc.text(formatMontant(tps), right, y, { align: 'right' }); y += 6;
    doc.text('TVQ (9,975 %) :', 110, y); doc.text(formatMontant(tvq), right, y, { align: 'right' }); y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total versé en ${annee} :`, 110, y);
  doc.text(formatMontant(total), right, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  y += 6;
  doc.text('Les prix sont taxes incluses.', right, y, { align: 'right' });

  y += 14;
  nouvellePageSiBesoin();
  doc.setFontSize(10);
  doc.text('Merci de votre confiance.', left, y);

  const nomFamille = (racine.lastName || 'famille').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  return {
    filename: `facture-${annee}-${nomFamille}.pdf`,
    pdf: Buffer.from(doc.output('arraybuffer') as ArrayBuffer),
    total,
  };
}

// Charge les membres et produit une facture par famille pour l'année demandée.
export async function genererFactures(memberIds: string[], annee: number) {
  const membres = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true, firstName: true, lastName: true,
      parentName: true, parentEmail: true, parentPhone: true, membreFamilleId: true,
      versements: {
        select: { numeroVersement: true, montant: true, datePaiement: true, methodePaiement: true, fraisRetardFactures: true },
      },
    },
  });
  const familles = grouperParFamille(membres as MembreFacture[]);
  return familles.map((f) => {
    const { filename, pdf, total } = genererFacturePdf(f, annee);
    return {
      filename,
      total,
      membres: f.map((m) => `${m.firstName} ${m.lastName}`),
      base64: pdf.toString('base64'),
    };
  });
}
