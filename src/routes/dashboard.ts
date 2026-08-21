import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { masseSalarialePourMois } from '../lib/finances';

const router = Router();

// Jour courant à Montréal (AAAA-MM-JJ) : le serveur tourne en UTC, où « new
// Date() » après 20 h de Montréal est déjà demain.
function aujourdhuiMontreal(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

// « En retard » du tableau de bord : impayés dont le jour d'échéance est passé
// (jour civil), membres INACTIF exclus — mêmes règles que la page Paiements.
function whereRetards() {
  return {
    datePaiement: null,
    datePrevue: { lt: new Date(aujourdhuiMontreal() + 'T00:00:00Z') },
    member: { status: { not: 'INACTIF' } },
  };
}

// Renouvellements échus : membres ACTIFS dont le contrat est terminé — ils
// doivent re-payer leur formule (c'est de l'argent à percevoir, invisible dans
// les versements puisque l'ancien échéancier est soldé).
async function renouvellementsEchus() {
  const membres = await prisma.member.findMany({
    where: { status: 'ACTIF', finContrat: { lt: new Date(aujourdhuiMontreal() + 'T00:00:00Z') } },
    include: { versements: true },
  });
  let montantARenouveler = 0;
  let resteAnciensContrats = 0;
  for (const m of membres) {
    montantARenouveler += m.montantFinal || 0;
    const paye = m.versements.filter((v) => v.datePaiement).reduce((n, v) => n + v.montant, 0);
    const reste = Math.round(((m.montantFinal || 0) - paye) * 100) / 100;
    if (reste > 0) resteAnciensContrats += reste;
  }
  return {
    count: membres.length,
    montantARenouveler: Math.round(montantARenouveler * 100) / 100,
    resteAnciensContrats: Math.round(resteAnciensContrats * 100) / 100,
  };
}

// Help function for revenues using paymentVersement
const getRevenusForMonth = async (year: number, month: number) => {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);

  const versements = await prisma.paymentVersement.findMany({
    where: {
      datePaiement: { gte: startDate, lte: endDate }
    },
    select: {
      montant: true,
      member: {
        select: {
          sections: { select: { section: true } }
        }
      }
    }
  });

  const total = versements.reduce((sum, v) => sum + v.montant, 0);

  const bySection = versements.reduce((acc, v) => {
    const s = v.member?.sections?.[0]?.section || 'INCONNU';
    acc[s] = (acc[s] || 0) + v.montant;
    return acc;
  }, {} as Record<string, number>);

  return { total, section: bySection, bySection };
};

// GET /api/dashboard/revenus
router.get('/revenus', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const reqMonth = req.query.month as string || aujourdhuiMontreal().slice(0, 7); // AAAA-MM (Montréal)
    const [yearStr, monthStr] = reqMonth.split('-');
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1; // 0-based

    const moisActuel = await getRevenusForMonth(year, monthIndex);
    
    // Mois précédent
    let prevYear = year;
    let prevMonthIndex = monthIndex - 1;
    if (prevMonthIndex < 0) {
      prevMonthIndex = 11;
      prevYear -= 1;
    }
    const moisPrecedent = await getRevenusForMonth(prevYear, prevMonthIndex);

    const variation = moisActuel.total - moisPrecedent.total;

    return sendSuccess(res, { moisActuel, moisPrecedent, variation });
  } catch (error) {
    return sendError(res, 'Erreur lors de la récupération des revenus', 500);
  }
});

// GET /api/dashboard/revenus/section
router.get('/revenus/section', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const reqMonth = req.query.month as string || aujourdhuiMontreal().slice(0, 7); // AAAA-MM (Montréal)
    const [yearStr, monthStr] = reqMonth.split('-');
    
    const revenues = await getRevenusForMonth(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1);
    
    return sendSuccess(res, { bySection: revenues.section });
  } catch (error) {
    return sendError(res, 'Erreur', 500);
  }
});

// GET /api/dashboard/retards
router.get('/retards', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const overdues = await prisma.paymentVersement.findMany({ where: whereRetards() });

    const count = new Set(overdues.map((p) => p.membreId)).size;
    const montantTotal = overdues.reduce((sum, p) => sum + p.montant, 0);

    return sendSuccess(res, { count, versements: overdues.length, montantTotal });

  } catch (error) {
    return sendError(res, 'Erreur', 500);
  }
});

