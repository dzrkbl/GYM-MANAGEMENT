import { prisma } from './prisma';
import { heuresCoachsPourMois, estMoisEcoule } from './paieCoachs';

export const TPS_RATE  = 0.05;
export const TVQ_RATE  = 0.09975;
export const DIVISEUR_TAXES = 1 + TPS_RATE + TVQ_RATE; // 1.14975

/**
 * LES DEUX BASES DE COMPARAISON
 *
 * Tout montant saisi dans l'application est TAXES INCLUSES : les 790 $ que
 * paie un parent, les 5 660 $ du loyer. Deux lectures cohérentes existent, et
 * la règle absolue est de ne JAMAIS les mélanger dans un même calcul :
 *
 *  - « net »  : ce qui reste vraiment. Revenus et charges taxables ramenés
 *               hors taxes. C'est le VRAI bénéfice, celui qui dit si le club
 *               gagne de l'argent.
 *  - « brut » : les mouvements d'argent tels qu'ils passent au compte. Utile
 *               pour la trésorerie, mais il compte comme revenu les taxes
 *               perçues, qui appartiennent à Revenu Québec.
 *
 * L'écart entre les deux N'EST PAS un choix d'affichage : il vaut exactement
 * la REMISE de taxes (TPS/TVQ perçues − crédits sur les intrants). C'est
 * pourquoi les deux vues affichent toujours cette remise en clair.
 */
export type BaseFinanciere = 'net' | 'brut';

const arrondir = (m: number) => Math.round(m * 100) / 100;
/** Montant hors taxes, à partir d'un montant taxes incluses. */
export const sansTaxes = (m: number) => arrondir(m / DIVISEUR_TAXES);
/** Part de taxes contenue dans un montant taxes incluses. */
export const partTaxes = (m: number) => arrondir(m - m / DIVISEUR_TAXES);
/** Convertit un montant taxes incluses vers la base demandée. */
export const versBase = (m: number, base: BaseFinanciere) => (base === 'net' ? sansTaxes(m) : arrondir(m));

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
//  - les COMPTES du personnel (page Coachs) : un compte avec un TAUX HORAIRE
//    est payé à l'heure — séances tenues × durée × taux pour un mois écoulé,
//    séances prévues au calendrier pour le mois courant et les suivants (la
//    charge attendue, cohérente avec le loyer compté plein) ; un compte sans
//    taux garde sa rémunération forfaitaire ($/mois) telle quelle ;
//  - les lignes « Gérer les coachs » de Rapports (CoachSalaire) — pour les
//    payes SANS compte dans l'app (aide ponctuelle, etc.).
// Ne pas saisir la même personne aux deux endroits (le bloc de Rapports
// affiche les salaires des comptes en lecture seule pour éviter le doublon) —
// et à la création d'un compte à taux, RETIRER sa ligne forfaitaire.
// SOURCE UNIQUE : Dashboard, Module financier et Rapports passent tous par ici.
export async function masseSalarialePourMois(mois: number, annee: number): Promise<number> {
  const override = await prisma.masseSalariale.findFirst({ where: { mois, annee } });
  if (override) return override.montant;
  const [lignes, comptes] = await Promise.all([
    prisma.coachSalaire.aggregate({ _sum: { montant: true }, where: { actif: true } }),
    prisma.user.findMany({ where: { actif: true }, select: { id: true, remuneration: true, tauxHoraire: true } }),
  ]);
  let totalComptes = 0;
  if (comptes.some((c) => c.tauxHoraire !== null)) {
    const heures = await heuresCoachsPourMois(mois, annee);
    const ecoule = estMoisEcoule(mois, annee);
    for (const c of comptes) {
      if (c.tauxHoraire !== null) {
        const h = heures.get(c.id);
        totalComptes += (ecoule ? h?.heuresTenues ?? 0 : h?.heuresPrevues ?? 0) * c.tauxHoraire;
      } else {
        totalComptes += c.remuneration ?? 0;
      }
    }
  } else {
    // Aucun taux saisi : strictement l'ancien calcul, sans requête de plus.
    totalComptes = comptes.reduce((a, c) => a + (c.remuneration ?? 0), 0);
  }
  return arrondir((lignes._sum.montant ?? 0) + totalComptes);
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

  const configLoyer = await prisma.depenseConfig.findUnique({ where: { code: 'LOYER' } });
  const loyerTaxable = configLoyer?.taxable ?? true;

  const totalFixes = fixes.reduce((acc, d) => acc + d.montant, 0);
  const totalCharges = arrondir(totalFixes + loyer + masseSalariale);

  // Crédits de taxe sur les intrants : uniquement sur les charges taxables.
  // La masse salariale ne porte aucune taxe, les assurances en sont exonérées.
  const creditsIntrants = arrondir(
    fixes.filter((d) => d.taxable).reduce((acc, d) => acc + partTaxes(d.montant), 0)
    + (loyerTaxable ? partTaxes(loyer) : 0)
  );
  // Total NET : on ne retire la taxe QUE là où elle est récupérable.
  const totalChargesNet = arrondir(totalCharges - creditsIntrants);

  return {
    loyer: {
      montant: loyer,
      taxable: loyerTaxable,
      isOverride: !!(await prisma.depense.findFirst({ where: { configCode: 'LOYER', annee, isOverride: true } }))
    },
    depenses: fixes,
    masseSalariale,
    totalCharges,        // taxes incluses (base « brut »)
    totalChargesNet,     // hors taxes récupérables (base « net »)
    creditsIntrants,
  };
}

/**
 * Le résultat d'une période, calculé DANS UNE SEULE BASE.
 * Les deux membres de la soustraction sont convertis de la même façon : c'est
 * tout l'enjeu, et c'est ce qui manquait auparavant (revenus nets moins
 * charges taxes incluses).
 */
export function calculerResultat(
  encaisseBrut: number,
  charges: { totalCharges: number; totalChargesNet: number; creditsIntrants: number },
  base: BaseFinanciere
) {
  const revenus = base === 'net' ? sansTaxes(encaisseBrut) : arrondir(encaisseBrut);
  const chargesBase = base === 'net' ? charges.totalChargesNet : charges.totalCharges;
  const marge = arrondir(revenus - chargesBase);
  const taxesPercues = partTaxes(encaisseBrut);

  return {
    base,
    revenus,
    charges: chargesBase,
    marge,
    margePct: revenus > 0 ? Math.round((marge / revenus) * 1000) / 10 : 0,
    statut: marge >= 0 ? 'POSITIF' : 'DEFICIT',
    // Toujours affiché, quelle que soit la base : c'est exactement l'écart
    // entre les deux lectures, et c'est une sortie d'argent bien réelle.
    taxes: {
      percues: taxesPercues,
      creditsIntrants: charges.creditsIntrants,
      remiseARevenuQuebec: arrondir(taxesPercues - charges.creditsIntrants),
    },
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
