import { prisma } from './prisma';

export const TPS_RATE  = 0.05;
export const TVQ_RATE  = 0.09975;
export const DIVISEUR_TAXES = 1 + TPS_RATE + TVQ_RATE; // 1.14975

// Calcul du loyer pour une année donnée (auto ou override)
export async function getLoyerPourAnnee(annee: number): Promise<number> {
  // 1. Override manuel ?
  const override = await prisma.depense.findFirst({
    where: { configCode: 'LOYER', annee, isOverride: true }
  });
  if (override) return override.montant;

  // 2. Calcul automatique depuis DepenseConfig
  const config = await prisma.depenseConfig.findUnique({ where: { code: 'LOYER' } });
  if (!config) return 0;
  const montant = config.montantBase * Math.pow(1 + config.tauxHaussePct / 100, annee - config.anneeBase);
  return Math.round(montant * 100) / 100;
}

// Masse salariale d'un mois : override MasseSalariale s'il existe, sinon la
// somme de DEUX saisies complémentaires :
//  - les rémunérations des COMPTES du personnel (page Coachs, User.remuneration,
//    $/mois) — là où l'admin saisit naturellement les salaires ;
//  - les lignes « Gérer les coachs » de Rapports (CoachSalaire) — pour les
//    payes SANS compte dans l'app (aide ponctuelle, etc.).
// Ne pas saisir la même personne aux deux endroits (le bloc de Rapports
// affiche les salaires des comptes en lecture seule pour éviter le doublon).
// SOURCE UNIQUE : Dashboard, Module financier et Rapports passent tous par ici.
export async function masseSalarialePourMois(mois: number, annee: number): Promise<number> {
  const override = await prisma.masseSalariale.findFirst({ where: { mois, annee } });
  if (override) return override.montant;
  const [lignes, comptes] = await Promise.all([
    prisma.coachSalaire.aggregate({ _sum: { montant: true }, where: { actif: true } }),
    prisma.user.aggregate({ _sum: { remuneration: true }, where: { actif: true } }),
  ]);
  return (lignes._sum.montant ?? 0) + (comptes._sum.remuneration ?? 0);
}

// Charges de la période (mois + annee)
export async function getChargesPeriode(mois: number, annee: number) {
  // Charges fixes (mois: null = s'applique à tous les mois, ou mois précis)
  const fixes = await prisma.depense.findMany({
    where: {
      annee,
      isOverride: false,
      OR: [{ mois: null }, { mois }]
    }
  });

  // Loyer (auto ou override)
  const loyer = await getLoyerPourAnnee(annee);

  // Masse salariale : source unique (override du mois sinon salaires actifs).
  const masseSalariale = await masseSalarialePourMois(mois, annee);

  const totalFixes = fixes.reduce((acc, d) => acc + d.montant, 0);
  const totalCharges = totalFixes + loyer + masseSalariale;

  return {
    loyer: {
      montant: loyer,
      isOverride: !!(await prisma.depense.findFirst({ where: { configCode: 'LOYER', annee, isOverride: true } }))
    },
    depenses: fixes,
    masseSalariale,
    totalCharges,
  };
}

// Revenus de la période depuis PaymentVersement.
// « En retard » selon le mode :
//  - cumulatif (défaut) : TOUS les impayés échus à ce jour, quelle que soit la
//    période consultée (la dette totale du centre).
//  - période seulement : les échéances DE la période restées impayées et échues.
// Avant, le bouton du Module financier ne changeait rien (le mode était reçu
// puis ignoré), et les retards du mois courant disparaissaient de la case
// rouge parce qu'ils étaient reclassés « en attente ».
export async function getRevenusperiode(
  mois: number,
  annee: number,
  modeCumulatif: boolean = false
) {
  const debut = new Date(annee, mois - 1, 1);
  const fin   = new Date(annee, mois, 0, 23, 59, 59);
  // Jour civil de Montréal : une échéance n'est « échue » que le lendemain.
  const aujourdhuiISO = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const debutAujourdhui = new Date(aujourdhuiISO + 'T00:00:00Z');

  // Encaissé = datePaiement dans la période (identique dans les 2 vues)
  const versementsEncaisses = await prisma.paymentVersement.findMany({
    where: { datePaiement: { gte: debut, lte: fin } },
    include: { member: { include: { sections: true } } }
  });

  // Impayés de la période (membres INACTIF exclus : un départ n'est pas une créance)
  const impayesPeriode = await prisma.paymentVersement.findMany({
    where: {
      datePrevue: { gte: debut, lte: fin },
      datePaiement: null,
      member: { status: { not: 'INACTIF' } },
    }
  });
  // En attente = pas encore échu ; le reste de la période = en retard.
  const versementsAttente = impayesPeriode.filter(v => v.datePrevue >= debutAujourdhui);

  const retardsFiltres = modeCumulatif
    ? await prisma.paymentVersement.findMany({
        where: {
          datePrevue: { lt: debutAujourdhui },
          datePaiement: null,
          member: { status: { not: 'INACTIF' } },
        }
      })
    : impayesPeriode.filter(v => v.datePrevue < debutAujourdhui);

  const encaisse  = versementsEncaisses.reduce((a, v) => a + v.montant, 0);
  const enAttente = versementsAttente.reduce((a, v) => a + v.montant, 0);
  const enRetard  = retardsFiltres.reduce((a, v) => a + v.montant, 0);
  const brut      = encaisse + enAttente;

  const tpsPercue = encaisse / DIVISEUR_TAXES * TPS_RATE;
  const tvqPercue = encaisse / DIVISEUR_TAXES * TVQ_RATE;

  return {
    modeCumulatif,
    brut:             Math.round(brut * 100) / 100,
    encaisse:         Math.round(encaisse * 100) / 100,
    enAttente:        Math.round(enAttente * 100) / 100,
    enRetard:         Math.round(enRetard * 100) / 100,
    tauxRecouvrement: brut > 0 ? Math.round((encaisse / brut) * 10000) / 100 : 0,
    taxes: {
      tpsPercue:    Math.round(tpsPercue * 100) / 100,
      tvqPercue:    Math.round(tvqPercue * 100) / 100,
      totalPercues: Math.round((tpsPercue + tvqPercue) * 100) / 100,
      tpsAPayer:    Math.round(tpsPercue * 100) / 100,
      tvqAPayer:    Math.round(tvqPercue * 100) / 100,
      totalAPayer:  Math.round((tpsPercue + tvqPercue) * 100) / 100,
    },
    detail: versementsEncaisses
  };
}
