import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
// SOURCE UNIQUE des taxes : `DIVISEUR_TAXES` était auparavant redéclaré en dur
// ici, en doublon de la constante partagée — deux vérités pour un même taux.
import {
  DIVISEUR_TAXES, getRevenusperiode, getChargesPeriode, masseSalarialePourMois,
  getLoyerPourAnnee, calculerResultat, sansTaxes, partTaxes, type BaseFinanciere,
} from '../lib/finances';

const router = Router();

// GET /api/rapports/export-csv
router.get('/export-csv', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { from, to, type } = req.query;
    if (!from || !to || !type) return sendError(res, 'Paramètres manquants', 400);

    const startDate = new Date(from as string);
    const endDate = new Date(to as string);
    endDate.setHours(23, 59, 59, 999);

    if (type === 'PAIEMENTS') {
      const versements = await prisma.paymentVersement.findMany({
        where: {
          OR: [
            { datePaiement: { gte: startDate, lte: endDate } },
            { datePrevue: { gte: startDate, lte: endDate } }
          ]
        },
        include: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              sections: { select: { section: true } }
            }
          }
        },
        orderBy: { datePrevue: 'asc' }
      });

      const today = new Date();
      // Mapper les versements pour simuler l'ancien format attendu par l'export CSV ou le front
      const mapped = versements.map(v => {
        let computedStatus: string;
        if (v.datePaiement) {
          computedStatus = 'PAYÉ';
        } else if (v.datePrevue && v.datePrevue < today) {
          computedStatus = 'EN_RETARD';
        } else {
          computedStatus = 'EN_ATTENTE';
        }

        return {
          id: v.id,
          amount: v.montant,
          status: computedStatus,
          dueDate: v.datePrevue,
          paidDate: v.datePaiement,
          member: v.member,
          subscription: {
            section: v.member.sections?.[0]?.section || 'INCONNU'
          }
        };
      });

      return sendSuccess(res, mapped);
    } 
    
    if (type === 'PRESENCES') {
      const attendances = await prisma.attendance.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: {
          member: { select: { firstName: true, lastName: true } },
          course: { select: { section: true } }
        },
        orderBy: { date: 'asc' }
      });
      return sendSuccess(res, attendances);
    }

    return res.status(400).json({ error: 'Type de rapport inconnu' });
  } catch (error) {
    return sendError(res, 'Erreur lors de l\'export', 500);
  }
});

