import ExcelJS from 'exceljs';
import { prisma } from './prisma';
import { sendEmail, htmlCourriel } from './mailer';

// Destinataire de la sauvegarde quotidienne (classeur Excel + résumé du jour).
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || 'centrehp@outlook.com';

// Date civile de Montréal (AAAA-MM-JJ) pour un instant donné.
export function dateMontreal(d = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

function fmt$(n: number): string {
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}

interface DonneesSauvegarde {
  buffer: Buffer;
  resume: {
    date: string;
    paiementsDuJour: Array<{ membre: string; groupe: string; montant: number; methode: string }>;
    totalDuJour: number;
    nouveauxMembresDuJour: string[];
    inscriptionsEnAttente: number;
    retards: { nombre: number; total: number };
    membresActifs: number;
  };
}

/**
 * Construit le classeur Excel de secours : tout ce qu'il faut pour continuer à
 * fonctionner hors application (Résumé par groupe, Membres, Transactions).
 */
export async function genererSauvegarde(now = new Date()): Promise<DonneesSauvegarde> {
  const [membres, sections] = await Promise.all([
    prisma.member.findMany({
      include: { sections: true, versements: { orderBy: { numeroVersement: 'asc' } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.section.findMany({ orderBy: { ordre: 'asc' } }),
  ]);

  const labelDe = (code: string) => sections.find((s) => s.code === code)?.label || code;
  const groupesDe = (m: any) => (m.sections || []).map((s: any) => labelDe(s.section)).join(' + ') || '—';
  const aujourdhui = dateMontreal(now);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CSHP Gestion';
  wb.created = now;

  // ---------- Feuille 1 : Résumé par groupe ----------
  const wsResume = wb.addWorksheet('Résumé');
  wsResume.columns = [
    { header: 'Groupe', key: 'groupe', width: 22 },
    { header: 'Membres actifs', key: 'actifs', width: 15 },
    { header: 'En attente', key: 'attente', width: 12 },
    { header: 'Encaissé (total)', key: 'encaisse', width: 16 },
    { header: 'Encaissé aujourd\'hui', key: 'jour', width: 20 },
    { header: 'En retard ($)', key: 'retard', width: 14 },
    { header: 'À venir ($)', key: 'avenir', width: 13 },
  ];
  wsResume.getRow(1).font = { bold: true };

  for (const sec of sections) {
    const dansSection = membres.filter((m) => m.sections.some((s: any) => s.section === sec.code));
    let encaisse = 0, jour = 0, retard = 0, avenir = 0;
    for (const m of dansSection) {
      for (const v of m.versements) {
        if (v.datePaiement) {
          encaisse += v.montant;
          if (dateMontreal(v.datePaiement) === aujourdhui) jour += v.montant;
        } else if (v.datePrevue < now) {
          retard += v.montant;
        } else {
          avenir += v.montant;
        }
      }
    }
    wsResume.addRow({
      groupe: sec.label,
      actifs: dansSection.filter((m) => m.status === 'ACTIF').length,
      attente: dansSection.filter((m) => m.status === 'EN_ATTENTE').length,
      encaisse, jour, retard, avenir,
    });
  }

  // ---------- Feuille 2 : Membres ----------
  const wsMembres = wb.addWorksheet('Membres');
  wsMembres.columns = [
    { header: 'Nom', key: 'nom', width: 18 },
    { header: 'Prénom', key: 'prenom', width: 16 },
    { header: 'Groupe(s)', key: 'groupes', width: 26 },
    { header: 'Statut', key: 'statut', width: 12 },
    { header: 'Plan', key: 'plan', width: 12 },
    { header: 'Montant total', key: 'montant', width: 13 },
    { header: 'Payé', key: 'paye', width: 11 },
    { header: 'Solde', key: 'solde', width: 11 },
    { header: 'Fin de contrat', key: 'fin', width: 14 },
    { header: 'Téléphone', key: 'tel', width: 15 },
    { header: 'Courriel (parent)', key: 'courriel', width: 34 },
    { header: 'Ceinture', key: 'ceinture', width: 14 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  wsMembres.getRow(1).font = { bold: true };

  for (const m of membres) {
    const paye = m.versements.filter((v: any) => v.datePaiement).reduce((s: number, v: any) => s + v.montant, 0);
    const total = m.montantFinal ?? m.versements.reduce((s: number, v: any) => s + v.montant, 0);
    wsMembres.addRow({
      nom: m.lastName, prenom: m.firstName, groupes: groupesDe(m), statut: m.status,
      plan: m.plan || '', montant: total, paye, solde: Math.max(0, (total || 0) - paye),
      fin: fmtDate(m.finContrat), tel: m.parentPhone || m.phone || '',
      courriel: m.parentEmail || m.email || '', ceinture: m.currentBelt || '',
      notes: m.notes || '',
    });
  }

  // ---------- Feuille 3 : Transactions (tous les versements) ----------
  const wsTx = wb.addWorksheet('Transactions');
  wsTx.columns = [
    { header: 'Date prévue', key: 'prevue', width: 13 },
    { header: 'Date payé', key: 'paye', width: 13 },
    { header: 'Statut', key: 'statut', width: 11 },
    { header: 'Membre', key: 'membre', width: 26 },
    { header: 'Groupe(s)', key: 'groupe', width: 26 },
    { header: 'N°', key: 'no', width: 5 },
    { header: 'Montant', key: 'montant', width: 11 },
    { header: 'Méthode', key: 'methode', width: 11 },
    { header: 'Note', key: 'note', width: 30 },
  ];
  wsTx.getRow(1).font = { bold: true };

  const lignesTx: any[] = [];
  for (const m of membres) {
    for (const v of m.versements) {
      lignesTx.push({
        prevue: fmtDate(v.datePrevue),
        paye: fmtDate(v.datePaiement),
        statut: v.datePaiement ? 'PAYÉ' : (v.datePrevue < now ? 'EN RETARD' : 'À VENIR'),
        membre: `${m.firstName} ${m.lastName}`,
        groupe: groupesDe(m),
        no: v.numeroVersement,
        montant: v.montant,
        methode: v.methodePaiement || '',
        note: v.note || '',
      });
    }
  }
  lignesTx.sort((a, b) => (b.paye || b.prevue).localeCompare(a.paye || a.prevue));
  for (const l of lignesTx) wsTx.addRow(l);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  // ---------- Résumé du jour (corps du courriel) ----------
  const paiementsDuJour = lignesTx
    .filter((l) => l.paye === aujourdhui)
    .map((l) => ({ membre: l.membre, groupe: l.groupe, montant: l.montant, methode: l.methode || '—' }));
  const nouveauxMembresDuJour = membres
    .filter((m) => dateMontreal(m.createdAt) === aujourdhui)
    .map((m) => `${m.firstName} ${m.lastName} (${groupesDe(m)})`);
  const retards = lignesTx.filter((l) => l.statut === 'EN RETARD');

  return {
    buffer,
    resume: {
      date: aujourdhui,
      paiementsDuJour,
      totalDuJour: paiementsDuJour.reduce((s, p) => s + p.montant, 0),
      nouveauxMembresDuJour,
      inscriptionsEnAttente: membres.filter((m) => m.status === 'EN_ATTENTE').length,
      retards: { nombre: retards.length, total: retards.reduce((s, l) => s + l.montant, 0) },
      membresActifs: membres.filter((m) => m.status === 'ACTIF').length,
    },
  };
}

/** Envoie la sauvegarde (classeur + résumé du jour) au courriel du centre. */
export async function envoyerSauvegarde(now = new Date()): Promise<{ envoyeA: string; resume: DonneesSauvegarde['resume'] }> {
  const { buffer, resume } = await genererSauvegarde(now);

  const lignesPaiements = resume.paiementsDuJour.length
    ? `<ul>${resume.paiementsDuJour.map((p) =>
        `<li><strong>${p.membre}</strong> (${p.groupe}) — ${fmt$(p.montant)} · ${p.methode}</li>`).join('')}</ul>`
    : '<p>Aucun paiement encaissé aujourd\'hui.</p>';
  const lignesNouveaux = resume.nouveauxMembresDuJour.length
    ? `<ul>${resume.nouveauxMembresDuJour.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p>Aucune nouvelle inscription aujourd\'hui.</p>';

  await sendEmail({
    to: BACKUP_EMAIL,
    subject: `📦 Sauvegarde CSHP — ${resume.date} (${fmt$(resume.totalDuJour)} encaissés)`,
    html: htmlCourriel(`
      <p>Bonjour,</p>
      <p>Voici la sauvegarde quotidienne. <strong>Le fichier Excel joint contient tout
      pour fonctionner sans l'application</strong> (résumé par groupe, liste des membres
      avec soldes, toutes les transactions).</p>
      <h3 style="margin:18px 0 6px;">Résumé du ${resume.date}</h3>
      <p><strong>💰 Encaissé aujourd'hui : ${fmt$(resume.totalDuJour)}</strong></p>
      ${lignesPaiements}
      <p><strong>🆕 Nouvelles inscriptions :</strong></p>
      ${lignesNouveaux}
      <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin:14px 0;">
        <p style="margin:2px 0;">Membres actifs : <strong>${resume.membresActifs}</strong></p>
        <p style="margin:2px 0;">Inscriptions en attente de paiement : <strong>${resume.inscriptionsEnAttente}</strong></p>
        <p style="margin:2px 0;">Versements en retard : <strong>${resume.retards.nombre}</strong> (${fmt$(resume.retards.total)})</p>
      </div>
      <p style="font-size:12px;color:#666;">Conservez quelques fichiers récents : chacun est une copie complète et autonome de la base.</p>
    `, { salutation: null }),
    attachments: [{ filename: `sauvegarde-cshp-${resume.date}.xlsx`, content: buffer }],
  });

  return { envoyeA: BACKUP_EMAIL, resume };
}

/**
 * Version quotidienne dédupliquée (appelée par la tournée automatique) :
 * au plus un envoi par date civile de Montréal.
 */
export async function envoyerSauvegardeSiDue(now = new Date()): Promise<'envoye' | 'ignore' | 'erreur'> {
  const refKey = dateMontreal(now);
  const deja = await prisma.reminderLog.findUnique({
    where: { type_refKey: { type: 'SAUVEGARDE_QUOTIDIENNE', refKey } },
  });
  if (deja) return 'ignore';

  try {
    await envoyerSauvegarde(now);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Erreur sauvegarde quotidienne:', message);
    prisma.auditLog.create({
      data: { action: 'ERREUR', entity: 'Sauvegarde', description: `Sauvegarde quotidienne échouée : ${message}` },
    }).catch(() => {});
    return 'erreur';
  }

  await prisma.reminderLog.create({
    data: { type: 'SAUVEGARDE_QUOTIDIENNE', memberId: 'SYSTEME', refKey },
  }).catch(() => { /* dédup concurrente */ });
  return 'envoye';
}
