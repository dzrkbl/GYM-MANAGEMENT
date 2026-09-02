import { prisma } from './prisma';
import { dureeCours } from './horaire';

/**
 * PAIE À L'HEURE DES COACHS (spec Heures & cours, § 1.3) — le relevé d'heures
 * existe déjà sans le savoir : une séance TENUE (une date où au moins un
 * membre du cours a été pointé — la même définition que Rétention) d'un cours
 * dont le coach est assigné = des heures données. Il ne manquait qu'un taux.
 *
 * Deux lectures, jamais confondues :
 *  - heures TENUES   : le réel du mois (c'est LUI qu'on paie) ;
 *  - heures PRÉVUES  : les occurrences au calendrier (jours du cours dans le
 *    mois × durée) — la charge attendue d'un mois pas encore fini.
 */

const arr2 = (n: number) => Math.round(n * 100) / 100;

// Jours de Course (LUN..DIM) → indice getUTCDay (les dates de cours vivent à
// midi UTC : le jour UTC est le jour civil de Montréal).
const INDICE_JOUR: Record<string, number> = { DIM: 0, LUN: 1, MAR: 2, MER: 3, JEU: 4, VEN: 5, SAM: 6 };

/** Nombre de dates du mois tombant sur ces jours de semaine. */
export function occurrencesDuMois(jours: string[], mois: number, annee: number): number {
  const indices = new Set(jours.map((j) => INDICE_JOUR[j.toUpperCase()]).filter((n) => n !== undefined));
  if (indices.size === 0) return 0;
  let n = 0;
  const d = new Date(Date.UTC(annee, mois - 1, 1, 12));
  while (d.getUTCMonth() === mois - 1) {
    if (indices.has(d.getUTCDay())) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Vrai si (mois, annee) est ENTIÈREMENT écoulé (jour civil de Montréal). */
export function estMoisEcoule(mois: number, annee: number): boolean {
  const iso = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const anneeCourante = Number(iso.slice(0, 4));
  const moisCourant = Number(iso.slice(5, 7));
  return annee < anneeCourante || (annee === anneeCourante && mois < moisCourant);
}

export interface CoursCoachMois {
  courseId: string;
  section: string;
  jours: string[];
  startTime: string;
  endTime: string;
  duree: number;
  seancesTenues: number;
  seancesPrevues: number;
}

export interface HeuresCoachMois {
  heuresTenues: number;
  heuresPrevues: number;
  cours: CoursCoachMois[];
}

/**
 * Heures du mois par coach assigné à au moins un cours actif.
 * Tenues = séances réellement pointées × durée ; prévues = calendrier.
 */
export async function heuresCoachsPourMois(mois: number, annee: number): Promise<Map<string, HeuresCoachMois>> {
  const cours = await prisma.course.findMany({
    where: { actif: true, coachId: { not: null } },
    select: { id: true, coachId: true, section: true, jours: true, startTime: true, endTime: true },
  });
  const parCoach = new Map<string, HeuresCoachMois>();
  if (cours.length === 0) return parCoach;

  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 1)); // exclu
  const presences = await prisma.attendance.findMany({
    where: { date: { gte: debut, lt: fin }, courseId: { in: cours.map((c) => c.id) } },
    select: { courseId: true, date: true },
  });
  const seancesTenues = new Map<string, Set<string>>();
  for (const p of presences) {
    const jour = p.date.toISOString().slice(0, 10);
    if (!seancesTenues.has(p.courseId)) seancesTenues.set(p.courseId, new Set());
    seancesTenues.get(p.courseId)!.add(jour);
  }

  for (const c of cours) {
    const duree = dureeCours(c.startTime, c.endTime);
    const tenues = seancesTenues.get(c.id)?.size || 0;
    const prevues = occurrencesDuMois(c.jours, mois, annee);
    let e = parCoach.get(c.coachId!);
    if (!e) { e = { heuresTenues: 0, heuresPrevues: 0, cours: [] }; parCoach.set(c.coachId!, e); }
    e.heuresTenues = arr2(e.heuresTenues + tenues * duree);
    e.heuresPrevues = arr2(e.heuresPrevues + prevues * duree);
    e.cours.push({
      courseId: c.id, section: c.section, jours: c.jours,
      startTime: c.startTime, endTime: c.endTime, duree,
      seancesTenues: tenues, seancesPrevues: prevues,
    });
  }
  return parCoach;
}
