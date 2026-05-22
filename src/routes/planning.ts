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
      where: { actif: true },
      include: { coach: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [
        { startTime: 'asc' }
      ]
    });
    return sendSuccess(res, courses);
  } catch (error) {
    console.error('Error fetching planning:', error);
    return sendError(res, 'Erreur de récupération du planning', 500);
  }
});

const DAYS_VALID = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

const courseSchema = z.object({
  section: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  coachId: z.string().optional().nullable(),
  jours: z.array(z.string()).refine(val => val.length > 0 && val.every(v => DAYS_VALID.includes(v.toUpperCase())), {
    message: "jours doit être un tableau non vide contenant LUN, MAR, MER, JEU, VEN, SAM ou DIM"
  }),
  actif: z.boolean().default(true)
});

// POST /api/planning
router.post('/', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = courseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        section: data.section,
        startTime: data.startTime,
        endTime: data.endTime,
        coachId: data.coachId || null,
        jours: data.jours.map(j => j.toUpperCase()),
        actif: data.actif
      },
      include: { coach: { select: { id: true, firstName: true, lastName: true } } }
    });
    return sendSuccess(res, course, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error creating planning:', error);
    return sendError(res, 'Erreur de création', 500);
  }
});

// PUT /api/planning/:id
router.put('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const data = courseSchema.partial().parse(req.body);
    
    const updateData: any = { ...data };
    if (data.jours) {
      updateData.jours = data.jours.map(j => j.toUpperCase());
    }

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: updateData,
      include: { coach: { select: { id: true, firstName: true, lastName: true } } }
    });
    return sendSuccess(res, course);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    console.error('Error updating planning:', error);
    return sendError(res, 'Erreur de modification', 500);
  }
});

// DELETE /api/planning/:id (Soft delete)
router.delete('/:id', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    await prisma.course.update({
      where: { id: req.params.id },
      data: { actif: false }
    });
    return sendSuccess(res, { message: 'Cours désactivé' });
  } catch (error) {
    console.error('Error deleting planning:', error);
    return sendError(res, 'Erreur de suppression', 500);
  }
});

// GET /api/planning/semaine
router.get('/semaine', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const courses = await prisma.course.findMany({
      where: { actif: true },
      include: { coach: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [
        { startTime: 'asc' }
      ]
    });
    return sendSuccess(res, courses);
  } catch (error) {
    console.error('Error fetching planning weekly:', error);
    return sendError(res, 'Erreur de récupération', 500);
  }
});

export default router;
