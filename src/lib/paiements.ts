import { prisma } from './prisma';

// Frais de retard (règlement, art. 6) : 10 $ par semaine après une semaine de
// retard. Calculés dynamiquement (jamais stockés) ; l'admin peut exonérer un
// versement (`exonererFraisRetard`).
export const FRAIS_RETARD_PAR_SEMAINE = 10;
export const DELAI_GRACE_JOURS = 7;

export function fraisRetard(
  v: { datePrevue: Date; datePaiement: Date | null; exonererFraisRetard?: boolean },
  now = new Date()
): number {
  if (v.exonererFraisRetard) return 0;
  const fin = v.datePaiement ?? now;
  const joursRetard = Math.floor((fin.getTime() - v.datePrevue.getTime()) / 86_400_000);
  if (joursRetard <= DELAI_GRACE_JOURS) return 0;
  return Math.floor(joursRetard / 7) * FRAIS_RETARD_PAR_SEMAINE;
}

/**
 * Un membre EN_ATTENTE (inscription en ligne) devient ACTIF dès son premier
 * paiement enregistré — c'est la règle du centre : l'inscription est confirmée
 * par le paiement. Silencieux si le membre est déjà actif ou inactif.
 */
export async function activerSiPremierPaiement(membreId: string): Promise<boolean> {
  const resultat = await prisma.member.updateMany({
    where: { id: membreId, status: 'EN_ATTENTE' },
    data: { status: 'ACTIF' },
  });
  return resultat.count > 0;
}

// Normalisation des méthodes de paiement.
// Le frontend envoie des libellés variés (COMPTANT, INTERAC, CHÈQUE…) ; on les
// ramène aux valeurs canoniques de l'enum Prisma `MethodePaiement`.

export type MethodePaiementValue = 'CASH' | 'VIREMENT' | 'CHEQUE' | 'CARTE';

export function normalizeMethodePaiement(input?: string | null): MethodePaiementValue | null {
  if (!input) return null;
  const v = String(input).toUpperCase().trim();
  switch (v) {
    case 'COMPTANT':
    case 'CASH':
      return 'CASH';
    case 'VIREMENT':
    case 'TRANSFER':
    case 'INTERAC':
      return 'VIREMENT';
    case 'CHEQUE':
    case 'CHÈQUE':
      return 'CHEQUE';
    case 'CARTE':
    case 'CARD':
      return 'CARTE';
    default:
      return null;
  }
}
