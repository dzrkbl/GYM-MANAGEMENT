/**
 * Regroupement de dates par période, ancré sur le jour civil de MONTRÉAL.
 *
 * Le serveur tourne en UTC : `date.getMonth()` sur une inscription du
 * 31 août à 20 h heure de Montréal renvoie septembre, et le membre bascule
 * dans le mauvais mois. Toutes les clés passent donc par le fuseau du club,
 * jamais par l'heure locale du processus.
 */

/** Jour civil de Montréal, « AAAA-MM-JJ ». */
export function jourMontreal(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Clé de mois, « AAAA-MM ». */
export function cleMois(d: Date): string {
  return jourMontreal(d).slice(0, 7);
}

/** Clé de trimestre, « AAAA-T1 ». */
export function cleTrimestre(d: Date): string {
  const [a, m] = jourMontreal(d).split('-').map(Number);
  return `${a}-T${Math.ceil(m / 3)}`;
}

/**
 * Clé de semaine ISO 8601, « AAAA-S07 ».
 *
 * La semaine ISO appartient à l'année de son JEUDI : le 1er janvier peut donc
 * relever de la semaine 52 de l'année précédente. Un calcul naïf basé sur le
 * quantième du mois produit la même clé pour des semaines de mois différents,
 * ce qui fusionne silencieusement des périodes sans rapport.
 */
export function cleSemaineIso(d: Date): string {
  const [a, m, j] = jourMontreal(d).split('-').map(Number);
  const date = new Date(Date.UTC(a, m - 1, j));

  // Se placer sur le jeudi de la semaine courante (lundi = 0).
  const jourSemaine = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - jourSemaine + 3);
  const anneeIso = date.getUTCFullYear();

  // Le 4 janvier tombe toujours dans la semaine 1 : son jeudi est la référence.
  const jeudiRef = new Date(Date.UTC(anneeIso, 0, 4));
  jeudiRef.setUTCDate(jeudiRef.getUTCDate() - ((jeudiRef.getUTCDay() + 6) % 7) + 3);

  const semaine = 1 + Math.round((date.getTime() - jeudiRef.getTime()) / (7 * 86_400_000));
  return `${anneeIso}-S${String(semaine).padStart(2, '0')}`;
}

export type Granularite = 'semaine' | 'mois' | 'trimestre';

/** Clé de regroupement selon la granularité demandée. */
export function clePeriode(d: Date, granularite: Granularite): string {
  if (granularite === 'semaine') return cleSemaineIso(d);
  if (granularite === 'trimestre') return cleTrimestre(d);
  return cleMois(d);
}

/** Début de fenêtre : `mois` mois en arrière, au premier jour du mois. */
export function debutFenetre(mois: number, maintenant = new Date()): Date {
  const [a, m] = jourMontreal(maintenant).split('-').map(Number);
  // Ancré à midi UTC comme partout ailleurs (voir `dateAMidi`) : jamais de
  // bascule de jour selon le fuseau du lecteur.
  return new Date(Date.UTC(a, m - 1 - mois, 1, 12));
}
