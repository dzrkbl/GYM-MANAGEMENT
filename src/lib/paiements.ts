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