// GET /api/rapports/rentabilite — hypothèse « effectif constant » :
// si les membres ACTIFS d'aujourd'hui restent et renouvellent aux mêmes
// conditions, le club est-il rentable sur un an ?
//  - Revenu annualisé : ANNUEL = montantFinal ; TRIMESTRIEL = ×4 (MENSUEL ×12,
//    fossile). Ramené NET de taxes (prix taxes incluses → ÷ 1,14975).
//  - Charges : (masse salariale + loyer + charges récurrentes) du mois courant
//    × 12, plus les dépenses ponctuelles des 12 derniers mois (indicatif).
//  - Ventes d'équipement, affiliations et frais fédération : EXCLUS (pas des
//    revenus de cotisations ; marge équipement marginale).
router.get('/rentabilite', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  try {
    const isoAuj = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
    const annee = Number(isoAuj.slice(0, 4));
    const mois = Number(isoAuj.slice(5, 7));

    const [sections, membres] = await Promise.all([
      prisma.section.findMany(),
      prisma.member.findMany({
        where: { status: 'ACTIF' },
        select: { firstName: true, lastName: true, plan: true, montantFinal: true, sections: { select: { section: true } } },
      }),
    ]);
    const sportDe = new Map(sections.map((s) => [s.code, (s.sport || 'AUTRE').toUpperCase()]));

    let revenuAnnuelBrut = 0;
    const parSport = new Map<string, { sport: string; membres: number; revenuAnnuelBrut: number }>();
    const sansContrat: string[] = [];
    for (const m of membres) {
      const mf = m.montantFinal || 0;
      const annuel = m.plan === 'ANNUEL' ? mf : m.plan === 'TRIMESTRIEL' ? mf * 4 : m.plan === 'MENSUEL' ? mf * 12 : 0;
      if (annuel <= 0) {
        sansContrat.push(`${m.firstName} ${m.lastName}`);
        continue;
      }
      revenuAnnuelBrut += annuel;
      const sport = sportDe.get(m.sections[0]?.section || '') || 'AUTRE';
      const e = parSport.get(sport) || { sport, membres: 0, revenuAnnuelBrut: 0 };
      e.membres += 1;
      e.revenuAnnuelBrut += annuel;
      parSport.set(sport, e);
    }
    revenuAnnuelBrut = Math.round(revenuAnnuelBrut * 100) / 100;
    const revenuAnnuelNet = sansTaxes(revenuAnnuelBrut);
    const base: BaseFinanciere = _req.query.base === 'brut' ? 'brut' : 'net';

    const masseSalarialeMensuelle = await masseSalarialePourMois(mois, annee);
    const loyerMensuel = await getLoyerPourAnnee(annee);
    const configLoyer = await prisma.depenseConfig.findUnique({ where: { code: 'LOYER' } });
    const recurrentes = await prisma.depense.findMany({ where: { annee, mois: null, isOverride: false } });
    const depensesRecurrentesMensuelles = Math.round(recurrentes.reduce((a, d) => a + d.montant, 0) * 100) / 100;
    const chargesMensuelles = Math.round((masseSalarialeMensuelle + loyerMensuel + depensesRecurrentesMensuelles) * 100) / 100;
    const chargesAnnuelles = Math.round(chargesMensuelles * 12 * 100) / 100;

    // Crédits sur les intrants : seulement sur les charges taxables (jamais
    // les salaires, jamais les assurances).
    const creditsMensuels = Math.round((
      recurrentes.filter((d) => d.taxable).reduce((a, d) => a + partTaxes(d.montant), 0)
      + ((configLoyer?.taxable ?? true) ? partTaxes(loyerMensuel) : 0)
    ) * 100) / 100;
    const chargesAnnuellesNet = Math.round((chargesAnnuelles - creditsMensuels * 12) * 100) / 100;

    // Dépenses ponctuelles des 12 derniers mois (fenêtre glissante).
    const cle = (a: number, m: number) => a * 12 + m;
    const ponctuelles = await prisma.depense.findMany({ where: { mois: { not: null }, isOverride: false } });
    const ponctuelles12Mois = Math.round(
      ponctuelles
        .filter((d) => d.mois !== null && cle(d.annee, d.mois) > cle(annee, mois) - 12 && cle(d.annee, d.mois) <= cle(annee, mois))
        .reduce((a, d) => a + d.montant, 0) * 100
    ) / 100;

    // Les DEUX membres de chaque soustraction sont dans la même base.
    const revenusBase = base === 'net' ? revenuAnnuelNet : revenuAnnuelBrut;
    const chargesBase = base === 'net' ? chargesAnnuellesNet : chargesAnnuelles;
    const resultatRecurrent = Math.round((revenusBase - chargesBase) * 100) / 100;
    const resultatPrudent = Math.round((resultatRecurrent - ponctuelles12Mois) * 100) / 100;
    const membresPayants = membres.length - sansContrat.length;
    const revenuMoyenParMembre = membresPayants > 0 ? Math.round((revenusBase / membresPayants) * 100) / 100 : 0;
    // Seuil de rentabilité : numérateur et dénominateur dans la même base.
    const membresNecessaires = revenuMoyenParMembre > 0
      ? Math.ceil((chargesBase + ponctuelles12Mois) / revenuMoyenParMembre)
      : null;

    return sendSuccess(res, {
      calculeLe: isoAuj,
      membresActifs: membres.length,
      membresPayants,
      sansContrat,
      revenuAnnuelBrut,
      revenuAnnuelNet,
      parSport: [...parSport.values()].sort((a, b) => b.revenuAnnuelBrut - a.revenuAnnuelBrut),
      masseSalarialeMensuelle,
      loyerMensuel,
      depensesRecurrentesMensuelles,
      chargesMensuelles,
      chargesAnnuelles,
      chargesAnnuellesNet,
      creditsIntrantsAnnuels: Math.round(creditsMensuels * 12 * 100) / 100,
      ponctuelles12Mois,
      base,
      revenusBase,
      chargesBase,
      resultatRecurrent,
      resultatPrudent,
      margePct: revenusBase > 0 ? Math.round((resultatPrudent / revenusBase) * 1000) / 10 : 0,
      revenuMoyenParMembre,
      // Conservé sous son ancien nom : la page Finances l'affiche encore.
      revenuMoyenNetParMembre: membresPayants > 0 ? Math.round((revenuAnnuelNet / membresPayants) * 100) / 100 : 0,
      membresNecessaires,
    });
  } catch (error) {
    console.error('Error in GET /api/rapports/rentabilite:', error);
    return sendError(res, "Erreur du calcul de rentabilité", 500);
  }
});

