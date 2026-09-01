// LA source unique pour lire l'horaire d'un cours ou d'un créneau loué
// (startTime/endTime au format « HH:MM », jours ["LUN", …]). Extrait de
// pointsAuto.ts et durci : une chaîne illisible ou une fin ≤ début donne une
// durée de 0 — jamais un chiffre silencieusement faux — et l'appelant peut
// distinguer « 0 parce qu'illisible » via horaireValide() pour le remonter
// en avertissement (page Rapports) au lieu de laisser un cours disparaître
// des coûts sans bruit.

const RE_HEURE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** « 17:05 » → 1025 minutes ; null si la chaîne n'est pas un HH:MM valide. */
export function minutesDe(heure: string): number | null {
  const m = RE_HEURE.exec((heure || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Vrai seulement si début et fin sont lisibles ET fin > début. */
export function horaireValide(startTime: string, endTime: string): boolean {
  const debut = minutesDe(startTime);
  const fin = minutesDe(endTime);
  return debut !== null && fin !== null && fin > debut;
}

/** Durée en heures (2 décimales) ; 0 si l'horaire est illisible ou inversé. */
export function dureeCours(startTime: string, endTime: string): number {
  if (!horaireValide(startTime, endTime)) return 0;
  const minutes = minutesDe(endTime)! - minutesDe(startTime)!;
  return Math.round((minutes / 60) * 100) / 100;
}

/** Heures hebdomadaires d'un cours : durée × nombre de jours où il a lieu. */
export function heuresHebdo(c: { startTime: string; endTime: string; jours: string[] }): number {
  return Math.round(dureeCours(c.startTime, c.endTime) * c.jours.length * 100) / 100;
}
