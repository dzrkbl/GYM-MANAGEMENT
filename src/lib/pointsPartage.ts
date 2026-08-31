import { prisma } from './prisma';
import { sansTaxes, getChargesPeriode } from './finances';
import { calculerPointsAuto, PointsAuto } from './pointsAuto';

/**
 * RÈGLEMENT TRIMESTRIEL de l'entente de redevabilité :
 *   part de chaque associée = ses points ÷ points totaux × bénéfice distribuable.
 *
 * - Trimestres de SAISON (alignés sur les sessions) : T1 sept-nov, T2 déc-fév,
 *   T3 mars-mai, T4 juin-août. La saison « 2026 » = 2026-2027.
 * - Bénéfice net encaissé = encaissements du trimestre HORS TAXES − charges
 *   HORS TAXES récupérables (CTI/RTI) — la base « net » du Module financier.
 *   Les ventes d'équipement et frais de fédération n'y sont JAMAIS (règle).
 * - Trimestre déficitaire : rien n'est versé, le déficit se REPORTE ; le
 *   report S'ÉTEINT AU 30 JUIN — le T4 (été) repart toujours à zéro.
 * - Les acomptes mensuels déjà versés se déduisent de la part ; jamais
 *   repris (soldes plancher zéro).
 */

const arrondir = (n: number) => Math.round(n * 100) / 100;
const midi = (a: number, m: number, j: number) => new Date(Date.UTC(a, m - 1, j, 12));

export interface BorneTrimestre { numero: 1 | 2 | 3 | 4; debut: Date; fin: Date; mois: { mois: number; annee: number }[] }

/** Les 4 trimestres de la saison qui COMMENCE en `anneeSaison` (septembre). */
export function trimestresDeSaison(anneeSaison: number): BorneTrimestre[] {
  const a = anneeSaison;
  return [
    { numero: 1, debut: midi(a, 9, 1), fin: midi(a, 11, 30), mois: [{ mois: 9, annee: a }, { mois: 10, annee: a }, { mois: 11, annee: a }] },
    { numero: 2, debut: midi(a, 12, 1), fin: midi(a + 1, 2, 28 + (esBissextile(a + 1) ? 1 : 0)), mois: [{ mois: 12, annee: a }, { mois: 1, annee: a + 1 }, { mois: 2, annee: a + 1 }] },
    { numero: 3, debut: midi(a + 1, 3, 1), fin: midi(a + 1, 5, 31), mois: [{ mois: 3, annee: a + 1 }, { mois: 4, annee: a + 1 }, { mois: 5, annee: a + 1 }] },
    { numero: 4, debut: midi(a + 1, 6, 1), fin: midi(a + 1, 8, 31), mois: [{ mois: 6, annee: a + 1 }, { mois: 7, annee: a + 1 }, { mois: 8, annee: a + 1 }] },
  ];
}
const esBissextile = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Saison courante au sens des sessions : septembre à août. */
export function saisonCourante(now = new Date()): number {
  const iso = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(now);
  const [a, m] = iso.split('-').map(Number);
  return m >= 9 ? a : a - 1;
}

/** Bénéfice net encaissé d'un MOIS civil (base « net » du Module financier). */
export async function beneficeNetMois(mois: number, annee: number): Promise<number> {
  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 0, 23, 59, 59));
  const versements = await prisma.paymentVersement.findMany({
    where: { datePaiement: { gte: debut, lte: fin } },
    select: { montant: true },
  });
  const encaisse = versements.reduce((s, v) => s + v.montant, 0);
  const charges = await getChargesPeriode(mois, annee);
  return arrondir(sansTaxes(encaisse) - charges.totalChargesNet);
}

async function beneficeNetTrimestre(t: BorneTrimestre): Promise<number> {
  let total = 0;
  for (const m of t.mois) total += await beneficeNetMois(m.mois, m.annee);
  return arrondir(total);
}

export interface ReglementTrimestre {
  saison: string;
  numero: number;
  debut: string;
  fin: string;
  associes: { id: string; nom: string }[];
  auto: PointsAuto;
  plan: Record<string, { points: number; horsListe: number }>;
  points: Record<string, number>;
  totalPoints: number;
  ratios: Record<string, number>;
  horsListePct: Record<string, number>;
  benefices: { mois: number; annee: number; montant: number }[];
  benefice: number;
  report: number;
  base: number;
  distribuable: number;
  parts: Record<string, number>;
  acomptes: Record<string, number>;
  soldes: Record<string, number>;
  drapeaux: string[];
}

