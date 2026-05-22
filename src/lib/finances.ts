import { prisma } from './prisma';

const TPS_RATE  = 0.05;
const TVQ_RATE  = 0.09975;
const DIVISEUR_TAXES = 1 + TPS_RATE + TVQ_RATE; // 1.14975

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

  // Masse salariale : override MasseSalariale ou somme CoachSalaire
  const masseSalarialeOverride = await prisma.masseSalariale.findFirst({
    where: { mois, annee }
  });
  const masseSalariale = masseSalarialeOverride
    ? masseSalarialeOverride.montant
    : (await prisma.coachSalaire.aggregate({ _sum: { montant: true }, where: { actif: true } }))._sum.montant ?? 0;

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

// Revenus de la période depuis PaymentVersement
export async function getRevenusperiode(mois: number, annee: number) {
  const debut = new Date(annee, mois - 1, 1);
  const fin   = new Date(annee, mois, 0, 23, 59, 59);

  // Encaissé = datePaiement dans la période
  const versementsEncaisses = await prisma.paymentVersement.findMany({
    where: { datePaiement: { gte: debut, lte: fin } },
    include: { member: { include: { sections: true } } }
  });

  // En attente = datePrevue dans la période, sans datePaiement
  const versementsAttente = await prisma.paymentVersement.findMany({
    where: { datePrevue: { gte: debut, lte: fin }, datePaiement: null }
  });

  // En retard = datePrevue passée, sans datePaiement
  const versementsRetard = await prisma.paymentVersement.findMany({
    where: { datePrevue: { lt: new Date() }, datePaiement: null }
  });

  const encaisse = versementsEncaisses.reduce((a, v) => a + v.montant, 0);
  const enAttente = versementsAttente.reduce((a, v) => a + v.montant, 0);
  const enRetard  = versementsRetard.reduce((a, v) => a + v.montant, 0);
  const brut = encaisse + enAttente;

  const tpsPercue  = encaisse / DIVISEUR_TAXES * TPS_RATE;
  const tvqPercue  = encaisse / DIVISEUR_TAXES * TVQ_RATE;

  return {
    brut:               Math.round(brut * 100) / 100,
    encaisse:           Math.round(encaisse * 100) / 100,
    enAttente:          Math.round(enAttente * 100) / 100,
    enRetard:           Math.round(enRetard * 100) / 100,
    tauxRecouvrement:   brut > 0 ? Math.round((encaisse / brut) * 10000) / 100 : 0,
    taxes: {
      tpsPercue:        Math.round(tpsPercue * 100) / 100,
      tvqPercue:        Math.round(tvqPercue * 100) / 100,
      totalPercues:     Math.round((tpsPercue + tvqPercue) * 100) / 100,
      tpsAPayer:        Math.round(tpsPercue * 100) / 100,
      tvqAPayer:        Math.round(tvqPercue * 100) / 100,
      totalAPayer:      Math.round((tpsPercue + tvqPercue) * 100) / 100,
    },
    detail: versementsEncaisses
  };
}