router.get('/financier', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { from, to, mois, annee } = req.query;
    
    if (!from && !to && (mois || annee)) {
      const parsedMois  = parseInt(mois as string, 10) || new Date().getMonth() + 1;
      const parsedAnnee = parseInt(annee as string, 10) || new Date().getFullYear();
      const modeCumulatif = req.query.cumul === 'true';

      const [revenus, charges] = await Promise.all([
        getRevenusperiode(parsedMois, parsedAnnee, modeCumulatif),
        getChargesPeriode(parsedMois, parsedAnnee),
      ]);

      // Une SEULE base pour les deux membres de la soustraction (?base=net|brut).
      const base: BaseFinanciere = req.query.base === 'brut' ? 'brut' : 'net';
      const resultat = calculerResultat(revenus.encaisse, charges, base);

      return sendSuccess(res, {
        periode: { mois: parsedMois, annee: parsedAnnee },
        revenus,
        charges,
        resultat,
        // L'autre lecture, pour que le basculement soit instantané et que
        // l'écart entre les deux reste vérifiable d'un coup d'œil.
        resultatAutreBase: calculerResultat(revenus.encaisse, charges, base === 'net' ? 'brut' : 'net'),
      });
    }
    
    if (!from || !to) {
      return sendError(res, 'Les dates from et to (ou mois et annee) sont requises', 400);
    }
    
    const startDate = new Date(from as string);
    const endDate = new Date(to as string);
    endDate.setHours(23, 59, 59, 999);
    // Jour civil de Montréal : « échu » = le jour d'échéance est entièrement passé.
    const aujourdhuiISO = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
    const debutAujourdhui = new Date(aujourdhuiISO + 'T00:00:00Z');

    // 1. Revenus de la période.
    //    - Encaissé = payé PENDANT la période (datePaiement). Un versement payé
    //      en juillet pour une échéance d'août ne compte que dans juillet —
    //      avant, il comptait dans LES DEUX rapports (double comptage) et la
    //      somme des 12 mois ne retombait jamais sur le rapport annuel.
    //    - En attente / en retard = échéances DE la période encore impayées
    //      (membres INACTIF exclus : un départ n'est pas une créance).
    const versements = await prisma.paymentVersement.findMany({
      where: {
        OR: [
          { datePaiement: { gte: startDate, lte: endDate } },
          { datePrevue: { gte: startDate, lte: endDate } }
        ]
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            sections: { select: { section: true } }
          }
        }
      }
    });

    let encaisse = 0, enAttente = 0, enRetard = 0;
    const sectionStats: Record<string, {
      encaisse: number;
      enAttente: number;
      enRetard: number;
      membres: Set<string>;
    }> = {};

    versements.forEach(v => {
      const s = v.member.sections?.[0]?.section || 'INCONNU';
      const paidInPeriod = !!v.datePaiement && v.datePaiement >= startDate && v.datePaiement <= endDate;
      const dueInPeriod = !!v.datePrevue && v.datePrevue >= startDate && v.datePrevue <= endDate;
      const isLate = !v.datePaiement && v.datePrevue && v.datePrevue < debutAujourdhui;

      if (!sectionStats[s]) {
        sectionStats[s] = {
          encaisse: 0,
          enAttente: 0,
          enRetard: 0,
          membres: new Set<string>()
        };
      }

      if (v.member.id) {
        sectionStats[s].membres.add(v.member.id);
      }

      if (paidInPeriod) {
        encaisse += v.montant;
        sectionStats[s].encaisse += v.montant;
      } else if (!v.datePaiement && dueInPeriod && v.member.status !== 'INACTIF') {
        if (isLate) {
          enRetard += v.montant;
          sectionStats[s].enRetard += v.montant;
        } else {
          enAttente += v.montant;
          sectionStats[s].enAttente += v.montant;
        }
      }
      // Payé hors période (mais dû dedans) : déjà compté dans le rapport du
      // mois où l'argent est entré — rien à ajouter ici.
    });

    const total = encaisse + enAttente + enRetard;
    
    // Récupérer les libellés de section réels depuis la base de données
    const dbSections = await prisma.section.findMany({
      where: { actif: true }
    });
    
    const sectionLabels: Record<string, string> = {};
    dbSections.forEach(s => {
      sectionLabels[s.code] = s.label;
    });

    const parSection = Object.entries(sectionStats).map(([section, stats]) => {
      const label = sectionLabels[section] || section;
      const montantTotal = stats.encaisse + stats.enAttente + stats.enRetard;
      return {
        section,
        label,
        montantTotal,
        encaisse: stats.encaisse,
        enAttente: stats.enAttente,
        enRetard: stats.enRetard,
        pourcentage: total > 0 ? (montantTotal / total) * 100 : 0,
        nbMembres: stats.membres.size
      };
    });

    // 2. Présences
    const attendances = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate }
      },
      include: {
        course: { select: { section: true } }
      }
    });

    // Sections réellement présentes dans les données de la période (plus de liste figée).
    // Taux = pointages / (séances tenues × effectif actif de la section) — la
    // même définition que le tableau de bord. L'ancien calcul (PRESENT / total
    // des pointages) affichait TOUJOURS 100 % puisque seuls les présents sont
    // pointés, jamais les absents.
    const effectifs = await prisma.memberSection.groupBy({
      by: ['section'],
      where: { member: { status: 'ACTIF' } },
      _count: { _all: true },
    });
    const effectifDe = (sec: string) => effectifs.find(e => e.section === sec)?._count._all || 0;

    const sectionsPres = Array.from(
      new Set(attendances.map(a => a.course?.section).filter((s): s is string => !!s))
    );
    const presencesList = sectionsPres.map(sec => {
      const secAtts = attendances.filter(a => a.course?.section === sec);
      const presents = secAtts.length;
      const seances = new Set(secAtts.map(a => `${a.courseId}_${a.date.toISOString().slice(0, 10)}`)).size;
      const possibles = seances * Math.max(effectifDe(sec), 1);
      return {
        section: sec,
        taux: possibles > 0 ? Math.min(100, (presents / possibles) * 100) : 0,
        presents,
        total: possibles,
        seances
      };
    }).filter(p => p.presents > 0);

    // 3. Masse salariale : MÊME source que le Module financier (override du mois
    //    sinon « Gérer les coachs »), sommée sur les mois de la période DÉJÀ
    //    écoulés — comparer 12 mois de salaires aux revenus de 8 mois donnait
    //    des « 148 % des revenus » absurdes en cours d'année.
    let masseSalarialeMontant = 0;
    let moisComptes = 0;
    {
      const [ay, am] = aujourdhuiISO.split('-').map(Number);
      const cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
      const finPeriode = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
      const moisCourant = new Date(Date.UTC(ay, am - 1, 1));
      while (cur <= finPeriode && cur <= moisCourant) {
        masseSalarialeMontant += await masseSalarialePourMois(cur.getUTCMonth() + 1, cur.getUTCFullYear());
        moisComptes++;
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
      masseSalarialeMontant = Math.round(masseSalarialeMontant * 100) / 100;
    }
    const pourcentageDuRevenu = encaisse > 0 ? (masseSalarialeMontant / encaisse) * 100 : 0;

    // 4. Liste détaillée des retards cumulatifs (sans filtre de date).
    //    Membres INACTIF exclus : un départ ne se relance pas.
    const allLatePayments = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: debutAujourdhui },
        member: { status: { not: 'INACTIF' } }
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            sections: { select: { section: true } }
          }
        }
      },
      orderBy: { datePrevue: 'asc' }
    });

    const retardsMapped = allLatePayments.map(v => {
      const dateString = v.datePrevue.toISOString();
      return {
        id: v.id,
        membreId: v.membreId,
        membreNom: `${v.member.lastName || ''} ${v.member.firstName || ''}`.trim(),
        section: v.member.sections?.[0]?.section || '',
        montant: v.montant,
        date: dateString,
        joursRetard: Math.max(0, Math.floor((debutAujourdhui.getTime() - v.datePrevue.getTime()) / 86400000))
      };
    });

    const totalRetard = retardsMapped.reduce((sum, r) => sum + r.montant, 0);
    const nombreDossiersRetard = retardsMapped.length;

    // 5. Renouvellements échus : contrats terminés non renouvelés (membres
    //    ACTIFS) — à relancer au même titre que les versements en retard.
    const membresEchus = await prisma.member.findMany({
      where: { status: 'ACTIF', finContrat: { lt: debutAujourdhui } },
      include: { versements: true, sections: { select: { section: true } } },
      orderBy: { finContrat: 'asc' },
    });
    const renouvellementsEchus = membresEchus.map(m => {
      const paye = m.versements.filter(v => v.datePaiement).reduce((n, v) => n + v.montant, 0);
      return {
        membreId: m.id,
        membreNom: `${m.lastName || ''} ${m.firstName || ''}`.trim(),
        section: m.sections?.[0]?.section || '',
        finContrat: m.finContrat!.toISOString(),
        montant: m.montantFinal || 0,
        resteAncienContrat: Math.max(0, Math.round(((m.montantFinal || 0) - paye) * 100) / 100),
        telephone: m.parentPhone || m.phone || '',
        joursEchus: Math.max(0, Math.floor((debutAujourdhui.getTime() - m.finContrat!.getTime()) / 86400000)),
      };
    });
    const totalRenouvellements = renouvellementsEchus.reduce((n, r) => n + r.montant, 0);

    return sendSuccess(res, {
      revenus: { encaisse, enAttente, enRetard, total },
      parSection,
      presences: presencesList,
      masseSalariale: { montant: masseSalarialeMontant, moisComptes, pourcentageDuRevenu },
      retards: retardsMapped,
      totalRetard,
      nombreDossiersRetard,
      renouvellementsEchus,
      totalRenouvellements
    });

  } catch (error) {
    return sendError(res, 'Erreur de génération du rapport', 500);
  }
});

export default router;