// GET /api/dashboard/membres
router.get('/membres', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
   try {
     const membres = await prisma.member.findMany({
       where: { status: 'ACTIF' },
       include: { sections: true }
     });

     let total = membres.length;
     const parSection: Record<string, number> = {};

     for (const m of membres) {
       const sectionName = m.sections[0]?.section;
       if (sectionName) {
         parSection[sectionName] = (parSection[sectionName] || 0) + 1;
       }
     }

     return sendSuccess(res, { total, parSection });
   } catch (error) {
     return sendError(res, 'Erreur', 500);
   }
});

// GET /api/dashboard/resume
router.get('/resume', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const now = new Date();
    
    // Revenus
    const moisActuel = await getRevenusForMonth(now.getFullYear(), now.getMonth());
    let prevYear = now.getFullYear();
    let prevMonthIndex = now.getMonth() - 1;
    if (prevMonthIndex < 0) { prevMonthIndex = 11; prevYear -= 1; }
    const moisPrecedent = await getRevenusForMonth(prevYear, prevMonthIndex);
    
    // Retards (mêmes règles que la page Paiements) + renouvellements échus
    const overdues = await prisma.paymentVersement.findMany({ where: whereRetards() });
    const retardsCount = new Set(overdues.map((p) => p.membreId)).size;
    const retardsMontant = overdues.reduce((sum, p) => sum + p.montant, 0);
    const renouvellements = await renouvellementsEchus();

    // Membres
    const membres = await prisma.member.findMany({
       where: { status: 'ACTIF' },
       include: { sections: true }
    });
    const parSection: Record<string, number> = {};
    for (const m of membres) {
       const sectionName = m.sections[0]?.section;
       if (sectionName) {
         parSection[sectionName] = (parSection[sectionName] || 0) + 1;
       }
    }

    // Présences de la semaine : du lundi 00 h au dimanche 23 h 59 (jours civils
    // de Montréal). L'ancien calcul gardait l'heure courante (le lundi matin
    // disparaissait dès l'après-midi) et, le dimanche, visait la semaine SUIVANTE.
    const [ay, am, aj] = aujourdhuiMontreal().split('-').map(Number);
    const ref = new Date(Date.UTC(ay, am - 1, aj));
    const decalage = (ref.getUTCDay() + 6) % 7; // 0 = lundi
    const weekStart = new Date(ref);
    weekStart.setUTCDate(ref.getUTCDate() - decalage);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const attendances = await prisma.attendance.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { course: true }
    });
    
    // Group weekly attendances by session (courseId + date) to calculate rates per section
    const sessionsMap = new Map<string, { courseId: string; dateStr: string; sectionName: string; attendCount: number }>();
    for (const a of attendances) {
      const dateKey = a.date instanceof Date ? a.date.toISOString().split('T')[0] : new Date(a.date).toISOString().split('T')[0];
      const sessionKey = `${a.courseId}_${dateKey}`;
      const existingSession = sessionsMap.get(sessionKey);
      if (existingSession) {
        existingSession.attendCount += 1;
      } else {
        sessionsMap.set(sessionKey, {
          courseId: a.courseId,
          dateStr: dateKey,
          sectionName: a.course?.section || '',
          attendCount: 1
        });
      }
    }

    let totalPossibleAttendances = 0;
    for (const session of sessionsMap.values()) {
      const secCount = parSection[session.sectionName] || 0;
      totalPossibleAttendances += secCount || 1;
    }

    let tauxCetteSemaine = 0;
    if (totalPossibleAttendances > 0) {
      tauxCetteSemaine = Math.round((attendances.length / totalPossibleAttendances) * 100);
      if (tauxCetteSemaine > 100) tauxCetteSemaine = 100;
    }

    // Masse salariale : MÊME source que le Module financier (override du mois
    // sinon « Gérer les coachs ») — le Dashboard affichait un 3e chiffre.
    const masseSalariale = await masseSalarialePourMois(now.getMonth() + 1, now.getFullYear());

    return sendSuccess(res, {
      revenus: {
        moisActuel: moisActuel.total,
        moisPrecedent: moisPrecedent.total,
        variation: moisActuel.total - moisPrecedent.total
      },
      membres: {
        total: membres.length,
        parSection
      },
      retards: {
        count: retardsCount,
        versements: overdues.length,
        montantTotal: retardsMontant
      },
      renouvellements,
      presences: {
        tauxCetteSemaine
      },
      masseSalariale
    });

  } catch (error) {
    return sendError(res, 'Erreur du dashboard résumé', 500);
  }
});

