// src/lib/tarifs.ts
// Seules deux formules existent : trimestrielle et annuelle.
export const TARIFS = {
  TRIMESTRIEL:  { base: 250 },
  ANNUEL:       { base: 790 },
};

export function calculerMontantFinal(params: {
  plan: 'TRIMESTRIEL' | 'ANNUEL';
  rabaisFamille: boolean;
  rabaisCustomPct?: number | null;
  prixBase?: number | null;
}): number {
  let prix = (params.prixBase !== undefined && params.prixBase !== null)
    ? params.prixBase
    : (TARIFS[params.plan]?.base ?? 0);

  if (params.rabaisFamille) {
    prix = prix * 0.90; // -10%
  }
  if (params.rabaisCustomPct) {
    prix = prix * (1 - params.rabaisCustomPct / 100);
  }
  return Math.round(prix * 100) / 100;
}

// Ajoute des mois à une date « AAAA-MM-JJ » par simple arithmétique de
// composantes : aucun fuseau horaire en jeu, et le débordement de fin de mois
// est bloqué (31 janv. + 1 mois = 28/29 févr., pas le 3 mars). Indispensable :
// `new Date('AAAA-MM-JJ')` est minuit UTC (= la veille au soir à Montréal) et
// `setMonth` travaille en heure locale — la combinaison décalait les échéances
// d'un jour, voire d'un mois entier.
export function ajouterMoisISO(dateISO: string, mois: number): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  const total = (m - 1) + mois;
  const annee = y + Math.floor(total / 12);
  const moisIdx = ((total % 12) + 12) % 12;
  const dernierJour = new Date(Date.UTC(annee, moisIdx + 1, 0)).getUTCDate();
  const jour = Math.min(d, dernierJour);
  return `${annee}-${String(moisIdx + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// Interprète une date « AAAA-MM-JJ » à midi UTC : le même jour civil à Montréal
// comme sur le serveur, au lieu de minuit UTC (= 20 h la veille à Montréal).
export function dateAMidi(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? new Date(m[1] + 'T12:00:00Z') : new Date(value);
}

export function calculerFinContrat(
  dateInscription: Date | string,
  plan: 'TRIMESTRIEL' | 'ANNUEL'
): Date {
  const iso = typeof dateInscription === 'string'
    ? dateInscription.slice(0, 10)
    : dateInscription.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(dateInscription);
  return dateAMidi(ajouterMoisISO(iso, plan === 'TRIMESTRIEL' ? 3 : 12));
}
