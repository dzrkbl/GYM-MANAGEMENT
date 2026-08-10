import { prisma } from './prisma';

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
