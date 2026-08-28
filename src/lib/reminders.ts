import { prisma } from './prisma';
import { sendEmail, htmlCourriel, configCourriel } from './mailer';
import { fraisRetard, FRAIS_RETARD_PAR_SEMAINE } from './paiements';
import { envoyerSauvegardeSiDue } from './sauvegarde';

// ---------- Helpers de dates ----------
// Tout raisonne en JOUR CIVIL DE MONTRÉAL. Le serveur tourne en UTC : en hiver
// (UTC-5), une tournée lancée à 19 h 30 à Montréal est déjà « demain » en UTC —
// avec des jours UTC, les rappels J-7/J0 partaient un jour trop tôt et l'alerte
// « cours demain » visait le surlendemain.
function dateMontrealISO(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(d);
}
function jourDebut(d: Date): Date { return new Date(dateMontrealISO(d) + 'T00:00:00Z'); }
function jourFin(d: Date): Date { return new Date(dateMontrealISO(d) + 'T23:59:59.999Z'); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function lundiDeLaSemaine(d: Date): Date {
  const x = jourDebut(d);
  const décalage = (x.getUTCDay() + 6) % 7; // 0 = lundi
  x.setUTCDate(x.getUTCDate() - décalage);
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
// Cadence par versement (anti-harcèlement, plafonnée) :
//   J-7 : 1 courriel de courtoisie · J0 : 1 courriel · Retard : 3 courriels
//   maximum, étagés (vers J+1, J+8 et J+15), puis silence côté parents —
//   l'admin prend le relais (retards répétés + digest des renouvellements).
// Les retards de plus de 90 jours (historique importé, ententes) ne déclenchent
// jamais de courriel aux parents : ils restent visibles dans l'app et les
// alertes admin.
const RETARD_AGE_MAX_JOURS = 90;

function joursDeRetard(datePrevue: Date, now: Date): number {
  return Math.floor((jourDebut(now).getTime() - jourDebut(datePrevue).getTime()) / 86_400_000);
}

export async function sendPaymentReminders(now = new Date()): Promise<Record<string, Stat>> {
  // Les membres INACTIF (départs) ne reçoivent plus aucun rappel, même si des
  // versements impayés restent dans leur dossier.
  const membreActif = { member: { status: { not: 'INACTIF' } } };

  // montant > 0 : jamais de rappel pour un versement à 0 $ (lignes vides d'import).
  const niveaux: Array<{ type: string; libelle: string; where: any }> = [
    {
      type: 'PAIEMENT_J7', libelle: 'dans 7 jours',
      where: { datePaiement: null, montant: { gt: 0 }, datePrevue: { gte: jourDebut(addDays(now, 7)), lte: jourFin(addDays(now, 7)) }, ...membreActif },
    },
    {
      type: 'PAIEMENT_J0', libelle: "aujourd'hui",
      where: { datePaiement: null, montant: { gt: 0 }, datePrevue: { gte: jourDebut(now), lte: jourFin(now) }, ...membreActif },
    },
    {
      type: 'PAIEMENT_RETARD', libelle: 'en retard',
      where: { datePaiement: null, montant: { gt: 0 }, datePrevue: { lt: jourDebut(now) }, ...membreActif },
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
      const enRetard = niveau.type === 'PAIEMENT_RETARD';

      // Étage du rappel de retard : 0 (J+1..7), 1 (J+8..14), 2 (J+15 et plus).
      // Un seul courriel par étage (refKey), donc 3 au maximum par versement.
      let refKey = v.id;
      if (enRetard) {
        const retard = joursDeRetard(v.datePrevue, now);
        if (retard > RETARD_AGE_MAX_JOURS) { s.ignores++; continue; }
        const etage = Math.min(Math.floor((retard - 1) / 7), 2);
        // L'étage 0 garde l'ancienne clé (v.id) pour ne pas renvoyer un courriel
        // aux familles déjà relancées avant cette version.
        refKey = etage === 0 ? v.id : `${v.id}:S${etage}`;
      }

      const nom = `${v.member.firstName} ${v.member.lastName}`;
      // Frais de retard : le montant FIXÉ par l'admin s'il y en a un, sinon le
      // compteur automatique (10 $/sem), sauf exonération.
      const frais = enRetard ? (v.fraisRetardFactures ?? fraisRetard(v, now)) : 0;
      const html = htmlCourriel(`
        <p>${enRetard
          ? `Un versement pour <strong>${nom}</strong> est <strong>en retard</strong>.`
          : `Ceci est un rappel concernant un paiement à venir (${niveau.libelle}) pour <strong>${nom}</strong>.`}</p>
        <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:20px 0;">
          <p><strong>Montant :</strong> ${formatMontant(v.montant)}</p>
          <p><strong>Échéance :</strong> ${formatDate(v.datePrevue)}</p>
          ${frais > 0 ? (v.fraisRetardFactures != null
            ? `<p><strong>Frais de retard :</strong> ${formatMontant(frais)}</p>`
            : `<p><strong>Frais de retard courus :</strong> ${formatMontant(frais)} (${FRAIS_RETARD_PAR_SEMAINE} $ par semaine de retard — règlement, art. 6)</p>`) : ''}
        </div>
        ${enRetard ? `<p>Conformément au règlement intérieur, tout retard de plus d'une semaine entraîne des frais de ${FRAIS_RETARD_PAR_SEMAINE} $ par semaine. Merci de régulariser rapidement — contactez-nous en cas de difficulté.</p>` : ''}
        <p>Pour toute question : payements@centresportifhp.com</p>`);
      const resultat = await envoyerAvecLog({
        type: niveau.type, memberId: v.membreId, versementId: v.id, refKey,
        to, subject: enRetard ? 'Versement en retard — CSHP' : 'Rappel de paiement — CSHP', html,
      });
      compter(s, resultat);
    }
    result[niveau.type] = s;
  }
  return result;
}

// ---------- #6 Rappels de renouvellement ----------
// Trois étapes par contrat, chacune envoyée une seule fois :
//   J-30 (fenêtre 8 à 30 jours avant) · J-7 (0 à 7 jours avant) · ÉCHU (contrat
//   terminé depuis 1 à 90 jours). Au-delà de 90 jours, plus de courriel aux
//   parents : le digest admin hebdomadaire prend le relais.
// C'est la date de fin de contrat (= date d'inscription + durée du forfait) qui
// déclenche le paiement suivant : sans elle, un membre soldé semblerait à jour.
const RENOUVELLEMENT_ECHU_MAX_JOURS = 90;

export async function sendRenewalReminders(now = new Date()): Promise<Stat> {
  const s = stat();
  const membres = await prisma.member.findMany({
    where: {
      status: 'ACTIF',
      finContrat: {
        gte: jourDebut(addDays(now, -RENOUVELLEMENT_ECHU_MAX_JOURS)),
        lte: jourFin(addDays(now, 30)),
      },
    },
  });

  for (const m of membres) {
    const to = destinataire(m);
    if (!to || !m.finContrat) { s.ignores++; continue; }
    const nom = `${m.firstName} ${m.lastName}`;
    const finIso = m.finContrat.toISOString().slice(0, 10);
    const jours = Math.floor((jourDebut(m.finContrat).getTime() - jourDebut(now).getTime()) / 86_400_000);

    let etape: 'R30' | 'R7' | 'ECHU';
    if (jours > 7) etape = 'R30';
    else if (jours >= 0) etape = 'R7';
    else etape = 'ECHU';

    // R30 garde l'ancienne clé (id:date) pour ne pas réécrire aux familles qui
    // ont déjà reçu le rappel J-30 avant cette version.
    const refKey = etape === 'R30' ? `${m.id}:${finIso}` : `${m.id}:${finIso}:${etape}`;
    const montant = m.montantFinal && m.montantFinal > 0
      ? `<p><strong>Montant du renouvellement :</strong> ${formatMontant(m.montantFinal)} (formule actuelle).</p>`
      : '';

    const contenu = etape === 'ECHU'
      ? `<p>L'inscription de <strong>${nom}</strong> est arrivée à échéance le
         <strong>${formatDate(m.finContrat)}</strong>.</p>
         ${montant}
         <p>Pour que ${m.firstName} conserve sa place dans son groupe, merci de passer nous voir
         à l'accueil ou de nous écrire pour compléter le renouvellement. Contactez-nous en cas
         de question ou de difficulté — nous trouverons une solution ensemble.</p>`
      : `<p>L'inscription de <strong>${nom}</strong> arrive à échéance le
         <strong>${formatDate(m.finContrat)}</strong>${etape === 'R7' ? ' (dans moins d\'une semaine)' : ''}.</p>
         ${montant}
         <p>Communiquez avec nous pour le renouvellement afin d'assurer la continuité de la saison.</p>`;

    const resultat = await envoyerAvecLog({
      type: 'RENOUVELLEMENT', memberId: m.id, refKey,
      to,
      subject: etape === 'ECHU' ? 'Renouvellement de l\'inscription — CSHP' : 'Renouvellement à venir — CSHP',
      html: htmlCourriel(contenu),
    });
    compter(s, resultat);
  }
  return s;
}

// ---------- Digest admin : renouvellements échus (filet de sécurité) ----------
// Une fois par semaine, la liste complète des membres ACTIF dont le contrat est
// terminé et non renouvelé — y compris ceux qui n'ont pas de courriel ou dont
// l'échéance remonte à plus de 90 jours. Rien n'échappe à ce filet.
export async function sendRenouvellementsEchusDigest(now = new Date()): Promise<Stat> {
  const s = stat();
  const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
  if (!notif) return s;

  const semaine = lundiDeLaSemaine(now).toISOString().slice(0, 10);
  const refKey = `SEMAINE:${semaine}`;
  const deja = await prisma.reminderLog.findUnique({
    where: { type_refKey: { type: 'RENOUVELLEMENTS_ECHUS', refKey } },
  });
  if (deja) { s.ignores++; return s; }

  const membres = await prisma.member.findMany({
    where: { status: 'ACTIF', finContrat: { lt: jourDebut(now) } },
    orderBy: { finContrat: 'asc' },
    include: { versements: true },
  });
  if (membres.length === 0) return s;

  const lignes = membres.map((m) => {
    const paye = m.versements.filter((v) => v.datePaiement).reduce((n, v) => n + v.montant, 0);
    const reste = Math.round(((m.montantFinal || 0) - paye) * 100) / 100;
    const tel = m.parentPhone || m.phone || '—';
    const courriel = m.parentEmail || m.email || 'aucun courriel';
    return `<li><strong>${m.firstName} ${m.lastName}</strong> — échu le ${m.finContrat ? formatDate(m.finContrat) : '—'}
      ${m.montantFinal ? ` · renouvellement ${formatMontant(m.montantFinal)}` : ''}
      ${reste > 0 ? ` · <strong>reste ${formatMontant(reste)} sur l'ancien contrat</strong>` : ''}
      · 📞 ${tel} · ${courriel}</li>`;
  }).join('');

  try {
    await sendEmail({
      to: notif,
      subject: `🔄 ${membres.length} renouvellement(s) à percevoir — récapitulatif hebdomadaire`,
      html: htmlCourriel(`
        <p>Bonjour,</p>
        <p>Contrats terminés et non renouvelés (membres toujours ACTIFS) :</p>
        <ul>${lignes}</ul>
        <p>Chaque famille jointe par courriel a déjà reçu ses rappels automatiques
        (J-30, J-7 et à l'échéance). Cette liste est le filet de sécurité pour le
        suivi téléphonique ou en personne.</p>`,
        { salutation: null }),
    });
  } catch (e) {
    derniereErreurEnvoi = e instanceof Error ? e.message : String(e);
    s.erreurs++;
    return s;
  }

  await prisma.reminderLog.create({
    data: { type: 'RENOUVELLEMENTS_ECHUS', memberId: 'SYSTEME', refKey },
  }).catch(() => { /* dédup concurrente */ });
  s.envoyes++;
  return s;
}

// ---------- #8 Alertes d'absence ----------
// Deux courriels MAXIMUM par épisode d'absence : un vers 14 jours sans
// présence, un vers 28 jours, puis silence. L'épisode est identifié par la
// date de la dernière présence : dès que l'athlète revient pointer, le
// compteur repart pour une éventuelle absence future.
// (Avant : un courriel par semaine, indéfiniment — harcelant, surtout pendant
// les fermetures de 2 semaines où tout le monde est « absent ».)
// Mettre ABSENCE_ALERTES=off dans l'environnement pour suspendre ces envois
// (utile pendant les vacances du centre).
export async function sendAbsenceAlerts(now = new Date(), seuilJours = 14): Promise<Stat> {
  const s = stat();
  if ((process.env.ABSENCE_ALERTES || '').toLowerCase() === 'off') return s;

  // Dernière présence par membre (les membres jamais pointés ne sont pas suivis ici).
  const dernieres = await prisma.attendance.groupBy({ by: ['memberId'], _max: { date: true } });
  const parMembre = new Map(dernieres.filter((d) => d._max.date).map((d) => [d.memberId, d._max.date!]));
  if (parMembre.size === 0) return s;

  const membres = await prisma.member.findMany({
    where: { id: { in: [...parMembre.keys()] }, status: 'ACTIF' },
    select: { id: true, firstName: true, lastName: true, email: true, parentEmail: true },
  });

  for (const m of membres as MembreContact[]) {
    const derniere = parMembre.get(m.id)!;
    const joursAbsent = Math.floor((jourDebut(now).getTime() - jourDebut(derniere).getTime()) / 86_400_000);
    if (joursAbsent < seuilJours) continue;

    const to = destinataire(m);
    if (!to) { s.ignores++; continue; }

    // Un seul palier par tournée : 28 jours prime sur 14 (pas deux courriels le même jour).
    const episode = derniere.toISOString().slice(0, 10);
    const palier = joursAbsent >= seuilJours * 2 ? 'A28' : 'A14';
    const refKey = `${m.id}:${episode}:${palier}`;
    // Si le palier 28 est atteint sans que le 14 ait été envoyé (déploiement,
    // app endormie), on n'envoie que le 28 : jamais deux courriels d'un coup.

    const nom = `${m.firstName} ${m.lastName}`;
    const html = htmlCourriel(`
      <p>Nous avons remarqué que <strong>${nom}</strong> ne s'est pas présenté(e) aux
      entraînements depuis ${palier === 'A28' ? 'environ un mois' : 'environ deux semaines'}.</p>
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

  // Tous ces champs viennent du formulaire PUBLIC du site : échappés pour
  // qu'un robot ne puisse pas injecter de HTML dans la boîte de l'admin
  // (même garde que leads.ts pour sa propre notification).
  const echap = (v?: string | null) =>
    (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const l of leads) {
    const provenance = [l.source, l.utmContent].filter(Boolean).map(echap).join(' · ');
    const html = htmlCourriel(`
      <p>Bonjour,</p>
      <p>Le prospect <strong>${echap(l.firstName)} ${echap(l.lastName)}</strong> (${echap(l.sport)}, ${l.requestType})
      n'a pas encore été contacté depuis sa demande du ${formatDate(l.createdAt)}.</p>
      <p>Coordonnées : ${echap(l.phone) || '—'} · ${echap(l.email) || '—'}</p>
      ${provenance ? `<p>Provenance : ${provenance}</p>` : ''}
      ${l.note ? `<p>Note : ${echap(l.note)}</p>` : ''}
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

  // « Demain » au sens du calendrier de Montréal (pas du fuseau du serveur).
  const dateDemain = dateMontrealISO(addDays(now, 1));
  const codeDemain = CODES_JOURS[new Date(dateDemain + 'T00:00:00Z').getUTCDay()];

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
// Seuls les 6 derniers mois comptent : un membre redevenu ponctuel sort de la
// liste au lieu d'être signalé à vie, et les départs (INACTIF) sont exclus.
export async function sendRetardRepeteAlerts(now = new Date()): Promise<Stat> {
  const s = stat();
  const notif = process.env.INSCRIPTION_NOTIF_EMAIL;
  if (!notif) return s;

  const versements = await prisma.paymentVersement.findMany({
    where: {
      datePrevue: { gte: addDays(jourDebut(now), -180) },
      member: { status: { not: 'INACTIF' } },
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

  const mois = dateMontrealISO(now).slice(0, 7); // mois civil de Montréal
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
  const renouvellementsEchus = await sendRenouvellementsEchusDigest(now);
  const absences = await sendAbsenceAlerts(now);
  const prospects = await sendLeadFollowups(now);
  const enAttente = await sendEnAttenteAlerts(now);
  const retardsRepetes = await sendRetardRepeteAlerts(now);
  // Sauvegarde quotidienne (classeur Excel + résumé du jour) — une fois par jour.
  const sauvegarde = await envoyerSauvegardeSiDue(now);

  // Rendre les échecs visibles dans l'interface (journal d'audit).
  const totalErreurs =
    Object.values(paiements).reduce((n, s) => n + s.erreurs, 0) +
    renouvellements.erreurs + renouvellementsEchus.erreurs + absences.erreurs +
    prospects.erreurs + enAttente.erreurs + retardsRepetes.erreurs;
  if (totalErreurs > 0) {
    prisma.auditLog.create({
      data: {
        action: 'ERREUR',
        entity: 'Courriel',
        description: `Rappels automatiques : ${totalErreurs} envoi(s) en échec — ${derniereErreurEnvoi || 'voir logs serveur'}`,
      },
    }).catch((e) => console.error('Erreur audit rappels:', e));
  }

  return { paiements, renouvellements, renouvellementsEchus, absences, prospects, enAttente, retardsRepetes, sauvegarde };
}
