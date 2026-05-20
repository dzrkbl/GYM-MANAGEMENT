import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/api-response';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

const generateSchema = z.object({
  startDate: z.string() // expected format: YYYY-MM-DD
});

// POST /api/cours/generer-semaine
router.post('/generer-semaine', authenticate, requireRole(['ADMIN', 'SECTION_MANAGER']), async (req: Request, res: Response): Promise<any> => {
  try {
    const { startDate } = generateSchema.parse(req.query);
    const start = new Date(startDate);
    
    // Find all templates (courses where date is null)
    const templates = await prisma.course.findMany({
      where: { date: null }
    });

    let generatedCount = 0;

    for (let i = 0; i < 7; i++) {
       const currentDate = new Date(start);
       currentDate.setDate(currentDate.getDate() + i);
       const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 1 is Monday...

       // Filter templates for this day of week
       const dayTemplates = templates.filter(t => t.dayOfWeek === dayOfWeek);

       for (const template of dayTemplates) {
         // Create the instance if it doesn't already exist for this exact date and section/startTime
         const existing = await prisma.course.findFirst({
           where: {
             section: template.section,
             dayOfWeek: template.dayOfWeek,
             startTime: template.startTime,
             date: currentDate
           }
         });

         if (!existing) {
           await prisma.course.create({
             data: {
               section: template.section,
               dayOfWeek: template.dayOfWeek,
               startTime: template.startTime,
               endTime: template.endTime,
               capacity: template.capacity,
               coachId: template.coachId,
               date: currentDate
             }
           });
           generatedCount++;
         }
       }
    }

    return sendSuccess(res, { count: generatedCount, message: `${generatedCount} cours créés pour la semaine.` });
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la génération', 500);
  }
});

// POST /api/cours (utility to create a template)
router.post('/', authenticate, requireRole(['ADMIN']), async (req: Request, res: Response): Promise<any> => {
  try {
    const templateSchema = z.object({
      section: z.string(),
      dayOfWeek: z.number().min(0).max(6),
      startTime: z.string(),
      endTime: z.string(),
      capacity: z.number().optional().nullable(),
      coachId: z.string().optional().nullable(),
    });
    const data = templateSchema.parse(req.body);

    const course = await prisma.course.create({
      data: {
        ...data,
        date: null // explicitly null to make it a template
      }
    });
    return sendSuccess(res, course, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return sendError(res, 'Données invalides', 400, error.issues);
    return sendError(res, 'Erreur lors de la création du modèle de cours', 500);
  }
});

// GET /api/cours
router.get('/', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const { date } = req.query;
    
    let whereClause: any = { date: null, actif: true }; // Active templates
    
    if (date) {
      const d = new Date(date as string);
      whereClause.dayOfWeek = d.getDay();
    }

    const courses = await prisma.course.findMany({
      where: whereClause,
      include: { coach: { select: { firstName: true, lastName: true } } },
      orderBy: { startTime: 'asc' }
    });

    return sendSuccess(res, courses);
  } catch (error) {
    return sendError(res, 'Erreur de récupération des cours', 500);
  }
});

export default router;