export async function reglementTrimestre(anneeSaison: number, numero: 1 | 2 | 3 | 4): Promise<ReglementTrimestre> {
  const bornes = trimestresDeSaison(anneeSaison);
  const t = bornes[numero - 1];

  // ---- Points : automatiques (traces de l'app) + plan (points figés au « fait »).
  const auto = await calculerPointsAuto(t.debut, t.fin);
  const debutJour = new Date(t.debut.toISOString().slice(0, 10) + 'T00:00:00Z');
  const finJour = new Date(t.fin.toISOString().slice(0, 10) + 'T23:59:59Z');
  const faits = await prisma.planTache.findMany({
    where: { statut: { in: ['FAIT', 'REPRIS'] }, faitLe: { gte: debutJour, lte: finJour } },
    select: { faitParId: true, points: true, tache: { select: { famille: true } } },
  });
  const plan: Record<string, { points: number; horsListe: number }> = {};
  for (const a of auto.associes) plan[a.id] = { points: 0, horsListe: 0 };
  for (const f of faits) {
    if (!f.faitParId || !(f.faitParId in plan)) continue;
    plan[f.faitParId].points = arrondir(plan[f.faitParId].points + (f.points || 0));
    if (f.tache.famille === 'HORS_LISTE') {
      plan[f.faitParId].horsListe = arrondir(plan[f.faitParId].horsListe + (f.points || 0));
    }
  }

  const points: Record<string, number> = {};
  for (const a of auto.associes) points[a.id] = arrondir((auto.totaux[a.id] || 0) + (plan[a.id]?.points || 0));
  const totalPoints = arrondir(Object.values(points).reduce((s, n) => s + n, 0));
  const ratios: Record<string, number> = {};
  for (const a of auto.associes) {
    ratios[a.id] = totalPoints > 0 ? Math.round((points[a.id] / totalPoints) * 10000) / 10000 : 1 / auto.associes.length;
  }
  const horsListePct: Record<string, number> = {};
  for (const a of auto.associes) {
    horsListePct[a.id] = points[a.id] > 0 ? Math.round(((plan[a.id]?.horsListe || 0) / points[a.id]) * 1000) / 10 : 0;
  }

  // ---- Argent : bénéfice du trimestre + report chaîné (extinction au 30 juin).
  const benefices: { mois: number; annee: number; montant: number }[] = [];
  for (const m of t.mois) benefices.push({ ...m, montant: await beneficeNetMois(m.mois, m.annee) });
  const benefice = arrondir(benefices.reduce((s, b) => s + b.montant, 0));

  let report = 0;
  if (numero > 1 && numero < 4) {
    let base = 0;
    for (let n = 1; n < numero; n++) {
      const bn = await beneficeNetTrimestre(bornes[n - 1]);
      base = Math.min(0, arrondir(bn + base));
    }
    report = base;
  } else if (numero === 4) {
    report = 0; // extinction au 30 juin : l'été repart à zéro (entente, art. 9.6)
  }

  const base = arrondir(benefice + report);
  const distribuable = Math.max(0, base);

  const parts: Record<string, number> = {};
  for (const a of auto.associes) parts[a.id] = arrondir(distribuable * ratios[a.id]);

  const acomptesListe = await prisma.acompteAssocie.findMany({ where: { date: { gte: debutJour, lte: finJour } } });
  const acomptes: Record<string, number> = {};
  for (const a of auto.associes) acomptes[a.id] = 0;
  for (const ac of acomptesListe) {
    if (ac.userId in acomptes) acomptes[ac.userId] = arrondir(acomptes[ac.userId] + ac.montant);
  }
  const soldes: Record<string, number> = {};
  for (const a of auto.associes) soldes[a.id] = Math.max(0, arrondir(parts[a.id] - acomptes[a.id]));

  // ---- Drapeaux (à l'ordre du jour de la réunion / revue).
  const drapeaux: string[] = [];
  for (const a of auto.associes) {
    if (horsListePct[a.id] > 10) drapeaux.push(`Hors-liste de ${a.nom} : ${horsListePct[a.id]} % du total (plafond 10 %) — validation à revoir.`);
  }
  if (base < 0) drapeaux.push(`Trimestre déficitaire (${base.toFixed(2)} $) : rien n'est distribué, le déficit se reporte${numero === 3 ? ' — et s\'éteindra au 30 juin' : ''}.`);
  if (numero >= 2) {
    const precedent = await beneficeNetTrimestre(bornes[numero - 2]);
    if (precedent < 0 && benefice < 0) drapeaux.push('Deux trimestres déficitaires consécutifs : réunion de viabilité OBLIGATOIRE (entente, art. 9.6).');
  }

  return {
    saison: `${anneeSaison}-${anneeSaison + 1}`,
    numero, debut: t.debut.toISOString().slice(0, 10), fin: t.fin.toISOString().slice(0, 10),
    associes: auto.associes, auto, plan, points, totalPoints, ratios, horsListePct,
    benefices, benefice, report, base, distribuable, parts, acomptes, soldes, drapeaux,
  };
}
