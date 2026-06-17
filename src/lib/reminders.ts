import { prisma } from './prisma';
import { sendEmail, htmlCourriel } from './mailer';

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
async function envoyerAvecLog(opts: {
  type: string; memberId: string; versementId?: string | null; refKey: string;
  to: string; subject: string; html: string;
}): Promise<boolean> {
  const existing = await prisma.reminderLog.findUnique({
    where: { type_refKey: { type: opts.type, refKey: opts.refKey } },
  });
  if (existing) return false;

  await sendEmail({ to: opts.to, subject: opts.subject, html: opts.html });

  try {
    await prisma.reminderLog.create({
      data: { type: opts.type, memberId: opts.memberId, versementId: opts.versementId ?? null, refKey: opts.refKey },
    });
  } catch {
    // Dédup concurrente : le log existe déjà, rien à faire.
  }
  return true;
}

type Stat = { envoyes: number; ignores: number };
const stat = (): Stat => ({ envoyes: 0, ignores: 0 });

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
      const html = htmlCourriel(`
        <p>Bonjour,</p>
        <p>${enRetard
          ? `Un versement pour <strong>${nom}</strong> est <strong>en retard</strong>.`
          : `Ceci est un rappel concernant un paiement à venir (${niveau.libelle}) pour <strong>${nom}</strong>.`}</p>
        <div style="background:#f5f5f5;padding:15px;border-radius:8px;margin:20px 0;">
          <p><strong>Montant :</strong> ${formatMontant(v.montant)}</p>
          <p><strong>Échéance :</strong> ${formatDate(v.datePrevue)}</p>
        </div>
        <p>Pour toute question : payements@centresportifhp.com</p>`);
      const envoye = await envoyerAvecLog({
        type: niveau.type, memberId: v.membreId, versementId: v.id, refKey: v.id,
        to, subject: enRetard ? 'Versement en retard — CSHP' : 'Rappel de paiement — CSHP', html,
      });
      envoye ? s.envoyes++ : s.ignores++;
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
      <p>Bonjour,</p>
      <p>L'inscription de <strong>${nom}</strong> arrive à échéance le
      <strong>${formatDate(m.finContrat)}</strong>.</p>
      <p>Communiquez avec nous pour le renouvellement afin d'assurer la continuité de la saison.</p>`);
    const envoye = await envoyerAvecLog({
      type: 'RENOUVELLEMENT', memberId: m.id, refKey,
      to, subject: 'Renouvellement à venir — CSHP', html,
    });
    envoye ? s.envoyes++ : s.ignores++;
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
      <p>Bonjour,</p>
      <p>Nous avons remarqué que <strong>${nom}</strong> ne s'est pas présenté(e) aux
      entraînements depuis un certain temps.</p>
      <p>Nous espérons que tout va bien ! N'hésitez pas à nous contacter si nous pouvons aider.</p>`);
    const envoye = await envoyerAvecLog({
      type: 'ABSENCE', memberId: m.id, refKey,
      to, subject: 'On ne vous a pas vu(e) au dojo — CSHP', html,
    });
    envoye ? s.envoyes++ : s.ignores++;
  }
  return s;
}

// ---------- Exécution groupée (appelée par le cron) ----------
export async function runAllReminders(now = new Date()) {
  const paiements = await sendPaymentReminders(now);
  const renouvellements = await sendRenewalReminders(now);
  const absences = await sendAbsenceAlerts(now);
  return { paiements, renouvellements, absences };
}
