export function formatMontant(amount: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

export function formatDateLocal(
  dateInput: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
  locale: string = 'fr-CA'
): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(year, month, day).toLocaleDateString(locale, options);
}

export function formatDate(dateString: string | Date | null | undefined): string {
  return formatDateLocal(dateString);
}

/**
 * Date du jour en AAAA-MM-JJ, en heure LOCALE.
 * À utiliser à la place de `new Date().toISOString().split('T')[0]` : après
 * 20 h à Montréal, la version UTC donne la date de DEMAIN (paiements datés du
 * mauvais jour, échéances « en retard » un jour trop tôt, etc.).
 */
export function todayLocalISO(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * Compare une échéance (ISO ou Date) à aujourd'hui en ne comparant que les
 * dates civiles (AAAA-MM-JJ), sans effet de fuseau horaire.
 * Retourne un nombre négatif si l'échéance est passée, 0 si c'est aujourd'hui.
 */
export function joursAvantEcheance(datePrevue: string | Date): number {
  const iso = typeof datePrevue === 'string' ? datePrevue.slice(0, 10) : datePrevue.toISOString().slice(0, 10);
  const [y, m, j] = iso.split('-').map(Number);
  const echeance = new Date(y, m - 1, j);
  const [ty, tm, tj] = todayLocalISO().split('-').map(Number);
  const aujourdhui = new Date(ty, tm - 1, tj);
  return Math.round((echeance.getTime() - aujourdhui.getTime()) / 86_400_000);
}