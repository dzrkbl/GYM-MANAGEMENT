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

// Date « pure » (sans heure) pour Excel : la partie AAAA-MM-JJ en UTC.
function dateExcel(d: Date | null | undefined): Date | '' {
  if (!d) return '';
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Nom d'onglet Excel valide (31 caractères max, sans []:*?/\ ).
function nomOnglet(label: string): string {
  return label.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}

// Styles « comme Excel » : rouge à suivre / vert OK.
const STYLE_ROUGE = {
  fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
  font: { color: { argb: 'FF9C0006' }, bold: true },
} as any;
const STYLE_VERT = {
  fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } },
  font: { color: { argb: 'FF006100' } },
} as any;

interface DonneesSauvegarde {
  buffer: Buffer;
  resume: {
    date: string;          // jour d'envoi
    jourCouvert: string;   // la VEILLE : la dernière journée complète
    paiementsDuJour: Array<{ membre: string; groupe: string; montant: number; methode: string }>;
    totalDuJour: number;
    nouveauxMembresDuJour: string[];
    inscriptionsEnAttente: number;
    retards: { nombre: number; total: number };
    membresActifs: number;
  };
}

// Nombre maximal de paires (montant, date) inscrites dans la ligne d'un membre.
const MAX_PAIEMENTS = 5;

