import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const pointerSchema = z.object({
  courseId: z.string(),
  date: z.string(), // YYYY-MM-DD
  memberIds: z.union([z.string(), z.array(z.string())]),
});

// POST /api/presences/pointer
router.post('/pointer', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const data = pointerSchema.parse(req.body);
    const date = new Date((data.date as string) + 'T12:00:00');
    
    // Normalize memberIds to an array
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [data.memberIds];

    // Insertion en masse ; la contrainte unique (memberId, courseId, date) évite les doublons.
    const result = await prisma.attendance.createMany({
      data: memberIds.map((memberId) => ({
        memberId,
        courseId: data.courseId,
        date,
        status: 'PRESENT',
      })),
      skipDuplicates: true,
    });

    return sendSuccess(res, { pointed: result.count, skipped: memberIds.length - result.count });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors du pointage', 500);
  }
});

// GET /api/presences
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { courseId, date } = req.query;
    
    if (!courseId || !date) {
      return sendError(res, 'courseId et date sont requis', 400);
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        courseId: courseId as string,
        date: new Date((date as string) + 'T12:00:00')
      },
      include: {
        member: { select: { firstName: true, lastName: true } }
      }
    });

    return sendSuccess(res, attendances);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des présences', 500);
  }
});

// GET /api/presences/membre/:id
router.get('/membre/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const attendances = await prisma.attendance.findMany({
      where: { memberId: req.params.id },
      include: {
        course: { select: { section: true } }
      },
      orderBy: { date: 'desc' }
    });

    return sendSuccess(res, attendances);
  } catch (error) {
    return sendError(res, 'Erreur de récupération de l\'historique', 500);
  }
});

// GET /api/presences/stats
router.get('/stats', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { section, month } = req.query;
    
    if (!section || !month) {
      return sendError(res, 'section et month sont requis (ex: month=2026-06)', 400);
    }

    const [year, m] = (month as string).split('-').map(Number);
    const startDate = new Date(year, m - 1, 1, 12, 0, 0);
    const endDate = new Date(year, m, 0, 12, 0, 0);

    // Get all completed courses for this section in the month that have attendees
    // A course session exists explicitly or via attedance links
    const attendances = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        course: { section: section as string }
      }
    });
    
    const uniqueCourses = new Set(attendances.map(a => `${a.courseId}_${a.date.toISOString()}`));
    
    const totalCours = uniqueCourses.size;
    const totalPresences = attendances.length;

    // Approximated tauxMoyen... we'd need total members in the section to calculate precisely,
    // let's just do (totalPresences / (totalCours * section_members)) * 100
    // Fetch member count in section
    const activeSectionMembers = await prisma.member.count({
      where: {
        status: 'ACTIF',
        sections: { some: { section: section as string } }
      }
    });

    let tauxMoyen = 0;
    if (totalCours > 0 && activeSectionMembers > 0) {
       const potentialMaxPresences = totalCours * activeSectionMembers;
       tauxMoyen = Math.round((totalPresences / potentialMaxPresences) * 100);
    }

    return sendSuccess(res, { totalCours, totalPresences, tauxMoyen });
  } catch (error) {
    return sendError(res, 'Erreur de calcul des stats', 500);
  }
});

export default router;
