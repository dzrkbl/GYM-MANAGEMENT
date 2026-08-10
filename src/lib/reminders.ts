import { prisma } from './prisma';
import { sendEmail, htmlCourriel, configCourriel } from './mailer';
import { fraisRetard, FRAIS_RETARD_PAR_SEMAINE } from './paiements';
import { envoyerSauvegardeSiDue } from './sauvegarde';

// ---------- Helpers de dates ----------
function jourDebut(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function jourFin(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function lundiDeLaSemaine(d: Date): Date {
  const x = jourDebut(d);
  const décalage = (x.getDay() + 6) % 7; // 0 = lundi
  x.setDate(x.getDate() - décalage);
  return x;
}

function formatMontant(n: number): string {
  return n.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
}
function formatDate(d: Date): string { return d.toLocaleDateString('fr-CA'); }

interface MembreContact { id: string; firstName: string; lastName: string; email: string | null; parentEmail: string | null; }
function destinataire(m: { email: string | null; parentEmail: string | null }): string | null {
  return m.parentEmail || m.email || null;
}

// Envoie un courriel une seule fois par (type, refKey) grâce à ReminderLog.
// Ne lève jamais : retourne 'envoye', 'ignore' ou 'erreur' pour qu'un échec
// d'envoi (adresse invalide, config…) n'interrompe pas le reste de la tournée.
async function envoyerAvecLog(opts: {
  type: string; memberId: string; versementId?: string | null; refKey: string;
  to: string; subject: string; html: string;
}): Promise<'envoye' | 'ignore' | 'erreur'> {
  const existing = await prisma.reminderLog.findUnique({
    where: { type_refKey: { type: opts.type, refKey: opts.refKey } },
  });
  if (existing) return 'ignore';

  try {
    await sendEmail({ to: opts.to, subject: opts.subject, html: opts.html });
  } catch (e) {
    console.error(`Erreur rappel ${opts.type} → ${opts.to}:`, e instanceof Error ? e.message : e);
    derniereErreurEnvoi = e instanceof Error ? e.message : String(e);
    return 'erreur';
  }

  try {
    await prisma.reminderLog.create({
      data: { type: opts.type, memberId: opts.memberId, versementId: opts.versementId ?? null, refKey: opts.refKey },
    });
  } catch {
    // Dédup concurrente : le log existe déjà, rien à faire.
  }
  return 'envoye';
}

let derniereErreurEnvoi: string | null = null;

type Stat = { envoyes: number; ignores: number; erreurs: number };
const stat = (): Stat => ({ envoyes: 0, ignores: 0, erreurs: 0 });

function compter(s: Stat, resultat: 'envoye' | 'ignore' | 'erreur'): void {
  if (resultat === 'envoye') s.envoyes++;
  else if (resultat === 'erreur') s.erreurs++;
  else s.ignores++;
}

// ---------- #7 Rappels de paiement multi-niveaux ----------
export async function sendPaymentReminders(now = new Date()): Promise<Record<string, Stat>> {
  const niveaux: Array<{ type: string; libelle: string; where: any }> = [
    {
      type: 'PAIEMENT_J7', libelle: 'dans 7 jours',
      where: { datePaiement: null, datePrevue: { gte: jourDebut(addDays(now, 7)), lte: jourFin(addDays(now, 7)) } },
    },
    {
      type: 'PAIEMENT_J0', libelle: "aujourd'hui",
      where: { datePaiement: null, datePrevue: { gte: jourDebut(now), lte: jourFin(now) } },
    },
    {
      type: 'PAIEMENT_RETARD', libelle: 'en retard',
      where: { datePaiement: null, datePrevue: { lt: jourDebut(now) } },
    },
  ];

  const result: Record<string, Stat> = {};

  for (const niveau of niveaux) {
    const s = stat();
    const versements = await prisma.paymentVersement.findMany({
      where: niveau.where,
      include: { member: true },
    });

    for (const v of versements) {
      const to = destinataire(v.member);
      if (!to) { s.ignores++; continue; }
      const nom = `${v.member.firstName} ${v.member.lastName}`;
      const enRetard = niveau.type === 'PAIEMENT_RETARD';
      // Frais de retard courus (règlement art. 6), sauf si exonérés par l'admin.
      const frais = enRetard ? fraisRetard(v, now) : 0;
      const html = htmlCourriel(`
        <p>${enRetard
          ? `Un versement pour <strong>${nom}</strong> est <strong>en retard</strong>.`
          : `Ceci est un rappel concernant un paiement à venir (${niveau.libelle}) pour <strong>${nom}</strong>.`}</p>
        <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:20px 0;">
          <p><strong>Montant :</strong> ${formatMontant(v.montant)}</p>
          <p><strong>Échéance :</strong> ${formatDate(v.datePrevue)}</p>
          ${frais > 0 ? `<p><strong>Frais de retard courus :</strong> ${formatMontant(frais)} (${FRAIS_RETARD_PAR_SEMAINE} $ par semaine de retard — règlement, art. 6)</p>` : ''}
        </div>
        ${enRetard ? `<p>Conformément au règlement intérieur, tout retard de plus d'une semaine entraîne des frais de ${FRAIS_RETARD_PAR_SEMAINE} $ par semaine. Merci de régulariser rapidement — contactez-nous en cas de difficulté.</p>` : ''}
        <p>Pour toute question : payements@centresportifhp.com</p>`);
      const resultat = await envoyerAvecLog({
        type: niveau.type, memberId: v.membreId, versementId: v.id, refKey: v.id,
        to, subject: enRetard ? 'Versement en retard — CSHP' : 'Rappel de paiement — CSHP', html,
      });
      compter(s, resultat);
    }
    result[niveau.type] = s;
  }
  return result;
}

// ---------- #6 Rappels de renouvellement (30 jours avant fin de contrat) ----------
export async function sendRenewalReminders(now = new Date()): Promise<Stat> {
  const s = stat();
  const membres = await prisma.member.findMany({
    where: { status: 'ACTIF', finContrat: { gte: jourDebut(now), lte: jourFin(addDays(now, 30)) } },
  });

  for (const m of membres) {
    const to = destinataire(m);
    if (!to || !m.finContrat) { s.ignores++; continue; }
    const nom = `${m.firstName} ${m.lastName}`;
    const refKey = `${m.id}:${m.finContrat.toISOString().slice(0, 10)}`;
    const html = htmlCourriel(`
      <p>L'inscription de <strong>${nom}</strong> arrive à échéance le
      <strong>${formatDate(m.finContrat)}</strong>.</p>
      <p>Communiquez avec nous pour le renouvellement afin d'assurer la continuité de la saison.</p>`);
    const resultat = await envoyerAvecLog({
      type: 'RENOUVELLEMENT', memberId: m.id, refKey,
      to, subject: 'Renouvellement à venir — CSHP', html,
    });
    compter(s, resultat);
  }
  return s;
}

// ---------- #8 Alertes d'absence (aucune présence depuis 14 jours) ----------
export async function sendAbsenceAlerts(now = new Date(), seuilJours = 14): Promise<Stat> {
  const s = stat();
  const cutoff = addDays(jourDebut(now), -seuilJours);

  // Dernière présence par membre.
  const dernieres = await prisma.attendance.groupBy({ by: ['memberId'], _max: { date: true } });
  const absentsIds = dernieres
    .filter((d) => d._max.date && d._max.date < cutoff)
    .map((d) => d.memberId);
  if (absentsIds.length === 0) return s;

  const membres = await prisma.member.findMany({
    where: { id: { in: absentsIds }, status: 'ACTIF' },
    select: { id: true, firstName: true, lastName: true, email: true, parentEmail: true },
  });

  const semaine = lundiDeLaSemaine(now).toISOString().slice(0, 10);

  for (const m of membres as MembreContact[]) {
    const to = destinataire(m);
    if (!to) { s.ignores++; continue; }
    const nom = `${m.firstName} ${m.lastName}`;
    const refKey = `${m.id}:${semaine}`; // au plus une alerte par membre par semaine
    const html = htmlCourriel(`
      <p>Nous avons remarqué que <strong>${nom}</strong> ne s'est pas présenté(e) aux
      entraînements depuis un certain temps.</p>
      <p>Nous espérons que tout va bien ! N'hésitez pas à nous contacter si nous pouvons aider.</p>`);
    const resultat = await envoyerAvecLog({
      type: 'ABSENCE', memberId: m.id, refKey,
      to, subject: 'On ne vous a pas vu(e) au dojo — CSHP', html,
    });
    compter(s, resultat);
  }
  return s;
}

// ---------- #5 Relance des prospects : NEW sans suivi depuis N jours -> alerte admin ----------
export async function sendLeadFollowups(now = new Date(), seuilJours = 3): Promise<Stat> {
  const s = stat();
  const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
  if (!notif) return s; // pas d'adresse admin configurée

  const cutoff = addDays(jourDebut(now), -seuilJours);
  const leads = await prisma.lead.findMany({ where: { status: 'NEW', createdAt: { lt: cutoff } } });

  for (const l of leads) {
    const html = htmlCourriel(`
      <p>Bonjour,</p>
      <p>Le prospect <strong>${l.firstName} ${l.lastName}</strong> (${l.sport}, ${l.requestType})
      n'a pas encore été contacté depuis sa demande du ${formatDate(l.createdAt)}.</p>
      <p>Coordonnées : ${l.phone || '—'} · ${l.email || '—'}</p>
      <p>Pensez à effectuer un suivi.</p>`, { salutation: null });
    const resultat = await envoyerAvecLog({
      type: 'LEAD_RELANCE', memberId: l.id, refKey: l.id,
      to: notif, subject: `Prospect à relancer — ${l.firstName} ${l.lastName}`, html,
    });
    compter(s, resultat);
  }
  return s;
}

// ---------- Alerte admin : membres EN ATTENTE dont un cours a lieu demain ----------
// « En attente » = fiche reçue mais aucun paiement enregistré. L'admin est
// prévenu la veille du prochain cours de la section pour pouvoir appeler.
const CODES_JOURS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

export async function sendEnAttenteAlerts(now = new Date()): Promise<Stat> {
  const s = stat();
  const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
  if (!notif) return s; // pas d'adresse admin configurée

  const demain = addDays(now, 1);
  const codeDemain = CODES_JOURS[demain.getDay()];
  const dateDemain = `${demain.getFullYear()}-${String(demain.getMonth() + 1).padStart(2, '0')}-${String(demain.getDate()).padStart(2, '0')}`;

  const [membres, cours] = await Promise.all([
    prisma.member.findMany({
      where: { status: 'EN_ATTENTE' },
      include: { sections: true },
    }),
    prisma.course.findMany({ where: { actif: true } }),
  ]);
  if (membres.length === 0) return s;

  const sectionsDemain = new Set(
    cours.filter((c) => (c.jours || []).includes(codeDemain)).map((c) => c.section)
  );

  const concernes: Array<{ id: string; nom: string; tel: string; courriel: string; depuis: string }> = [];
  for (const m of membres) {
    const aCoursDemain = m.sections.some((sec) => sectionsDemain.has(sec.section));
    if (!aCoursDemain) { s.ignores++; continue; }
    // Une seule alerte par membre et par date de cours.
    const refKey = `${m.id}:${dateDemain}`;
    const deja = await prisma.reminderLog.findUnique({
      where: { type_refKey: { type: 'EN_ATTENTE_COURS', refKey } },
    });
    if (deja) { s.ignores++; continue; }
    concernes.push({
      id: m.id,
      nom: `${m.firstName} ${m.lastName}`,
      tel: m.parentPhone || m.phone || '—',
      courriel: m.parentEmail || m.email || '—',
      depuis: m.createdAt ? formatDate(m.createdAt) : '—',
    });
  }
  if (concernes.length === 0) return s;

  const lignes = concernes
    .map((c) => `<li><strong>${c.nom}</strong> — 📞 ${c.tel} · ${c.courriel} (fiche reçue le ${c.depuis})</li>`)
    .join('');
  try {
    await sendEmail({
      to: notif,
      subject: `⏳ ${concernes.length} inscription(s) EN ATTENTE — cours demain (${codeDemain})`,
      html: htmlCourriel(`
        <p>Bonjour,</p>
        <p>Ces athlètes ont un cours <strong>demain</strong> mais leur inscription est
        toujours <strong>EN ATTENTE</strong> (aucun paiement enregistré). Un appel
        aujourd'hui permet de confirmer leur place :</p>
        <ul>${lignes}</ul>
        <p>Dès qu'un premier paiement est enregistré, l'athlète devient ACTIF automatiquement.</p>`,
        { salutation: null }),
    });
  } catch (e) {
    derniereErreurEnvoi = e instanceof Error ? e.message : String(e);
    s.erreurs++;
    return s;
  }

  for (const c of concernes) {
    await prisma.reminderLog.create({
      data: { type: 'EN_ATTENTE_COURS', memberId: c.id, refKey: `${c.id}:${dateDemain}` },
    }).catch(() => { /* dédup concurrente */ });
    s.envoyes++;
  }
  return s;
}

// ---------- Alerte admin : retards répétés ----------
// Un membre cumulant 2 retards ou plus (versements payés avec > 7 jours de
// retard, ou impayés depuis > 7 jours) est signalé à l'admin, une fois par mois.
export async function sendRetardRepeteAlerts(now = new Date()): Promise<Stat> {
  const s = stat();
  const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
  if (!notif) return s;

  const versements = await prisma.paymentVersement.findMany({
    where: {
      OR: [
        { datePaiement: null, datePrevue: { lt: addDays(jourDebut(now), -7) } },
        { datePaiement: { not: null } },
      ],
    },
    include: { member: true },
  });

  const parMembre = new Map<string, { nom: string; tel: string; retards: number; du: number }>();
  for (const v of versements) {
    const paye = v.datePaiement != null;
    const joursRetard = Math.floor(
      (((paye ? v.datePaiement!.getTime() : now.getTime()) - v.datePrevue.getTime())) / 86_400_000
    );
    if (joursRetard <= 7) continue;
    const entree = parMembre.get(v.membreId) || {
      nom: `${v.member.firstName} ${v.member.lastName}`,
      tel: v.member.parentPhone || v.member.phone || '—',
      retards: 0,
      du: 0,
    };
    entree.retards++;
    if (!paye) entree.du += v.montant;
    parMembre.set(v.membreId, entree);
  }

  const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const recidivistes: Array<{ id: string; nom: string; tel: string; retards: number; du: number }> = [];
  for (const [id, e] of parMembre) {
    if (e.retards < 2) continue;
    const refKey = `${id}:${mois}`; // au plus un signalement par membre par mois
    const deja = await prisma.reminderLog.findUnique({
      where: { type_refKey: { type: 'RETARD_REPETE', refKey } },
    });
    if (deja) { s.ignores++; continue; }
    recidivistes.push({ id, ...e });
  }
  if (recidivistes.length === 0) return s;

  const lignes = recidivistes
    .map((r) => `<li><strong>${r.nom}</strong> — ${r.retards} retards cumulés${r.du > 0 ? `, ${formatMontant(r.du)} impayé(s)` : ''} · 📞 ${r.tel}</li>`)
    .join('');
  try {
    await sendEmail({
      to: notif,
      subject: `🔁 Retards de paiement répétés — ${recidivistes.length} dossier(s) à surveiller`,
      html: htmlCourriel(`
        <p>Bonjour,</p>
        <p>Ces membres cumulent <strong>plusieurs retards de paiement</strong> (payés en
        retard ou impayés depuis plus d'une semaine) :</p>
        <ul>${lignes}</ul>
        <p>Frais de retard prévus au règlement : ${FRAIS_RETARD_PAR_SEMAINE} $/semaine —
        exonérables au cas par cas depuis la fiche du membre.</p>`,
        { salutation: null }),
    });
  } catch (e) {
    derniereErreurEnvoi = e instanceof Error ? e.message : String(e);
    s.erreurs++;
    return s;
  }

  for (const r of recidivistes) {
    await prisma.reminderLog.create({
      data: { type: 'RETARD_REPETE', memberId: r.id, refKey: `${r.id}:${mois}` },
    }).catch(() => { /* dédup concurrente */ });
    s.envoyes++;
  }
  return s;
}

// ---------- Exécution groupée (appelée par le cron ou le déclencheur intégré) ----------
export async function runAllReminders(now = new Date()) {
  // Sans transport courriel, chaque envoi échouerait : on s'arrête tout de suite
  // avec un résultat explicite plutôt que de générer des dizaines d'erreurs.
  const cfg = configCourriel();
  if (!cfg.provider) {
    console.warn('Rappels ignorés : courriel non configuré.', cfg.details);
    return { ignore: true, raison: cfg.details };
  }

  derniereErreurEnvoi = null;
  const paiements = await sendPaymentReminders(now);
  const renouvellements = await sendRenewalReminders(now);
  const absences = await sendAbsenceAlerts(now);
  const prospects = await sendLeadFollowups(now);
  const enAttente = await sendEnAttenteAlerts(now);
  const retardsRepetes = await sendRetardRepeteAlerts(now);
  // Sauvegarde quotidienne (classeur Excel + résumé du jour) — une fois par jour.
  const sauvegarde = await envoyerSauvegardeSiDue(now);

  // Rendre les échecs visibles dans l'interface (journal d'audit).
  const totalErreurs =
    Object.values(paiements).reduce((n, s) => n + s.erreurs, 0) +
    renouvellements.erreurs + absences.erreurs + prospects.erreurs +
    enAttente.erreurs + retardsRepetes.erreurs;
  if (totalErreurs > 0) {
    prisma.auditLog.create({
      data: {
        action: 'ERREUR',
        entity: 'Courriel',
        description: `Rappels automatiques : ${totalErreurs} envoi(s) en échec — ${derniereErreurEnvoi || 'voir logs serveur'}`,
      },
    }).catch((e) => console.error('Erreur audit rappels:', e));
  }

  return { paiements, renouvellements, absences, prospects, enAttente, retardsRepetes, sauvegarde };
}