// GET /api/dashboard/kpis — indicateurs de pilotage
router.get('/kpis', authenticate, requireRole(['ADMIN']), async (_req: Request, res: Response): Promise<any> => {
  try {
    const now = new Date();
    const finJour = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    // MRR : équivalent mensuel des cotisations des membres actifs dont le
    // contrat COURT ENCORE (un contrat expiré ne rapporte plus : il est dans
    // « Renouvellements échus », pas dans le récurrent).
    const debutJour = new Date(aujourdhuiMontreal() + 'T00:00:00Z');
    const actifs = await prisma.member.findMany({
      where: { status: 'ACTIF', OR: [{ finContrat: null }, { finContrat: { gte: debutJour } }] },
      select: { plan: true, montantFinal: true },
    });
    let mrr = 0;
    for (const m of actifs) {
      const montant = m.montantFinal || 0;
      if (m.plan === 'ANNUEL') mrr += montant / 12;
      else if (m.plan === 'TRIMESTRIEL') mrr += montant / 3;
      else if (m.plan === 'MENSUEL') mrr += montant;
    }
    mrr = Math.round(mrr * 100) / 100;

    // Rétention : actifs / (actifs + inactifs). EN_ATTENTE exclus (pas encore démarrés).
    const [nbActifs, nbInactifs] = await Promise.all([
      prisma.member.count({ where: { status: 'ACTIF' } }),
      prisma.member.count({ where: { status: 'INACTIF' } }),
    ]);
    const retentionPct = (nbActifs + nbInactifs) > 0
      ? Math.round((nbActifs / (nbActifs + nbInactifs)) * 1000) / 10
      : 0;

    // Recouvrement : parmi les versements échus, part déjà encaissée (en montant).
    const echus = await prisma.paymentVersement.findMany({
      where: { datePrevue: { lte: finJour(now) } },
      select: { montant: true, datePaiement: true },
    });
    let totalEchu = 0, encaisseEchu = 0;
    for (const v of echus) { totalEchu += v.montant; if (v.datePaiement) encaisseEchu += v.montant; }
    const recouvrementPct = totalEchu > 0 ? Math.round((encaisseEchu / totalEchu) * 1000) / 10 : 100;

    // Prévision de trésorerie : 3 prochains mois (versements prévus, à partir du mois courant).
    const moisLabels = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const previsions = [];
    for (let i = 0; i < 3; i++) {
      const debut = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const fin = new Date(now.getFullYear(), now.getMonth() + i + 1, 0, 23, 59, 59);
      // Versements planifiés du mois (les membres INACTIF n'apportent plus rien).
      const vers = await prisma.paymentVersement.findMany({
        where: { datePrevue: { gte: debut, lte: fin }, member: { status: { not: 'INACTIF' } } },
        select: { montant: true, datePaiement: true },
      });
      let total = 0, encaisse = 0;
      for (const v of vers) { total += v.montant; if (v.datePaiement) encaisse += v.montant; }
      // Renouvellements attendus : contrats de membres ACTIFS se terminant ce
      // mois-là — au renouvellement, la formule est re-payée (montantFinal).
      const finissants = await prisma.member.findMany({
        where: { status: 'ACTIF', finContrat: { gte: debut, lte: fin } },
        select: { montantFinal: true },
      });
      const renouvellementsAttendus = finissants.reduce((n, m) => n + (m.montantFinal || 0), 0);
      previsions.push({
        label: `${moisLabels[debut.getMonth()]} ${debut.getFullYear()}`,
        total: Math.round(total * 100) / 100,
        encaisse: Math.round(encaisse * 100) / 100,
        aVenir: Math.round((total - encaisse) * 100) / 100,
        renouvellements: Math.round(renouvellementsAttendus * 100) / 100,
      });
    }

    return sendSuccess(res, {
      mrr,
      retention: { pct: retentionPct, actifs: nbActifs, inactifs: nbInactifs },
      recouvrement: { pct: recouvrementPct, encaisse: Math.round(encaisseEchu * 100) / 100, total: Math.round(totalEchu * 100) / 100 },
      previsions,
    });
  } catch (error) {
    return sendError(res, 'Erreur lors du calcul des KPIs', 500);
  }
});

export default router;
