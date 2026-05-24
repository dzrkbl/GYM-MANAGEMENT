import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

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
    const reqMonth = req.query.month as string || new Date().toISOString().slice(0, 7); // YYYY-MM
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
    const reqMonth = req.query.month as string || new Date().toISOString().slice(0, 7); // YYYY-MM
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
    const now = new Date();
    const overdues = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: now }
      }
    });

    const count = overdues.length;
    const montantTotal = overdues.reduce((sum, p) => sum + p.montant, 0);

    return sendSuccess(res, { count, montantTotal });

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
       for (const s of m.sections) {
         parSection[s.section] = (parSection[s.section] || 0) + 1;
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
    
    // Retards
    const overdues = await prisma.paymentVersement.findMany({
      where: {
        datePaiement: null,
        datePrevue: { lt: now }
      }
    });
    const retardsCount = overdues.length;
    const retardsMontant = overdues.reduce((sum, p) => sum + p.montant, 0);

    // Membres
    const membres = await prisma.member.findMany({
       where: { status: 'ACTIF' },
       include: { sections: true }
    });
    const parSection: Record<string, number> = {};
    for (const m of membres) {
       const memberSections = new Set<string>();
       if (m.groupe) memberSections.add(m.groupe);
       for (const s of m.sections) {
         memberSections.add(s.section);
       }
       for (const sec of memberSections) {
         parSection[sec] = (parSection[sec] || 0) + 1;
       }
    }

    // Présences de la semaine (global approximation for dashboard)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday

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

    // Masse Salariale
    const activeCoachs = await prisma.user.findMany({
      where: { role: { in: ['COACH', 'SECTION_MANAGER'] }, actif: true }
    });
    const masseSalariale = activeCoachs.reduce((sum, c) => sum + (c.remuneration || 0), 0);

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
        montantTotal: retardsMontant
      },
      presences: {
        tauxCetteSemaine
      },
      masseSalariale
    });

  } catch (error) {
    return sendError(res, 'Erreur du dashboard résumé', 500);
  }
});

export default router;
