// Saison sportive des fédérations : 1er septembre → 31 août.
// Partagé front/back : ne rien importer de Node ici.

// Saison correspondant à une date civile de Montréal (« 2026-2027 »).
export function saisonPourDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const annee = Number(parts.find((p) => p.type === 'year')?.value);
  const mois = Number(parts.find((p) => p.type === 'month')?.value);
  return mois >= 9 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

export function saisonCourante(): string {
  return saisonPourDate(new Date());
}

// Liste de saisons pour les sélecteurs (courante, précédente, suivante).
export function saisonsChoix(): string[] {
  const courante = saisonCourante();
  const debut = Number(courante.split('-')[0]);
  return [`${debut - 1}-${debut}`, courante, `${debut + 1}-${debut + 2}`];
}
