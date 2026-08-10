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

export function calculerFinContrat(
  dateInscription: Date | string,
  plan: 'TRIMESTRIEL' | 'ANNUEL'
): Date {
  const d = new Date(dateInscription);
  if (plan === 'TRIMESTRIEL') {
    d.setMonth(d.getMonth() + 3);
  } else if (plan === 'ANNUEL') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}
