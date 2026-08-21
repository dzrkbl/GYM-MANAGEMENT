import { joursAvantEcheance } from './format';

// État de paiement d'un membre, en tenant compte de la FIN DE CONTRAT.
// Un membre qui a soldé son échéancier n'est « à jour » que si son contrat
// court toujours : une fois la date de fin passée, le renouvellement est dû
// (c'est la date d'inscription qui déclenche le paiement suivant).

export interface EtatPaiement {
  type:
    | 'GRATUIT'
    | 'RETARD'               // versement planifié impayé et dépassé
    | 'RENOUVELLEMENT_DU'    // contrat terminé, rien d'impayé : le renouvellement est à percevoir
    | 'ECHEANCE_PROCHE'      // prochain versement planifié à venir
    | 'RESTE_SANS_ECHEANCE'  // solde restant sans aucun versement planifié
    | 'RENOUVELLEMENT_PROCHE'// soldé, mais le contrat se termine bientôt
    | 'A_JOUR';
  montant?: number; // versement concerné, ou montant du contrat pour un renouvellement
  date?: string;    // échéance du versement ou date de fin de contrat
  jours?: number;   // jours avant l'échéance (négatif = dépassée)
  reste?: number;   // solde restant (RESTE_SANS_ECHEANCE)
  autres?: number;  // nombre d'autres versements impayés
}

interface MembreEcheances {
  status?: string;
  montantFinal?: number | null;
  finContrat?: string | null;
  versements?: { montant: number; datePrevue: string; datePaiement: string | null }[];
}

export function etatPaiement(member: MembreEcheances, horizonRenouvellement = 30): EtatPaiement {
  const versements = member.versements || [];
  const montantFinal = member.montantFinal || 0;

  const totalPaye = versements
    .filter((v) => v.datePaiement)
    .reduce((sum, v) => sum + (v.montant || 0), 0);
  const reste = Math.round((montantFinal - totalPaye) * 100) / 100;

  const impayes = versements
    .filter((v) => !v.datePaiement && v.montant > 0)
    .sort((a, b) => a.datePrevue.localeCompare(b.datePrevue));
  const autres = Math.max(0, impayes.length - 1);

  // Le renouvellement ne concerne que les membres actifs sous contrat.
  const joursFin =
    member.status === 'ACTIF' && member.finContrat ? joursAvantEcheance(member.finContrat) : null;

  if (montantFinal <= 0 && impayes.length === 0) return { type: 'GRATUIT' };

  const enRetard = impayes.find((v) => joursAvantEcheance(v.datePrevue) < 0);
  if (enRetard) {
    return {
      type: 'RETARD',
      montant: enRetard.montant,
      date: enRetard.datePrevue,
      jours: joursAvantEcheance(enRetard.datePrevue),
      autres,
    };
  }

  if (joursFin !== null && joursFin < 0) {
    return {
      type: 'RENOUVELLEMENT_DU',
      date: member.finContrat!,
      jours: joursFin,
      montant: montantFinal > 0 ? montantFinal : undefined,
      // Solde impayé de l'ancien contrat, à percevoir en plus du renouvellement.
      reste: reste > 0 ? reste : undefined,
    };
  }

  if (impayes.length > 0) {
    const prochain = impayes[0];
    return {
      type: 'ECHEANCE_PROCHE',
      montant: prochain.montant,
      date: prochain.datePrevue,
      jours: joursAvantEcheance(prochain.datePrevue),
      autres,
    };
  }

  if (reste > 0) return { type: 'RESTE_SANS_ECHEANCE', reste };

  if (joursFin !== null && joursFin <= horizonRenouvellement) {
    return {
      type: 'RENOUVELLEMENT_PROCHE',
      date: member.finContrat!,
      jours: joursFin,
      montant: montantFinal > 0 ? montantFinal : undefined,
    };
  }

  return { type: 'A_JOUR' };
}
