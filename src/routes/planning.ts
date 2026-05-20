import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

// GET /api/planning
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const courses = await prisma.course.findMany({
      where: { date: null }, // Only recurrent courses
      include: { coach: { select: { firstName: true, lastName: true } } },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });
    return sendSuccess(res, courses);
  } catch (error) {
    return sendError(res, 'Erreur de récupération du planning', 500);
  }
});

const courseSchema = z.object({
  section: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  coachId: z.string().optional().nullable(),
  actif: z.boolean().default(true)
});

// POST /api/planning
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = courseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        section: data.section,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        coachId: data.coachId,
        actif: data.actif,
        date: null // This is a recurrent template
      }
    });
    return sendSuccess(res, course, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de création', 500);
  }
});

// PUT /api/planning/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = courseSchema.partial().parse(req.body);
    const course = await prisma.course.update({
      where: { id: req.params.id },
      data
    });
    return sendSuccess(res, course);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/planning/:id (Soft delete or hard delete if no dependencies? Soft delete by setting actif=false is requested)
router.delete('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.course.update({
      where: { id: req.params.id },
      data: { actif: false }
    });
    return sendSuccess(res, { message: 'Cours désactivé' });
  } catch (error) {
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// GET /api/planning/semaine
router.get('/semaine', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const courses = await prisma.course.findMany({
      where: { date: null, actif: true },
      include: { coach: { select: { firstName: true, lastName: true } } },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });
    return sendSuccess(res, courses);
  } catch (error) {
    return sendError(res, 'Erreur de récupération', 500);
  }
});

export default router;