/**
 * Construit le classeur Excel de secours, calqué sur le fichier de travail du
 * centre : UNE FEUILLE PAR GROUPE avec les fiches complètes des membres, la
 * convention « montant rempli = payé ; date seule = à percevoir », une colonne
 * SUIVI calculée par des formules VIVANTES (TODAY()) et la coloration
 * rouge/verte automatique — le fichier continue de fonctionner seul, même si
 * l'application tombe. S'ajoutent une feuille Résumé et le journal Transactions.
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
  const aujourdhuiUTC = new Date(aujourdhui + 'T00:00:00Z');
  // Le résumé couvre la VEILLE : le courriel part le matin, donc « aujourd'hui »
  // serait une journée à peine commencée (toujours 0 $) — et tout encaissement
  // fait APRÈS l'envoi ne figurerait dans aucun résumé. La veille, elle, est
  // complète et rapportée exactement une fois.
  const hier = dateMontreal(new Date(now.getTime() - 86_400_000));

  // Nombre de référés : membres qui pointent vers ce membre (par id ou par nom).
  const nbReferes = (m: any) => {
    const nom = `${m.firstName} ${m.lastName}`.toLowerCase();
    return membres.filter((x) =>
      x.id !== m.id && (
        x.referePar === m.id ||
        (x.referePar || '').toLowerCase() === nom ||
        (x.refereParNom || '').toLowerCase() === nom
      )
    ).length;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CSHP Gestion';
  wb.created = now;

  // ---------- Feuille 1 : Résumé par groupe ----------
  // Chaque membre est compté dans son PREMIER groupe (pas de double comptage) :
  // la ligne TOTAL correspond exactement à la somme des lignes.
  const wsResume = wb.addWorksheet('Résumé');
  wsResume.columns = [
    { header: 'Groupe', key: 'groupe', width: 22 },
    { header: 'Membres actifs', key: 'actifs', width: 14 },
    { header: 'En attente', key: 'attente', width: 11 },
    { header: 'À payer (contrats)', key: 'apayer', width: 17 },
    { header: 'Total payé', key: 'paye', width: 13 },
    { header: 'Reste à percevoir', key: 'reste', width: 16 },
    { header: 'Encaissé hier', key: 'jour', width: 15 },
    { header: 'Renouvellements échus', key: 'renouv', width: 21 },
  ];
  wsResume.getRow(1).font = { bold: true };

  const groupesResume = [...sections.map((s) => ({ code: s.code, label: s.label })), { code: '', label: 'Sans groupe' }];
  const totaux = { actifs: 0, attente: 0, apayer: 0, paye: 0, reste: 0, jour: 0, renouv: 0 };
  for (const g of groupesResume) {
    const dansGroupe = membres.filter((m) =>
      g.code ? m.sections[0]?.section === g.code : m.sections.length === 0
    );
    if (!g.code && dansGroupe.length === 0) continue;

    let apayer = 0, paye = 0, jour = 0, renouv = 0;
    for (const m of dansGroupe) {
      if (m.status === 'INACTIF') continue;
      apayer += m.montantFinal || 0;
      for (const v of m.versements) {
        if (v.datePaiement) {
          paye += v.montant;
          if (dateMontreal(v.datePaiement) === hier) jour += v.montant;
        }
      }
      if (m.status === 'ACTIF' && m.finContrat && m.finContrat < aujourdhuiUTC) renouv++;
    }
    const ligne = {
      groupe: g.label,
      actifs: dansGroupe.filter((m) => m.status === 'ACTIF').length,
      attente: dansGroupe.filter((m) => m.status === 'EN_ATTENTE').length,
      apayer: Math.round(apayer * 100) / 100,
      paye: Math.round(paye * 100) / 100,
      reste: Math.round((apayer - paye) * 100) / 100,
      jour: Math.round(jour * 100) / 100,
      renouv,
    };
    wsResume.addRow(ligne);
    totaux.actifs += ligne.actifs; totaux.attente += ligne.attente;
    totaux.apayer += ligne.apayer; totaux.paye += ligne.paye;
    totaux.reste += ligne.reste; totaux.jour += ligne.jour; totaux.renouv += ligne.renouv;
  }
  const rowTotal = wsResume.addRow({
    groupe: 'TOTAL',
    actifs: totaux.actifs, attente: totaux.attente,
    apayer: Math.round(totaux.apayer * 100) / 100,
    paye: Math.round(totaux.paye * 100) / 100,
    reste: Math.round(totaux.reste * 100) / 100,
    jour: Math.round(totaux.jour * 100) / 100,
    renouv: totaux.renouv,
  });
  rowTotal.font = { bold: true };

  // ---------- Une feuille PAR GROUPE (le fichier de travail du centre) ----------
  const feuillesGroupes = [...sections.map((s) => ({ code: s.code, label: s.label })), { code: '', label: 'Sans groupe' }];
  for (const g of feuillesGroupes) {
    const dansGroupe = membres.filter((m) =>
      g.code ? m.sections.some((s: any) => s.section === g.code) : m.sections.length === 0
    );
    if (dansGroupe.length === 0) continue;

    const ws = wb.addWorksheet(nomOnglet(g.label));
    ws.columns = [
      { header: '#', key: 'no', width: 5 },                          // A
      { header: 'NOM', key: 'nom', width: 16 },                      // B
      { header: 'PRÉNOM', key: 'prenom', width: 14 },                // C
      { header: 'STATUT', key: 'statut', width: 12 },                // D
      { header: 'SUIVI', key: 'suivi', width: 11 },                  // E (formule vivante)
      { header: 'EMAIL', key: 'email', width: 34 },                  // F
      { header: 'NUM. DE TÉLÉPHONE', key: 'tel', width: 16 },        // G
      { header: 'DATE DE NAISSANCE', key: 'ddn', width: 15 },        // H
      { header: 'ÂGE', key: 'age', width: 6 },                       // I (formule)
      { header: 'POIDS', key: 'poids', width: 7 },                   // J
      { header: 'RABAIS FAMILLE?', key: 'rabais', width: 14 },       // K
      { header: 'RÉFÉRÉ PAR', key: 'refere', width: 18 },            // L
      { header: 'GRADE', key: 'grade', width: 12 },                  // M
      { header: 'NB DE RÉFÉRÉS', key: 'nbref', width: 13 },          // N
      { header: "DATE D'INSCRIPTION", key: 'insc', width: 15 },      // O
      { header: 'PLAN', key: 'plan', width: 12 },                    // P
      { header: 'NB PAIEMENTS', key: 'nbpaie', width: 12 },          // Q
      { header: 'À PAYER', key: 'apayer', width: 10 },               // R
      { header: '1er PAIEMENT', key: 'p1', width: 11 },              // S
      { header: 'DATE 1', key: 'd1', width: 12 },                    // T
      { header: '2e PAIEMENT', key: 'p2', width: 11 },               // U
      { header: 'DATE 2', key: 'd2', width: 12 },                    // V
      { header: '3e PAIEMENT', key: 'p3', width: 11 },               // W
      { header: 'DATE 3', key: 'd3', width: 12 },                    // X
      { header: '4e PAIEMENT', key: 'p4', width: 11 },               // Y
      { header: 'DATE 4', key: 'd4', width: 12 },                    // Z
      { header: '5e PAIEMENT', key: 'p5', width: 11 },               // AA
      { header: 'DATE 5', key: 'd5', width: 12 },                    // AB
      { header: 'FIN DE CONTRAT', key: 'fin', width: 14 },           // AC
      { header: 'TOTAL PAYÉ', key: 'paye', width: 12 },              // AD (formule)
      { header: 'RESTE', key: 'reste', width: 10 },                  // AE (formule)
      { header: 'NOTES', key: 'notes', width: 44 },                  // AF
    ];
    ws.getRow(1).font = { bold: true, size: 9 };
    ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = 'A1:AF1';

    let no = 0;
    for (const m of dansGroupe) {
      no++;
      const r = no + 1; // numéro de ligne Excel

      // Convention du fichier de travail : versement PAYÉ → montant + date de
      // paiement ; versement À PERCEVOIR → montant VIDE + date prévue. C'est ce
      // vide qui déclenche les formules et la coloration rouge.
      const paires: Array<{ montant: number | ''; date: Date | '' }> = [];
      for (const v of m.versements.slice(0, MAX_PAIEMENTS)) {
        paires.push(v.datePaiement
          ? { montant: v.montant, date: dateExcel(v.datePaiement) }
          : { montant: '', date: dateExcel(v.datePrevue) });
      }
      while (paires.length < MAX_PAIEMENTS) paires.push({ montant: '', date: '' });
      const extra = m.versements.length > MAX_PAIEMENTS
        ? ` [+${m.versements.length - MAX_PAIEMENTS} versement(s) — voir feuille Transactions]`
        : '';

      // Payé réel (résultat mis en cache pour les visionneuses sans calcul).
      const payeReel = m.versements.filter((v: any) => v.datePaiement)
        .reduce((s: number, v: any) => s + v.montant, 0);

      // SUIVI : reproduit les formules du fichier de travail — rouge si un
      // paiement à percevoir vient à échéance d'ici 7 jours (ou est passé), ou
      // si la fin de contrat approche/est passée. Ne s'applique qu'aux ACTIFS.
      const condPaire = (mCol: string, dCol: string) =>
        `AND($${mCol}${r}="",ISNUMBER($${dCol}${r}),$${dCol}${r}<TODAY()+7)`;
      const conditions = [
        condPaire('S', 'T'), condPaire('U', 'V'), condPaire('W', 'X'),
        condPaire('Y', 'Z'), condPaire('AA', 'AB'),
        `AND(ISNUMBER($AC${r}),$AC${r}<TODAY()+7)`,
      ].join(',');
      const formuleSuivi = `IF($D${r}<>"ACTIF","",IF(OR(${conditions}),"À SUIVRE","OK"))`;

      // Résultat serveur (même logique) pour l'affichage immédiat.
      const limite = new Date(aujourdhuiUTC); limite.setUTCDate(limite.getUTCDate() + 7);
      const enSuivi = m.status === 'ACTIF' && (
        m.versements.some((v: any) => !v.datePaiement && v.datePrevue < limite) ||
        (m.finContrat ? m.finContrat < limite : false)
      );

      const row = ws.addRow({
        no,
        nom: m.lastName,
        prenom: m.firstName,
        statut: m.status,
        suivi: { formula: formuleSuivi, result: m.status === 'ACTIF' ? (enSuivi ? 'À SUIVRE' : 'OK') : '' },
        email: m.parentEmail || m.email || '',
        tel: m.parentPhone || m.phone || '',
        ddn: dateExcel(m.dateOfBirth),
        age: m.dateOfBirth
          ? { formula: `IF($H${r}="","",DATEDIF($H${r},TODAY(),"Y"))`,
              result: Math.floor((now.getTime() - m.dateOfBirth.getTime()) / (365.25 * 86_400_000)) }
          : '',
        poids: m.poids ?? '',
        rabais: m.rabaisFamille ? 'OUI' : 'NON',
        refere: m.refereParNom || m.referePar || '',
        grade: m.currentBelt || '',
        nbref: nbReferes(m),
        insc: dateExcel(m.dateInscription),
        plan: m.plan || '',
        nbpaie: m.versements.length ? `${m.versements.length} paiement(s)` : '',
        apayer: m.montantFinal ?? '',
        p1: paires[0].montant, d1: paires[0].date,
        p2: paires[1].montant, d2: paires[1].date,
        p3: paires[2].montant, d3: paires[2].date,
        p4: paires[3].montant, d4: paires[3].date,
        p5: paires[4].montant, d5: paires[4].date,
        fin: dateExcel(m.finContrat),
        paye: { formula: `SUM($S${r},$U${r},$W${r},$Y${r},$AA${r})`, result: Math.round(payeReel * 100) / 100 },
        reste: { formula: `IF($R${r}="","",$R${r}-$AD${r})`,
                 result: m.montantFinal != null ? Math.round(((m.montantFinal || 0) - payeReel) * 100) / 100 : '' },
        notes: (m.notes || '') + extra,
      });

      // Formats
      for (const col of ['ddn', 'insc', 'd1', 'd2', 'd3', 'd4', 'd5', 'fin']) {
        row.getCell(col).numFmt = 'yyyy-mm-dd';
      }
      for (const col of ['apayer', 'p1', 'p2', 'p3', 'p4', 'p5', 'paye', 'reste']) {
        row.getCell(col).numFmt = '#,##0.00 $';
      }
    }

    // Coloration automatique (formules relatives → vit avec TODAY()).
    const derniere = dansGroupe.length + 1;
    ws.addConditionalFormatting({
      ref: `E2:E${derniere}`,
      rules: [
        { type: 'expression', priority: 1, formulae: [`$E2="À SUIVRE"`], style: STYLE_ROUGE },
        { type: 'expression', priority: 2, formulae: [`$E2="OK"`], style: STYLE_VERT },
      ],
    } as any);
    const pairesCols: Array<[string, string]> = [['S', 'T'], ['U', 'V'], ['W', 'X'], ['Y', 'Z'], ['AA', 'AB']];
    for (const [mCol, dCol] of pairesCols) {
      ws.addConditionalFormatting({
        ref: `${dCol}2:${dCol}${derniere}`,
        rules: [{
          type: 'expression', priority: 1,
          formulae: [`AND($${mCol}2="",ISNUMBER(${dCol}2),${dCol}2<TODAY()+7)`],
          style: STYLE_ROUGE,
        }],
      } as any);
    }
    ws.addConditionalFormatting({
      ref: `AC2:AC${derniere}`,
      rules: [{
        type: 'expression', priority: 1,
        formulae: [`AND($D2="ACTIF",ISNUMBER(AC2),AC2<TODAY()+7)`],
        style: STYLE_ROUGE,
      }],
    } as any);
  }

  // ---------- Feuille : Transactions (journal complet, une ligne par versement) ----------
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
  wsTx.views = [{ state: 'frozen', ySplit: 1 }];

  const lignesTx: any[] = [];
  for (const m of membres) {
    for (const v of m.versements) {
      lignesTx.push({
        prevue: fmtDate(v.datePrevue),
        paye: fmtDate(v.datePaiement),
        statut: v.datePaiement ? 'PAYÉ' : (fmtDate(v.datePrevue) < aujourdhui ? 'EN RETARD' : 'À VENIR'),
        membre: `${m.firstName} ${m.lastName}`,
        groupe: groupesDe(m),
        no: v.numeroVersement,
        montant: v.montant,
        methode: v.methodePaiement || '',
        note: v.note || '',
        _statutMembre: m.status,
      });
    }
  }
  lignesTx.sort((a, b) => (b.paye || b.prevue).localeCompare(a.paye || a.prevue));
  for (const l of lignesTx) {
    const { _statutMembre, ...donnees } = l;
    wsTx.addRow(donnees);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  // ---------- Résumé du jour (corps du courriel) ----------
  const paiementsDuJour = lignesTx
    .filter((l) => l.paye === hier)
    .map((l) => ({ membre: l.membre, groupe: l.groupe, montant: l.montant, methode: l.methode || '—' }));
  const nouveauxMembresDuJour = membres
    .filter((m) => dateMontreal(m.createdAt) === hier)
    .map((m) => `${m.firstName} ${m.lastName} (${groupesDe(m)})`);
  // Retards du résumé : mêmes règles que l'application (INACTIF exclus).
  const retards = lignesTx.filter((l) => l.statut === 'EN RETARD' && l._statutMembre !== 'INACTIF');

  return {
    buffer,
    resume: {
      date: aujourdhui,
      jourCouvert: hier,
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
    : '<p>Aucun paiement encaissé cette journée-là.</p>';
  const lignesNouveaux = resume.nouveauxMembresDuJour.length
    ? `<ul>${resume.nouveauxMembresDuJour.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p>Aucune nouvelle inscription cette journée-là.</p>';

  await sendEmail({
    to: BACKUP_EMAIL,
    subject: `📦 Sauvegarde CSHP — ${resume.date} (hier : ${fmt$(resume.totalDuJour)} encaissés)`,
    html: htmlCourriel(`
      <p>Bonjour,</p>
      <p>Voici la sauvegarde quotidienne. <strong>Le fichier Excel joint contient tout pour
      fonctionner sans l'application</strong> : une feuille par groupe (fiches complètes,
      paiements par personne et par date, suivi rouge/vert calculé par des formules qui
      restent actives), plus le résumé par groupe et le journal complet des transactions.</p>
      <h3 style="margin:18px 0 6px;">Résumé de la journée d'hier (${resume.jourCouvert})</h3>
      <p><strong>💰 Encaissé hier : ${fmt$(resume.totalDuJour)}</strong></p>
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
