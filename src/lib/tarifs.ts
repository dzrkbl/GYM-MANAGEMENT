// src/lib/tarifs.ts
export const TARIFS = {
  MENSUEL:      { base: 0 },   // à définir plus tard
  TRIMESTRIEL:  { base: 250 },
  ANNUEL:       { base: 790 },
};

export function calculerMontantFinal(params: {
  plan: 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL';
  rabaisFamille: boolean;
  rabaisCustomPct?: number | null;
  prixBase?: number | null;
}): number {
  if (params.plan === 'MENSUEL' && (params.prixBase === undefined || params.prixBase === null)) {
    throw new Error("Prix de base explicite requis pour calculer le montant final d'un plan MENSUEL");
  }

  let prix = params.plan === 'MENSUEL'
    ? params.prixBase!
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
  plan: 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL'
): Date {
  const d = new Date(dateInscription);
  if (plan === 'MENSUEL') {
    d.setMonth(d.getMonth() + 1);
  } else if (plan === 'TRIMESTRIEL') {
    d.setMonth(d.getMonth() + 3);
  } else if (plan === 'ANNUEL') {
    d.setFullYear(d.getFullYear() + 1);
  }
  return d;
}
